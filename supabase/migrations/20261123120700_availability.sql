-- =============================================================================
-- Shared availability function — MVP form (master §1.1, ADR-0007)
--
--   ATP(product, business_date, zone) =
--     max(0, eligible_on_hand + open_confirmed_supply − active_reservations)
--
-- Phase 2/3 (MVP): no receiving and no reservations exist yet, so
-- eligible_on_hand = 0 and active_reservations = 0 and ATP reduces to
--   SUM(active, valid farmer-confirmed quantities for product and date).
-- Phase 4 adds batches/receipt conversion and Phase 6 adds reservations by
-- REPLACING private.product_availability_core(); signature and output stay fixed.
--
-- This is the ONLY availability implementation:
--   private.product_availability_core()  — logic; no client EXECUTE. Trusted
--                                          server code (e.g. a future
--                                          create_order RPC) calls it directly.
--   public.product_availability()        — authorized wrapper (supply readers
--                                          + service_role for Edge Functions)
--   public.sku_availability()            — per-SKU view of the same pool
-- =============================================================================

create function private.product_availability_core(
  p_business_date date,
  p_zone_id uuid default null,
  p_product_ids uuid[] default null
)
returns table (
  product_id uuid,
  base_unit text,
  eligible_on_hand numeric,
  open_confirmed_supply numeric,
  active_reservations numeric,
  atp numeric,
  contributing_supplier_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- p_zone_id: at launch every zone shares one pool, so results do not depend
  -- on it. Zone validation is done by the calling Edge Function (Phase 5).
  if p_business_date is null then
    raise exception 'p_business_date is required' using errcode = '22004';
  end if;

  -- Unconstrained NUMERIC totals: a large sum can never overflow the result
  -- type and take availability down for every product.
  return query
  with supply as (
    select c.product_id, sum(c.quantity) as open_qty, count(distinct c.supplier_id)::integer as suppliers
    from public.supply_confirmations c
    join public.suppliers s on s.id = c.supplier_id
    where c.business_date = p_business_date
      -- Expired records never count: no past business dates, no carry-forward.
      and c.business_date >= public.current_business_date()
      and c.status = 'active'
      and c.quantity > 0
      and s.status = 'active'
    group by c.product_id
  )
  select
    p.id,
    p.base_unit,
    0::numeric                              as eligible_on_hand,
    coalesce(su.open_qty, 0)::numeric       as open_confirmed_supply,
    0::numeric                              as active_reservations,
    greatest(0, coalesce(su.open_qty, 0))   as atp,
    coalesce(su.suppliers, 0)               as contributing_supplier_count
  from public.products p
  left join supply su on su.product_id = p.id
  where p.is_active
    and (p_product_ids is null or p.id = any (p_product_ids))
  order by p.display_order, p.name;
end;
$$;
revoke all on function private.product_availability_core(date, uuid, uuid[]) from public, anon, authenticated;
grant execute on function private.product_availability_core(date, uuid, uuid[]) to service_role;

-- Who may read availability: farmer-supply readers (WEB_ADMIN §3: super_admin,
-- operations_admin, viewer) and service_role (customer Edge Functions, which
-- expose only status + maxOrderable). Finance, dispatch, support, rider and
-- customers are refused.
create function private.can_read_availability()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.role(), '') = 'service_role' or private.can_read_supply();
$$;
revoke all on function private.can_read_availability() from public, anon;
grant execute on function private.can_read_availability() to authenticated, service_role;

create function public.product_availability(
  p_business_date date,
  p_zone_id uuid default null,
  p_product_ids uuid[] default null
)
returns table (
  product_id uuid,
  base_unit text,
  eligible_on_hand numeric,
  open_confirmed_supply numeric,
  active_reservations numeric,
  atp numeric,
  contributing_supplier_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_read_availability() then
    raise exception 'not authorized to read availability' using errcode = '42501';
  end if;
  return query select * from private.product_availability_core(p_business_date, p_zone_id, p_product_ids);
end;
$$;
comment on function public.product_availability(date, uuid, uuid[]) is
  'Single source of availability (ADR-0007). Base-unit quantities per product; MVP form (on-hand and reservations are 0 until Phases 4/6).';

revoke all on function public.product_availability(date, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.product_availability(date, uuid, uuid[]) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Per-SKU view of the same pool (ADR-0006 §4):
--   maxOrderable = largest n with  n ≤ floor(ATP / pack_quantity),
--                  n ≤ max_order_packs (if set), n ≥ min_order_packs,
--                  (n − min_order_packs) divisible by order_step_packs
--   status: unavailable (maxOrderable = 0) | limited (0 < ATP ≤ threshold) | available
-- Raw ATP is returned for staff; customer Edge Functions must expose only
-- availabilityStatus + maxOrderable (ADR-0003).
-- -----------------------------------------------------------------------------
create function public.sku_availability(
  p_business_date date,
  p_zone_id uuid default null,
  p_product_ids uuid[] default null
)
returns table (
  sku_id uuid,
  product_id uuid,
  sku_code text,
  pack_quantity numeric,
  price_paise bigint,
  is_listable boolean,
  product_atp numeric,
  max_orderable integer,
  availability_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_read_availability() then
    raise exception 'not authorized to read availability' using errcode = '42501';
  end if;

  return query
  with pool as (
    select a.product_id, a.atp
    from private.product_availability_core(p_business_date, p_zone_id, p_product_ids) a
  ),
  packs as (
    select
      k.id, k.product_id, k.sku_code, k.pack_quantity, k.price_paise,
      (p.is_listable and k.is_active) as listable,
      pool.atp,
      p.low_supply_threshold,
      k.min_order_packs, k.max_order_packs, k.order_step_packs,
      -- numeric arithmetic, capped before any integer cast
      least(floor(pool.atp / k.pack_quantity), coalesce(k.max_order_packs, 2147483647)::numeric) as cap
    from public.product_skus k
    join public.products p on p.id = k.product_id
    join pool on pool.product_id = k.product_id
    where k.is_active
  )
  select
    packs.id,
    packs.product_id,
    packs.sku_code,
    packs.pack_quantity,
    packs.price_paise,
    packs.listable,
    packs.atp,
    m.max_orderable,
    case
      when m.max_orderable = 0 then 'unavailable'
      when packs.low_supply_threshold is not null and packs.atp <= packs.low_supply_threshold then 'limited'
      else 'available'
    end
  from packs
  cross join lateral (
    select case
      when packs.cap < packs.min_order_packs then 0
      else (packs.min_order_packs
            + floor((packs.cap - packs.min_order_packs) / packs.order_step_packs) * packs.order_step_packs)::integer
    end as max_orderable
  ) m
  order by packs.product_id, packs.pack_quantity;
end;
$$;
comment on function public.sku_availability(date, uuid, uuid[]) is
  'Per-SKU availability derived from the shared product pool (ADR-0006/0007). Same authorization as product_availability.';

revoke all on function public.sku_availability(date, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.sku_availability(date, uuid, uuid[]) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Final privilege sweep for everything created in Phase 2 (defence in depth):
-- no PUBLIC/anon EXECUTE on any function, no TRUNCATE for any API role.
-- Functions needed by roles were granted explicitly above.
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon;
revoke truncate on all tables in schema public from anon, authenticated, service_role;
