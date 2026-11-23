-- =============================================================================
-- Supplier identity (ADR-0004, master §4.1)
--   suppliers          — the single supplier identity (supplier_type incl. farmer),
--                        shared location fields and verification state
--   supplier_contacts  — phones/emails (restricted: no viewer access; masked
--                        output via supplier_contact_summaries())
--   farmer_profiles    — 1:1 farmer-only fields (land area, private photo key)
-- Bank/payment details are a separate finance-only table in a later phase.
-- =============================================================================

create type public.supplier_type as enum ('farmer', 'fpo', 'aggregator', 'approved_source', 'other');
create type public.supplier_status as enum ('pending_verification', 'active', 'suspended', 'inactive');
create type public.land_area_unit as enum ('acre', 'hectare');
create type public.supplier_contact_type as enum ('primary', 'secondary', 'authorized');

-- -----------------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_code text not null unique check (supplier_code ~ '^[A-Z0-9][A-Z0-9-]{2,29}$'),
  name text not null check (char_length(name) <= 120 and char_length(btrim(name)) >= 2),
  supplier_type public.supplier_type not null,
  status public.supplier_status not null default 'pending_verification',
  -- Sourcing/registered location (stored separately, never a single free-text field)
  address_line text check (address_line is null or char_length(address_line) <= 300 and char_length(btrim(address_line)) >= 1),
  village_locality text check (village_locality is null or char_length(village_locality) <= 120 and char_length(btrim(village_locality)) >= 1),
  mandal text check (mandal is null or char_length(mandal) <= 120 and char_length(btrim(mandal)) >= 1),
  district text check (district is null or char_length(district) <= 120 and char_length(btrim(district)) >= 1),
  state text check (state is null or char_length(state) <= 120 and char_length(btrim(state)) >= 1),
  pin_code text check (pin_code is null or pin_code ~ '^[1-9][0-9]{5}$'),
  notes text check (notes is null or char_length(notes) <= 2000),
  -- Verification (master §4.1 step 5)
  verified_by uuid references auth.users (id),
  verified_at timestamptz,
  verification_notes text check (verification_notes is null or char_length(verification_notes) <= 1000),
  deactivated_at timestamptz,
  deactivation_reason text check (deactivation_reason is null or char_length(deactivation_reason) <= 500),
  version integer not null default 1,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite key target so farmer_profiles can only attach to farmers.
  constraint suppliers_id_type_unique unique (id, supplier_type),
  constraint suppliers_verification_consistent check ((verified_by is null) = (verified_at is null)),
  -- Strict: inactive iff deactivation recorded; reactivation clears it (history stays in audit).
  constraint suppliers_deactivation_consistent check (
    (status = 'inactive' and deactivated_at is not null and deactivation_reason is not null)
    or (status <> 'inactive' and deactivated_at is null and deactivation_reason is null)
  )
);
comment on table public.suppliers is
  'Single supplier identity (ADR-0004). Never hard-deleted; deactivate with a reason. Supply entry requires status=active.';
comment on column public.suppliers.supplier_code is
  'Human-readable display code (e.g. SAM-FRM-000001 for farmers; format is a founder confirmation). Never the only key.';

create index suppliers_status_type_idx on public.suppliers (status, supplier_type);
create index suppliers_name_trgm_idx on public.suppliers using gin (name extensions.gin_trgm_ops);
create index suppliers_district_mandal_idx on public.suppliers (district, mandal);

create trigger suppliers_bump_version
  before insert or update on public.suppliers
  for each row execute function private.bump_version();

create trigger suppliers_immutable_code
  before update on public.suppliers
  for each row execute function private.forbid_column_change('supplier_code', 'created_at', 'created_by');

-- No hard delete: suppliers carry supply/procurement history.
create function private.forbid_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows cannot be deleted; deactivate instead', tg_table_name
    using errcode = '42501';
end;
$$;

create trigger suppliers_no_delete
  before delete on public.suppliers
  for each row execute function private.forbid_delete();

create trigger suppliers_no_truncate
  before truncate on public.suppliers
  for each statement execute function private.forbid_truncate();

-- -----------------------------------------------------------------------------
create table public.supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id),
  contact_type public.supplier_contact_type not null,
  contact_name text check (contact_name is null or char_length(contact_name) <= 120 and char_length(btrim(contact_name)) >= 1),
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  is_active boolean not null default true,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_contacts_has_channel check (phone_e164 is not null or email is not null)
);
comment on table public.supplier_contacts is
  'Supplier phone/email contacts. Duplicate phones across suppliers are allowed but must be warned about (never merged).';

create unique index supplier_contacts_one_primary_idx
  on public.supplier_contacts (supplier_id) where contact_type = 'primary' and is_active;
create unique index supplier_contacts_one_secondary_idx
  on public.supplier_contacts (supplier_id) where contact_type = 'secondary' and is_active;
create index supplier_contacts_phone_idx on public.supplier_contacts (phone_e164) where phone_e164 is not null;
create index supplier_contacts_supplier_idx on public.supplier_contacts (supplier_id);

create trigger supplier_contacts_set_updated_at
  before update on public.supplier_contacts
  for each row execute function private.set_updated_at();

create trigger supplier_contacts_immutable_supplier
  before update on public.supplier_contacts
  for each row execute function private.forbid_column_change('supplier_id');

create trigger supplier_contacts_no_delete
  before delete on public.supplier_contacts
  for each row execute function private.forbid_delete();

create trigger supplier_contacts_no_truncate
  before truncate on public.supplier_contacts
  for each statement execute function private.forbid_truncate();

-- -----------------------------------------------------------------------------
create table public.farmer_profiles (
  supplier_id uuid primary key,
  supplier_type public.supplier_type not null default 'farmer' check (supplier_type = 'farmer'),
  land_area_value numeric(10, 2) check (land_area_value is null or land_area_value > 0),
  land_area_unit public.land_area_unit,
  photo_storage_key text check (
    photo_storage_key is null
    or (photo_storage_key ~ '^[a-z0-9][a-z0-9/_.-]+$' and char_length(photo_storage_key) between 3 and 300 and photo_storage_key !~ '\.\.')
  ),
  has_photo boolean generated always as (photo_storage_key is not null) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint farmer_profiles_supplier_fk foreign key (supplier_id, supplier_type)
    references public.suppliers (id, supplier_type) on update restrict on delete restrict,
  constraint farmer_profiles_land_area_pair check ((land_area_value is null) = (land_area_unit is null))
);
comment on table public.farmer_profiles is
  '1:1 farmer-only fields (ADR-0004). Required-field rules are founder confirmations: columns stay nullable, Zod enforces dev defaults.';
comment on column public.farmer_profiles.photo_storage_key is
  'Private-bucket object key (random, never a user filename or URL). Signed URLs only after a role check; hidden from viewer.';

create trigger farmer_profiles_set_updated_at
  before update on public.farmer_profiles
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Audit (phones masked, photo keys redacted)
-- -----------------------------------------------------------------------------
create trigger suppliers_audit
  after insert or update or delete on public.suppliers
  for each row execute function private.audit_row_change('id');
create trigger supplier_contacts_audit
  after insert or update or delete on public.supplier_contacts
  for each row execute function private.audit_row_change('id', 'phone_e164:phone', 'email');
create trigger farmer_profiles_audit
  after insert or update or delete on public.farmer_profiles
  for each row execute function private.audit_row_change('supplier_id', 'photo_storage_key');

-- -----------------------------------------------------------------------------
-- RLS (WEB_ADMIN §3): suppliers/farmer profiles readable by super_admin,
-- operations_admin, finance_admin and viewer. Raw contacts: not viewer.
-- -----------------------------------------------------------------------------
alter table public.suppliers enable row level security;
alter table public.supplier_contacts enable row level security;
alter table public.farmer_profiles enable row level security;

revoke all on public.suppliers, public.supplier_contacts, public.farmer_profiles from anon, authenticated;
grant select on public.suppliers, public.supplier_contacts to authenticated;
-- Column grant: no client reads the private photo key (signed URLs are issued
-- by server code after a role check; viewer photos hidden - ADR-0005).
grant select (supplier_id, supplier_type, land_area_value, land_area_unit, has_photo, created_at, updated_at)
  on public.farmer_profiles to authenticated;

create function private.can_read_suppliers()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_role(array['super_admin', 'operations_admin', 'finance_admin', 'viewer']::public.app_role[]);
$$;

create function private.can_read_supplier_contacts()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_role(array['super_admin', 'operations_admin', 'finance_admin']::public.app_role[]);
$$;

revoke all on function private.can_read_suppliers() from public;
revoke all on function private.can_read_supplier_contacts() from public;
grant execute on function private.can_read_suppliers() to authenticated, service_role;
grant execute on function private.can_read_supplier_contacts() to authenticated, service_role;

create policy suppliers_select on public.suppliers
  for select to authenticated using ((select private.can_read_suppliers()));
create policy farmer_profiles_select on public.farmer_profiles
  for select to authenticated using ((select private.can_read_suppliers()));
create policy supplier_contacts_select on public.supplier_contacts
  for select to authenticated using ((select private.can_read_supplier_contacts()));

-- Masked contact summary for every supplier reader (incl. viewer, whose dev
-- default is masked phones — ADR-0005). Full numbers only for contact readers.
create function public.supplier_contact_summaries(p_supplier_ids uuid[])
returns table (
  supplier_id uuid,
  contact_type public.supplier_contact_type,
  contact_name text,
  phone text,
  is_masked boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_full boolean := private.can_read_supplier_contacts();
begin
  if not private.can_read_suppliers() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select c.supplier_id, c.contact_type, c.contact_name,
           case when v_full then c.phone_e164 else private.mask_phone(c.phone_e164) end,
           not v_full
    from public.supplier_contacts c
    where c.supplier_id = any (p_supplier_ids)
      and c.is_active
    order by c.supplier_id, c.contact_type;
end;
$$;
revoke all on function public.supplier_contact_summaries(uuid[]) from public;
grant execute on function public.supplier_contact_summaries(uuid[]) to authenticated;
