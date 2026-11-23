-- =============================================================================
-- Catalog (master §6, ADR-0006): units, categories, products (base unit),
-- product_skus (fixed packs priced in paise), images, SKU price history.
--
-- Only unit reference data is created here: the unit codes named by the
-- specs (g, kg, piece, bunch, pack) and the exact g↔kg factor. Categories,
-- products, SKUs and prices are founder decisions (dev-only seed).
-- =============================================================================

create type public.unit_dimension as enum ('mass', 'count');

create table public.units (
  code text primary key check (code ~ '^[a-z][a-z_]{0,15}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  dimension public.unit_dimension not null,
  -- Factor to this dimension's canonical unit (mass → kg, count → itself).
  -- NULL for count units that are not interchangeable (a bunch is not a piece).
  to_canonical_factor numeric(18, 9) check (to_canonical_factor is null or to_canonical_factor > 0),
  is_base_unit_allowed boolean not null default true,
  is_sale_unit_allowed boolean not null default true,
  is_active boolean not null default true
);
comment on table public.units is
  'Controlled unit codes. Quantities are always stored with an explicit unit; unlike units are never summed (ADR-0006).';

insert into public.units (code, display_name, dimension, to_canonical_factor, is_base_unit_allowed, is_sale_unit_allowed) values
  ('kg',    'kg',    'mass',  1,     true,  true),
  ('g',     'g',     'mass',  0.001, true,  true),
  ('piece', 'piece', 'count', null,  true,  true),
  ('bunch', 'bunch', 'count', null,  true,  true),
  ('pack',  'pack',  'count', null,  false, true);

-- Exact conversion between two units, or NULL when they are not convertible.
create function public.convert_quantity(p_quantity numeric, p_from_unit text, p_to_unit text)
returns numeric
language sql
stable
set search_path = ''
as $$
  select case
    when p_from_unit = p_to_unit then p_quantity
    else (
      select p_quantity * f.to_canonical_factor / t.to_canonical_factor
      from public.units f
      join public.units t on t.dimension = f.dimension
      where f.code = p_from_unit
        and t.code = p_to_unit
        and f.to_canonical_factor is not null
        and t.to_canonical_factor is not null
    )
  end;
$$;
revoke all on function public.convert_quantity(numeric, text, text) from public;
grant execute on function public.convert_quantity(numeric, text, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9_-]{1,49}$'),
  name text not null unique check (char_length(name) <= 100 and char_length(btrim(name)) >= 1),
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function private.set_updated_at();

create trigger categories_immutable_code
  before update on public.categories
  for each row execute function private.forbid_column_change('code', 'created_at');

-- -----------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  product_code text not null unique check (product_code ~ '^[A-Z0-9][A-Z0-9_-]{1,49}$'),
  category_id uuid not null references public.categories (id),
  name text not null check (char_length(name) <= 120 and char_length(btrim(name)) >= 2),
  local_name text check (local_name is null or char_length(local_name) <= 120 and char_length(btrim(local_name)) >= 1),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  description text check (description is null or char_length(description) <= 2000),
  base_unit text not null references public.units (code),
  quantity_precision smallint not null default 3 check (quantity_precision between 0 and 3),
  low_supply_threshold numeric check (
    low_supply_threshold is null
    or (low_supply_threshold >= 0 and low_supply_threshold < 1000000000 and low_supply_threshold = round(low_supply_threshold, 3))
  ),
  is_active boolean not null default true,
  is_listable boolean not null default false,
  display_order integer not null default 0,
  version integer not null default 1,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.products is
  'Inventory/availability item in a base unit. Not customer-visible unless active AND listable. Catalog values are founder decisions.';
comment on column public.products.is_listable is
  'Manual customer-visibility switch (e.g. quality/operational hold). Defaults to false.';

create index products_category_idx on public.products (category_id);
create index products_name_trgm_idx on public.products using gin (name extensions.gin_trgm_ops);

create function private.validate_product()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.units u where u.code = new.base_unit and u.is_base_unit_allowed) then
    raise exception 'unit % is not allowed as a base unit', new.base_unit using errcode = '23514';
  end if;
  if new.low_supply_threshold is not null
     and new.low_supply_threshold <> round(new.low_supply_threshold, new.quantity_precision) then
    raise exception 'low_supply_threshold exceeds product precision' using errcode = '23514';
  end if;
  -- The base unit is fixed once SKUs or supply reference the product (ADR-0006).
  if tg_op = 'UPDATE' and new.base_unit is distinct from old.base_unit and (
       exists (select 1 from public.product_skus s where s.product_id = old.id)
    or exists (select 1 from public.supply_confirmations c where c.product_id = old.id)
  ) then
    raise exception 'base_unit cannot change once SKUs or supply reference the product'
      using errcode = '23514';
  end if;
  -- Precision may not drop below the precision of quantities already recorded.
  if tg_op = 'UPDATE' and new.quantity_precision < old.quantity_precision and (
       exists (select 1 from public.product_skus s
               where s.product_id = old.id and s.pack_quantity <> round(s.pack_quantity, new.quantity_precision))
    or exists (select 1 from public.supply_confirmations c
               where c.product_id = old.id and c.quantity <> round(c.quantity, new.quantity_precision))
  ) then
    raise exception 'quantity_precision cannot drop below recorded quantities' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger products_validate
  before insert or update on public.products
  for each row execute function private.validate_product();

create trigger products_bump_version
  before insert or update on public.products
  for each row execute function private.bump_version();

create trigger products_immutable_columns
  before update on public.products
  for each row execute function private.forbid_column_change('product_code', 'created_at', 'created_by');

-- -----------------------------------------------------------------------------
create table public.product_skus (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  sku_code text not null unique check (sku_code ~ '^[A-Z0-9][A-Z0-9_-]{1,49}$'),
  label text not null check (char_length(label) <= 60 and char_length(btrim(label)) >= 1),
  -- Unconstrained NUMERIC so over-precision input is REJECTED (trigger), never silently rounded.
  pack_quantity numeric not null check (pack_quantity > 0 and pack_quantity < 1000000000 and pack_quantity = round(pack_quantity, 3)),
  sale_unit text not null references public.units (code),
  price_paise bigint not null check (price_paise >= 0),
  min_order_packs integer not null default 1 check (min_order_packs >= 1),
  max_order_packs integer check (max_order_packs is null or max_order_packs >= 1),
  order_step_packs integer not null default 1 check (order_step_packs >= 1),
  tax_code text check (tax_code is null or char_length(tax_code) <= 40),
  is_active boolean not null default true,
  display_order integer not null default 0,
  version integer not null default 1,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_skus_min_max check (max_order_packs is null or max_order_packs >= min_order_packs)
);
comment on table public.product_skus is
  'Sellable fixed pack. pack_quantity is in the product base unit; price in integer paise. tax_code set only after professional review.';

create index product_skus_product_idx on public.product_skus (product_id);

create function private.validate_product_sku()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_precision smallint;
begin
  select p.quantity_precision into v_precision from public.products p where p.id = new.product_id;
  if new.pack_quantity <> round(new.pack_quantity, v_precision) then
    raise exception 'pack_quantity exceeds product precision (% decimals)', v_precision
      using errcode = '23514';
  end if;
  if not exists (select 1 from public.units u where u.code = new.sale_unit and u.is_sale_unit_allowed) then
    raise exception 'unit % is not allowed as a sale unit', new.sale_unit using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.product_id is distinct from old.product_id then
    raise exception 'a SKU cannot move to another product' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger product_skus_validate
  before insert or update on public.product_skus
  for each row execute function private.validate_product_sku();

create trigger product_skus_bump_version
  before insert or update on public.product_skus
  for each row execute function private.bump_version();

create trigger product_skus_immutable_code
  before update on public.product_skus
  for each row execute function private.forbid_column_change('sku_code', 'created_at', 'created_by');

-- -----------------------------------------------------------------------------
create table public.sku_price_history (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references public.product_skus (id),
  price_paise bigint not null check (price_paise >= 0),
  previous_price_paise bigint check (previous_price_paise is null or previous_price_paise >= 0),
  effective_from timestamptz not null default now(),
  changed_by uuid,
  reason text check (reason is null or char_length(reason) <= 500),
  request_id text
);
comment on table public.sku_price_history is 'Written automatically for every SKU price set/change. Append-only.';

create index sku_price_history_sku_idx on public.sku_price_history (sku_id, effective_from desc);

create function private.record_sku_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.price_paise is distinct from old.price_paise then
    insert into public.sku_price_history (sku_id, price_paise, previous_price_paise, changed_by, reason, request_id)
    values (
      new.id,
      new.price_paise,
      case when tg_op = 'UPDATE' then old.price_paise end,
      (select auth.uid()),
      left(private.request_setting('app.reason'), 500),
      private.current_request_id()
    );
  end if;
  return new;
end;
$$;
revoke all on function private.record_sku_price() from public;

create trigger product_skus_price_history
  after insert or update of price_paise on public.product_skus
  for each row execute function private.record_sku_price();

create trigger sku_price_history_append_only
  before update or delete on public.sku_price_history
  for each row execute function private.audit_logs_append_only();

create trigger sku_price_history_no_truncate
  before truncate on public.sku_price_history
  for each statement execute function private.forbid_truncate();

-- -----------------------------------------------------------------------------
create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  storage_key text not null check (storage_key ~ '^[a-z0-9][a-z0-9/_.-]+$' and char_length(storage_key) between 3 and 300 and storage_key !~ '\.\.'),
  alt_text text not null check (char_length(alt_text) <= 200 and char_length(btrim(alt_text)) >= 1),
  display_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.product_images is
  'Product image object keys (public-read path allowed for product images only, master §13.9).';

create index product_images_product_idx on public.product_images (product_id, display_order);
create unique index product_images_one_primary_idx on public.product_images (product_id) where is_primary;

create trigger product_images_set_updated_at
  before update on public.product_images
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Audit
-- -----------------------------------------------------------------------------
create trigger categories_audit
  after insert or update or delete on public.categories
  for each row execute function private.audit_row_change('id');
create trigger products_audit
  after insert or update or delete on public.products
  for each row execute function private.audit_row_change('id');
create trigger product_skus_audit
  after insert or update or delete on public.product_skus
  for each row execute function private.audit_row_change('id');
create trigger product_images_audit
  after insert or update or delete on public.product_images
  for each row execute function private.audit_row_change('id');

-- -----------------------------------------------------------------------------
-- RLS. Catalog read: super_admin, operations_admin, finance_admin,
-- support_agent, viewer (WEB_ADMIN §3). Dispatch and rider: no.
-- Customers read the catalog only through get-catalog (service role).
-- Writes: trusted server operations only (super_admin-only in the MVP).
-- -----------------------------------------------------------------------------
alter table public.units enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_skus enable row level security;
alter table public.sku_price_history enable row level security;
alter table public.product_images enable row level security;

revoke all on public.units, public.categories, public.products, public.product_skus,
  public.sku_price_history, public.product_images from anon, authenticated;
grant select on public.units, public.categories, public.products, public.product_skus,
  public.sku_price_history, public.product_images to authenticated;

create function private.can_read_catalog()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_role(array[
    'super_admin', 'operations_admin', 'finance_admin', 'support_agent', 'viewer'
  ]::public.app_role[]);
$$;
revoke all on function private.can_read_catalog() from public;
grant execute on function private.can_read_catalog() to authenticated, service_role;

create policy units_select on public.units
  for select to authenticated
  using ((select private.has_any_role(array['super_admin', 'operations_admin', 'finance_admin', 'support_agent', 'viewer']::public.app_role[])));
create policy categories_select on public.categories
  for select to authenticated using ((select private.can_read_catalog()));
create policy products_select on public.products
  for select to authenticated using ((select private.can_read_catalog()));
create policy product_skus_select on public.product_skus
  for select to authenticated using ((select private.can_read_catalog()));
create policy product_images_select on public.product_images
  for select to authenticated using ((select private.can_read_catalog()));
-- Price history: catalog owners and finance only.
create policy sku_price_history_select on public.sku_price_history
  for select to authenticated
  using ((select private.has_any_role(array['super_admin', 'operations_admin', 'finance_admin']::public.app_role[])));
