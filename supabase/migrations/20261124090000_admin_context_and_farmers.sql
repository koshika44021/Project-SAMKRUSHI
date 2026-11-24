-- =============================================================================
-- Phase 3 — admin write path, part 1: action context, rate limiter, farmers.
--
-- Every admin mutation is a SECURITY DEFINER RPC called by admin-web with the
-- signed-in staff member's JWT (so auth.uid() is the real actor). Each RPC:
--   1. authorizes via private.begin_admin_action(...) which also sets the
--      transaction-local audit context (app.request_id/actor_role/reason/source),
--   2. enforces optimistic concurrency (expected version) where it edits,
--   3. raises errors with PostgREST status codes the app maps to the shared
--      API envelope: PT403 forbidden, PT404 not found, PT409 conflict,
--      PT422 unprocessable; check violations (23514) surface as validation.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Action context
-- -----------------------------------------------------------------------------
create function private.begin_admin_action(
  p_allowed_roles public.app_role[],
  p_request_id text,
  p_reason text default null,
  p_source text default 'admin-web'
)
returns public.app_role
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
begin
  -- First allowed role the caller actively holds (allowed list is ordered by privilege).
  select r into v_role
  from unnest(p_allowed_roles) with ordinality as a(r, ord)
  where private.has_role(r)
  order by ord
  limit 1;

  if v_role is null then
    raise exception 'not authorized' using errcode = 'PT403';
  end if;

  perform set_config('app.actor_role', v_role::text, true);
  perform set_config('app.source', left(coalesce(nullif(btrim(p_source), ''), 'admin-web'), 64), true);
  if p_request_id is not null and btrim(p_request_id) <> '' then
    perform set_config('app.request_id', left(btrim(p_request_id), 128), true);
  end if;
  perform set_config('app.reason', coalesce(left(nullif(btrim(p_reason), ''), 1000), ''), true);
  return v_role;
end;
$$;
revoke all on function private.begin_admin_action(public.app_role[], text, text, text) from public, anon;
grant execute on function private.begin_admin_action(public.app_role[], text, text, text) to authenticated, service_role;

-- Reason helper: trimmed, bounded, required when p_required.
create function private.require_reason(p_reason text, p_field text default 'reason')
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception '% is required (at least 3 characters)', p_field
      using errcode = 'PT422', detail = p_field;
  end if;
  return left(btrim(p_reason), 500);
end;
$$;
revoke all on function private.require_reason(text, text) from public, anon;
grant execute on function private.require_reason(text, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- DB-backed fixed-window rate limiter (master §13.7). Keys are hashed; rows
-- expire with their window. Callable by trusted server code only.
-- -----------------------------------------------------------------------------
create table public.rate_limit_counters (
  bucket text not null check (bucket ~ '^[a-z][a-z0-9_.]{1,63}$'),
  key_hash text not null check (char_length(key_hash) = 64),
  window_start timestamptz not null,
  hits integer not null check (hits >= 0),
  primary key (bucket, key_hash, window_start)
);
comment on table public.rate_limit_counters is
  'Hashed rate-limit counters (no raw identifiers). Limits come from settings; production values need founder/ops approval.';
alter table public.rate_limit_counters enable row level security;
revoke all on public.rate_limit_counters from anon, authenticated, service_role;
create index rate_limit_counters_window_idx on public.rate_limit_counters (window_start);

create function public.consume_rate_limit(
  p_bucket text,
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_hash text;
  v_hits integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit configuration' using errcode = '22023';
  end if;
  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hash := encode(extensions.digest(p_bucket || ':' || coalesce(p_key, ''), 'sha256'), 'hex');

  delete from public.rate_limit_counters c
  where c.bucket = p_bucket and c.key_hash = v_hash and c.window_start < v_window_start;

  insert into public.rate_limit_counters as c (bucket, key_hash, window_start, hits)
  values (p_bucket, v_hash, v_window_start, 1)
  on conflict (bucket, key_hash, window_start) do update set hits = c.hits + 1
  returning c.hits into v_hits;

  allowed := v_hits <= p_limit;
  remaining := greatest(0, p_limit - v_hits);
  retry_after_seconds := case when allowed then 0
    else ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - now())))::integer end;
  return next;
end;
$$;
revoke all on function public.consume_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;

-- -----------------------------------------------------------------------------
-- Farmer code generator (dev default format SAM-FRM-######; founder confirmation)
-- -----------------------------------------------------------------------------
create sequence private.farmer_code_seq as bigint minvalue 1 start 1;
revoke all on sequence private.farmer_code_seq from public, anon, authenticated;

create function private.next_farmer_code()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select 'SAM-FRM-' || lpad(nextval('private.farmer_code_seq')::text, 6, '0');
$$;
revoke all on function private.next_farmer_code() from public, anon, authenticated;

-- Active contacts on OTHER suppliers sharing any of the given phones.
create function private.duplicate_phone_matches(p_phones text[], p_exclude_supplier uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'supplierId', s.id, 'supplierCode', s.supplier_code, 'name', s.name,
           'phone', private.mask_phone(c.phone_e164)) order by s.supplier_code), '[]'::jsonb)
  from public.supplier_contacts c
  join public.suppliers s on s.id = c.supplier_id
  where c.is_active
    and c.phone_e164 = any (p_phones)
    and (p_exclude_supplier is null or c.supplier_id <> p_exclude_supplier);
$$;
revoke all on function private.duplicate_phone_matches(text[], uuid) from public, anon, authenticated;

-- Raise PT409 with match details unless the caller confirmed with a reason.
create function private.guard_duplicate_phones(
  p_phones text[], p_exclude_supplier uuid, p_confirm_reason text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_matches jsonb := private.duplicate_phone_matches(p_phones, p_exclude_supplier);
begin
  if jsonb_array_length(v_matches) = 0 then
    return null;
  end if;
  if p_confirm_reason is null or char_length(btrim(p_confirm_reason)) < 3 then
    raise exception 'duplicate_phone'
      using errcode = 'PT409', detail = v_matches::text,
            hint = 'Phone number already used by another supplier; confirm with a reason to proceed.';
  end if;
  return 'duplicate phone confirmed: ' || left(btrim(p_confirm_reason), 400);
end;
$$;
revoke all on function private.guard_duplicate_phones(text[], uuid, text) from public, anon, authenticated;

-- Upsert one contact slot (primary/secondary) for a supplier.
create function private.set_supplier_contact(
  p_supplier_id uuid, p_type public.supplier_contact_type, p_phone text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.supplier_contacts%rowtype;
begin
  select * into v_existing from public.supplier_contacts
  where supplier_id = p_supplier_id and contact_type = p_type and is_active;

  if p_phone is null or btrim(p_phone) = '' then
    if found then
      update public.supplier_contacts set is_active = false, updated_by = (select auth.uid())
      where id = v_existing.id;
    end if;
  elsif found then
    if v_existing.phone_e164 is distinct from p_phone then
      update public.supplier_contacts set phone_e164 = p_phone, updated_by = (select auth.uid())
      where id = v_existing.id;
    end if;
  else
    insert into public.supplier_contacts (supplier_id, contact_type, phone_e164, created_by, updated_by)
    values (p_supplier_id, p_type, p_phone, (select auth.uid()), (select auth.uid()));
  end if;
end;
$$;
revoke all on function private.set_supplier_contact(uuid, public.supplier_contact_type, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Farmer RPCs (super_admin, operations_admin)
-- -----------------------------------------------------------------------------
create function public.admin_create_farmer(
  p_name text,
  p_address_line text,
  p_village_locality text,
  p_mandal text,
  p_district text,
  p_state text,
  p_pin_code text,
  p_primary_phone text,
  p_secondary_phone text default null,
  p_land_area_value numeric default null,
  p_land_area_unit public.land_area_unit default null,
  p_notes text default null,
  p_status public.supplier_status default 'active',
  p_duplicate_phone_reason text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_code text;
  v_dup_note text;
  v_phones text[] := array_remove(array[nullif(btrim(p_primary_phone), ''), nullif(btrim(p_secondary_phone), '')], null);
begin
  perform private.begin_admin_action(array['super_admin', 'operations_admin']::public.app_role[], p_request_id, 'farmer registered');

  if p_status not in ('active', 'pending_verification') then
    raise exception 'a new farmer must be active or pending_verification' using errcode = 'PT422', detail = 'status';
  end if;
  if p_primary_phone is null or btrim(p_primary_phone) = '' then
    raise exception 'primary phone is required' using errcode = 'PT422', detail = 'primaryPhone';
  end if;
  if p_secondary_phone is not null and btrim(p_secondary_phone) = btrim(p_primary_phone) then
    raise exception 'secondary phone must differ from primary phone' using errcode = 'PT422', detail = 'secondaryPhone';
  end if;

  v_dup_note := private.guard_duplicate_phones(v_phones, null, p_duplicate_phone_reason);
  if v_dup_note is not null then
    perform set_config('app.reason', 'farmer registered; ' || v_dup_note, true);
  end if;

  v_code := private.next_farmer_code();
  insert into public.suppliers (
    supplier_code, name, supplier_type, status, address_line, village_locality, mandal, district, state,
    pin_code, notes, verified_by, verified_at, created_by, updated_by
  ) values (
    v_code, btrim(p_name), 'farmer', p_status, btrim(p_address_line), btrim(p_village_locality), btrim(p_mandal),
    btrim(p_district), btrim(p_state), btrim(p_pin_code), nullif(btrim(p_notes), ''),
    case when p_status = 'active' then (select auth.uid()) end,
    case when p_status = 'active' then now() end,
    (select auth.uid()), (select auth.uid())
  ) returning id into v_id;

  insert into public.farmer_profiles (supplier_id, land_area_value, land_area_unit)
  values (v_id, p_land_area_value, p_land_area_unit);

  perform private.set_supplier_contact(v_id, 'primary', btrim(p_primary_phone));
  perform private.set_supplier_contact(v_id, 'secondary', nullif(btrim(p_secondary_phone), ''));

  return jsonb_build_object('id', v_id, 'supplierCode', v_code, 'version', 1);
end;
$$;

create function public.admin_update_farmer(
  p_supplier_id uuid,
  p_expected_version integer,
  p_name text,
  p_address_line text,
  p_village_locality text,
  p_mandal text,
  p_district text,
  p_state text,
  p_pin_code text,
  p_primary_phone text,
  p_secondary_phone text default null,
  p_land_area_value numeric default null,
  p_land_area_unit public.land_area_unit default null,
  p_notes text default null,
  p_reason text default null,
  p_duplicate_phone_reason text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
  v_reason text;
  v_dup_note text;
  v_phones text[] := array_remove(array[nullif(btrim(p_primary_phone), ''), nullif(btrim(p_secondary_phone), '')], null);
begin
  perform private.begin_admin_action(array['super_admin', 'operations_admin']::public.app_role[], p_request_id);
  v_reason := private.require_reason(p_reason);

  if not exists (select 1 from public.suppliers where id = p_supplier_id and supplier_type = 'farmer') then
    raise exception 'farmer not found' using errcode = 'PT404';
  end if;
  if p_primary_phone is null or btrim(p_primary_phone) = '' then
    raise exception 'primary phone is required' using errcode = 'PT422', detail = 'primaryPhone';
  end if;
  if p_secondary_phone is not null and btrim(p_secondary_phone) = btrim(p_primary_phone) then
    raise exception 'secondary phone must differ from primary phone' using errcode = 'PT422', detail = 'secondaryPhone';
  end if;

  v_dup_note := private.guard_duplicate_phones(
    array(select p from unnest(v_phones) p
          where not exists (select 1 from public.supplier_contacts c
                            where c.supplier_id = p_supplier_id and c.is_active and c.phone_e164 = p)),
    p_supplier_id, p_duplicate_phone_reason);
  perform set_config('app.reason', v_reason || coalesce('; ' || v_dup_note, ''), true);

  update public.suppliers set
    name = btrim(p_name),
    address_line = btrim(p_address_line),
    village_locality = btrim(p_village_locality),
    mandal = btrim(p_mandal),
    district = btrim(p_district),
    state = btrim(p_state),
    pin_code = btrim(p_pin_code),
    notes = nullif(btrim(p_notes), ''),
    updated_by = (select auth.uid())
  where id = p_supplier_id and version = p_expected_version
  returning version into v_version;

  if v_version is null then
    raise exception 'version_conflict' using errcode = 'PT409',
      hint = 'The farmer was changed by someone else. Reload and try again.';
  end if;

  update public.farmer_profiles set land_area_value = p_land_area_value, land_area_unit = p_land_area_unit
  where supplier_id = p_supplier_id;

  perform private.set_supplier_contact(p_supplier_id, 'primary', btrim(p_primary_phone));
  perform private.set_supplier_contact(p_supplier_id, 'secondary', nullif(btrim(p_secondary_phone), ''));

  return jsonb_build_object('id', p_supplier_id, 'version', v_version);
end;
$$;

create function public.admin_set_farmer_status(
  p_supplier_id uuid,
  p_expected_version integer,
  p_status public.supplier_status,
  p_reason text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
  v_reason text;
begin
  perform private.begin_admin_action(array['super_admin', 'operations_admin']::public.app_role[], p_request_id);
  v_reason := private.require_reason(p_reason);
  perform set_config('app.reason', v_reason, true);

  if not exists (select 1 from public.suppliers where id = p_supplier_id and supplier_type = 'farmer') then
    raise exception 'farmer not found' using errcode = 'PT404';
  end if;

  update public.suppliers set
    status = p_status,
    deactivated_at = case when p_status = 'inactive' then now() end,
    deactivation_reason = case when p_status = 'inactive' then v_reason end,
    verified_by = case when p_status = 'active' and verified_by is null then (select auth.uid()) else verified_by end,
    verified_at = case when p_status = 'active' and verified_at is null then now() else verified_at end,
    updated_by = (select auth.uid())
  where id = p_supplier_id and version = p_expected_version
  returning version into v_version;

  if v_version is null then
    raise exception 'version_conflict' using errcode = 'PT409',
      hint = 'The farmer was changed by someone else. Reload and try again.';
  end if;
  return jsonb_build_object('id', p_supplier_id, 'version', v_version, 'status', p_status);
end;
$$;

-- Sets/clears the private photo key; returns the previous key so the server
-- can delete the replaced object. The object itself is uploaded by server code.
create function public.admin_set_farmer_photo(
  p_supplier_id uuid,
  p_storage_key text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous text;
begin
  perform private.begin_admin_action(array['super_admin', 'operations_admin']::public.app_role[], p_request_id,
    case when p_storage_key is null then 'farmer photo removed' else 'farmer photo replaced' end);

  select photo_storage_key into v_previous from public.farmer_profiles where supplier_id = p_supplier_id for update;
  if not found then
    raise exception 'farmer not found' using errcode = 'PT404';
  end if;
  if p_storage_key is not null and p_storage_key not like 'farmers/' || p_supplier_id::text || '/%' then
    raise exception 'photo key must live under the farmer''s folder' using errcode = 'PT422', detail = 'photo';
  end if;

  update public.farmer_profiles set photo_storage_key = p_storage_key where supplier_id = p_supplier_id;
  update public.suppliers set updated_by = (select auth.uid()) where id = p_supplier_id;
  return jsonb_build_object('id', p_supplier_id, 'previousKey', v_previous);
end;
$$;

-- Server-side lookup for signed URLs: the caller must be allowed to see photos
-- (not viewer — dev default "photos hidden"). Returns the private key or null.
create function public.admin_farmer_photo_key(p_supplier_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_any_role(array['super_admin', 'operations_admin', 'finance_admin']::public.app_role[]) then
    raise exception 'not authorized' using errcode = 'PT403';
  end if;
  return (select photo_storage_key from public.farmer_profiles where supplier_id = p_supplier_id);
end;
$$;

-- Duplicate-phone pre-check for forms (warning before submit).
create function public.admin_check_duplicate_phones(p_phones text[], p_exclude_supplier uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_any_role(array['super_admin', 'operations_admin']::public.app_role[]) then
    raise exception 'not authorized' using errcode = 'PT403';
  end if;
  return private.duplicate_phone_matches(p_phones, p_exclude_supplier);
end;
$$;

revoke all on function public.admin_create_farmer(text, text, text, text, text, text, text, text, text, numeric, public.land_area_unit, text, public.supplier_status, text, text) from public, anon;
revoke all on function public.admin_update_farmer(uuid, integer, text, text, text, text, text, text, text, text, text, numeric, public.land_area_unit, text, text, text, text) from public, anon;
revoke all on function public.admin_set_farmer_status(uuid, integer, public.supplier_status, text, text) from public, anon;
revoke all on function public.admin_set_farmer_photo(uuid, text, text) from public, anon;
revoke all on function public.admin_farmer_photo_key(uuid) from public, anon;
revoke all on function public.admin_check_duplicate_phones(text[], uuid) from public, anon;
grant execute on function public.admin_create_farmer(text, text, text, text, text, text, text, text, text, numeric, public.land_area_unit, text, public.supplier_status, text, text) to authenticated;
grant execute on function public.admin_update_farmer(uuid, integer, text, text, text, text, text, text, text, text, text, numeric, public.land_area_unit, text, text, text, text) to authenticated;
grant execute on function public.admin_set_farmer_status(uuid, integer, public.supplier_status, text, text) to authenticated;
grant execute on function public.admin_set_farmer_photo(uuid, text, text) to authenticated;
grant execute on function public.admin_farmer_photo_key(uuid) to authenticated;
grant execute on function public.admin_check_duplicate_phones(text[], uuid) to authenticated;
