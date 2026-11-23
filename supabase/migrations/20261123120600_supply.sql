-- =============================================================================
-- Dated farmer-confirmed supply (master §4.2, ADR-0004, ADR-0007)
--
-- One active record per supplier + product + business date. Quantity is in
-- the product base unit. Expiry is COMPUTED from business_date vs the
-- Asia/Kolkata business date — no stored "expired" status, no carry-forward.
-- Receipt linkage (received_against_record) arrives with receiving in Phase 4.
-- =============================================================================

-- Controlled list of confirmation sources. Values are a founder decision;
-- rows exist only in the dev seed until approved.
create table public.supply_confirmation_sources (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  label text not null check (char_length(label) <= 80 and char_length(btrim(label)) >= 1),
  is_active boolean not null default true,
  display_order integer not null default 0
);
comment on table public.supply_confirmation_sources is
  'How a farmer confirmation was obtained. Founder-approved list; dev seed contains placeholders only.';

create type public.supply_status as enum ('active', 'inactive');

create table public.supply_confirmations (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id),
  product_id uuid not null references public.products (id),
  business_date date not null,
  -- Unconstrained NUMERIC so over-precision input is REJECTED (trigger), never silently rounded.
  quantity numeric not null check (quantity >= 0 and quantity < 1000000000 and quantity = round(quantity, 3)),
  unit text not null references public.units (code),
  confirmation_source text not null references public.supply_confirmation_sources (code),
  confirmed_by uuid not null references auth.users (id),
  confirmed_at timestamptz not null,
  note text check (note is null or char_length(note) <= 1000),
  evidence_storage_key text check (
    evidence_storage_key is null
    or (evidence_storage_key ~ '^[a-z0-9][a-z0-9/_.-]+$' and char_length(evidence_storage_key) between 3 and 300 and evidence_storage_key !~ '\.\.')
  ),
  has_evidence boolean generated always as (evidence_storage_key is not null) stored,
  status public.supply_status not null default 'active',
  change_reason text check (change_reason is null or char_length(change_reason) <= 500 and char_length(btrim(change_reason)) >= 1),
  deactivated_at timestamptz,
  version integer not null default 1,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supply_confirmations_inactive_consistent check (
    (status = 'active' and deactivated_at is null)
    or (status = 'inactive' and deactivated_at is not null and change_reason is not null)
  )
);
comment on table public.supply_confirmations is
  'Farmer-confirmed supply for one business date. A planning signal, NOT warehouse stock. Never carried forward.';
comment on column public.supply_confirmations.unit is
  'Always equals the product base unit (alternative entry units are converted exactly by the server before insert).';

-- One ACTIVE record per supplier + product + business date (master §4.2).
create unique index supply_confirmations_one_active_idx
  on public.supply_confirmations (supplier_id, product_id, business_date)
  where status = 'active';

-- Aggregation path for the availability function.
create index supply_confirmations_availability_idx
  on public.supply_confirmations (business_date, product_id)
  where status = 'active' and quantity > 0;
create index supply_confirmations_supplier_idx
  on public.supply_confirmations (supplier_id, business_date desc);
create index supply_confirmations_product_idx
  on public.supply_confirmations (product_id, business_date desc);

create function private.validate_supply_confirmation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_product record;
  v_supplier_status public.supplier_status;
  v_reason text := private.request_setting('app.reason');
begin
  select p.base_unit, p.quantity_precision, p.is_active
    into v_product
    from public.products p where p.id = new.product_id;

  if new.unit <> v_product.base_unit then
    raise exception 'unit % must equal the product base unit %', new.unit, v_product.base_unit
      using errcode = '23514';
  end if;

  if new.quantity <> round(new.quantity, v_product.quantity_precision) then
    raise exception 'quantity exceeds product precision (% decimals)', v_product.quantity_precision
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if new.quantity <= 0 then
      raise exception 'new supply must have a quantity greater than zero'
        using errcode = '23514';
    end if;
    if new.business_date < public.current_business_date() then
      raise exception 'supply cannot be recorded for a past business date'
        using errcode = '23514';
    end if;
    if not exists (select 1 from public.staff_profiles sp where sp.user_id = new.confirmed_by and sp.is_active) then
      raise exception 'confirmed_by must be an active staff member' using errcode = '23514';
    end if;
  else
    if new.supplier_id is distinct from old.supplier_id
       or new.product_id is distinct from old.product_id
       or new.business_date is distinct from old.business_date then
      raise exception 'supplier, product and business date cannot change; deactivate and create a new record'
        using errcode = '23514';
    end if;
    -- Every edit needs a FRESH reason (dev default; WEB_ADMIN §8): either the
    -- transaction's app.reason (copied in) or a new change_reason value.
    if v_reason is not null then
      new.change_reason := left(v_reason, 500);
    elsif new.change_reason is null or new.change_reason is not distinct from old.change_reason then
      raise exception 'a new change reason is required for every supply change'
        using errcode = '23514';
    end if;
    -- Expired records are history: only deactivation is allowed.
    if old.business_date < public.current_business_date()
       and (new.quantity is distinct from old.quantity or (new.status = 'active' and old.status <> 'active')) then
      raise exception 'supply for a past business date cannot be changed'
        using errcode = '23514';
    end if;
    if new.confirmed_by is distinct from old.confirmed_by
       and not exists (select 1 from public.staff_profiles sp where sp.user_id = new.confirmed_by and sp.is_active) then
      raise exception 'confirmed_by must be an active staff member' using errcode = '23514';
    end if;
  end if;

  -- An active record may be created, reactivated or changed only while the
  -- supplier and product are active (deactivation is always allowed).
  if new.status = 'active' and (
       tg_op = 'INSERT' or old.status <> 'active' or new.quantity is distinct from old.quantity
  ) then
    select s.status into v_supplier_status from public.suppliers s where s.id = new.supplier_id;
    if v_supplier_status <> 'active' then
      raise exception 'supplier must be active to record supply (status %)', v_supplier_status
        using errcode = '23514';
    end if;
    if not v_product.is_active then
      raise exception 'product must be active to record supply' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger supply_confirmations_validate
  before insert or update on public.supply_confirmations
  for each row execute function private.validate_supply_confirmation();

create trigger supply_confirmations_bump_version
  before insert or update on public.supply_confirmations
  for each row execute function private.bump_version();

create trigger supply_confirmations_no_delete
  before delete on public.supply_confirmations
  for each row execute function private.forbid_delete();

create trigger supply_confirmations_no_truncate
  before truncate on public.supply_confirmations
  for each statement execute function private.forbid_truncate();

create trigger supply_confirmations_immutable_columns
  before update on public.supply_confirmations
  for each row execute function private.forbid_column_change('created_at', 'created_by');

create trigger supply_confirmations_audit
  after insert or update or delete on public.supply_confirmations
  for each row execute function private.audit_row_change('id', 'evidence_storage_key');

-- -----------------------------------------------------------------------------
-- RLS: supply readable by super_admin, operations_admin, viewer (WEB_ADMIN §3).
-- -----------------------------------------------------------------------------
alter table public.supply_confirmation_sources enable row level security;
alter table public.supply_confirmations enable row level security;

revoke all on public.supply_confirmation_sources, public.supply_confirmations from anon, authenticated;
grant select on public.supply_confirmation_sources to authenticated;
-- Column grant: the private evidence key is never readable by clients.
grant select (
  id, supplier_id, product_id, business_date, quantity, unit, confirmation_source, confirmed_by,
  confirmed_at, note, has_evidence, status, change_reason, deactivated_at, version,
  created_by, updated_by, created_at, updated_at
) on public.supply_confirmations to authenticated;

create function private.can_read_supply()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_role(array['super_admin', 'operations_admin', 'viewer']::public.app_role[]);
$$;
revoke all on function private.can_read_supply() from public;
grant execute on function private.can_read_supply() to authenticated, service_role;

create policy supply_confirmation_sources_select on public.supply_confirmation_sources
  for select to authenticated using ((select private.can_read_supply()));
create policy supply_confirmations_select on public.supply_confirmations
  for select to authenticated using ((select private.can_read_supply()));
