-- =============================================================================
-- Phase 3 — admin write path, part 2: dated supply, staff administration,
-- login stamp, and read RPCs for the dashboard (single round trip, no N+1).
-- Quantities are returned as decimal STRINGS (ADR-0003).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Supply RPCs (super_admin, operations_admin)
-- -----------------------------------------------------------------------------
create function public.admin_create_supply(
  p_supplier_id uuid,
  p_product_id uuid,
  p_business_date date,
  p_quantity numeric,
  p_confirmation_source text,
  p_entry_unit text default null,
  p_confirmed_by uuid default null,
  p_confirmed_at timestamptz default null,
  p_note text default null,
  p_evidence_storage_key text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base_unit text;
  v_quantity numeric;
  v_id uuid;
  v_existing uuid;
begin
  perform private.begin_admin_action(array['super_admin', 'operations_admin']::public.app_role[], p_request_id,
    'farmer-confirmed supply recorded');

  select base_unit into v_base_unit from public.products where id = p_product_id;
  if v_base_unit is null then
    raise exception 'product not found' using errcode = 'PT404', detail = 'productId';
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id) then
    raise exception 'farmer not found' using errcode = 'PT404', detail = 'supplierId';
  end if;
  if not exists (select 1 from public.supply_confirmation_sources where code = p_confirmation_source and is_active) then
    raise exception 'unknown confirmation source' using errcode = 'PT422', detail = 'confirmationSource';
  end if;

  -- Exact server-side conversion of an alternative entry unit (e.g. g → kg).
  v_quantity := case
    when p_entry_unit is null or p_entry_unit = v_base_unit then p_quantity
    else public.convert_quantity(p_quantity, p_entry_unit, v_base_unit)
  end;
  if v_quantity is null then
    raise exception 'quantity cannot be converted from % to %', p_entry_unit, v_base_unit
      using errcode = 'PT422', detail = 'entryUnit';
  end if;
  -- Normalise scale without rounding (over-precision is still rejected by the trigger).
  v_quantity := trim_scale(v_quantity);

  select id into v_existing from public.supply_confirmations
  where supplier_id = p_supplier_id and product_id = p_product_id and business_date = p_business_date and status = 'active';
  if v_existing is not null then
    raise exception 'duplicate_active_supply' using errcode = 'PT409',
      detail = jsonb_build_object('existingId', v_existing)::text,
      hint = 'This farmer already has an active record for this product and date. Edit it instead.';
  end if;

  if p_evidence_storage_key is not null and p_evidence_storage_key not like 'supply/%' then
    raise exception 'evidence key must live under supply/' using errcode = 'PT422', detail = 'evidence';
  end if;

  insert into public.supply_confirmations (
    supplier_id, product_id, business_date, quantity, unit, confirmation_source, confirmed_by, confirmed_at,
    note, evidence_storage_key, created_by, updated_by
  ) values (
    p_supplier_id, p_product_id, p_business_date, v_quantity, v_base_unit, p_confirmation_source,
    coalesce(p_confirmed_by, (select auth.uid())), coalesce(p_confirmed_at, now()),
    nullif(btrim(p_note), ''), p_evidence_storage_key, (select auth.uid()), (select auth.uid())
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'version', 1, 'quantity', v_quantity::text, 'unit', v_base_unit);
end;
$$;

create function public.admin_update_supply(
  p_supply_id uuid,
  p_expected_version integer,
  p_quantity numeric,
  p_reason text,
  p_note text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  perform private.begin_admin_action(array['super_admin', 'operations_admin']::public.app_role[], p_request_id,
    private.require_reason(p_reason));

  if not exists (select 1 from public.supply_confirmations where id = p_supply_id) then
    raise exception 'supply record not found' using errcode = 'PT404';
  end if;

  update public.supply_confirmations set
    quantity = trim_scale(p_quantity),
    note = nullif(btrim(p_note), ''),
    updated_by = (select auth.uid())
  where id = p_supply_id and version = p_expected_version
  returning version into v_version;

  if v_version is null then
    raise exception 'version_conflict' using errcode = 'PT409',
      hint = 'The supply record was changed by someone else. Reload and try again.';
  end if;
  return jsonb_build_object('id', p_supply_id, 'version', v_version);
end;
$$;

create function public.admin_set_supply_status(
  p_supply_id uuid,
  p_expected_version integer,
  p_status public.supply_status,
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
  v_row public.supply_confirmations%rowtype;
begin
  perform private.begin_admin_action(array['super_admin', 'operations_admin']::public.app_role[], p_request_id,
    private.require_reason(p_reason));

  select * into v_row from public.supply_confirmations where id = p_supply_id;
  if not found then
    raise exception 'supply record not found' using errcode = 'PT404';
  end if;
  if p_status = 'active' and exists (
    select 1 from public.supply_confirmations c
    where c.supplier_id = v_row.supplier_id and c.product_id = v_row.product_id
      and c.business_date = v_row.business_date and c.status = 'active' and c.id <> p_supply_id
  ) then
    raise exception 'duplicate_active_supply' using errcode = 'PT409',
      hint = 'Another active record exists for this farmer, product and date.';
  end if;

  update public.supply_confirmations set
    status = p_status,
    deactivated_at = case when p_status = 'inactive' then now() end,
    updated_by = (select auth.uid())
  where id = p_supply_id and version = p_expected_version
  returning version into v_version;

  if v_version is null then
    raise exception 'version_conflict' using errcode = 'PT409',
      hint = 'The supply record was changed by someone else. Reload and try again.';
  end if;
  return jsonb_build_object('id', p_supply_id, 'version', v_version, 'status', p_status);
end;
$$;

-- -----------------------------------------------------------------------------
-- Staff administration (super_admin). The Auth user itself is created, banned
-- and signed out by trusted server code with the Auth admin API; these RPCs
-- own the staff profile and role rows (and their audit trail).
-- -----------------------------------------------------------------------------
create function private.active_super_admin_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.user_roles ur
  join public.staff_profiles sp on sp.user_id = ur.user_id
  where ur.role = 'super_admin' and sp.is_active;
$$;
revoke all on function private.active_super_admin_count() from public, anon, authenticated;

create function private.validate_staff_roles(p_roles public.app_role[])
returns public.app_role[]
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_roles is null or cardinality(p_roles) = 0 then
    raise exception 'at least one staff role is required' using errcode = 'PT422', detail = 'roles';
  end if;
  if 'customer' = any (p_roles) then
    raise exception 'customer is not a staff role' using errcode = 'PT422', detail = 'roles';
  end if;
  return array(select distinct r from unnest(p_roles) r order by r);
end;
$$;
revoke all on function private.validate_staff_roles(public.app_role[]) from public, anon, authenticated;

create function public.admin_register_staff(
  p_user_id uuid,
  p_full_name text,
  p_roles public.app_role[],
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_roles public.app_role[];
begin
  perform private.begin_admin_action(array['super_admin']::public.app_role[], p_request_id, 'staff account created');
  v_roles := private.validate_staff_roles(p_roles);

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'auth user not found' using errcode = 'PT404';
  end if;
  if exists (select 1 from public.staff_profiles where user_id = p_user_id) then
    raise exception 'staff profile already exists' using errcode = 'PT409';
  end if;

  insert into public.staff_profiles (user_id, full_name, created_by, updated_by)
  values (p_user_id, btrim(p_full_name), (select auth.uid()), (select auth.uid()));
  insert into public.user_roles (user_id, role, assigned_by)
  select p_user_id, r, (select auth.uid()) from unnest(v_roles) r;

  return jsonb_build_object('userId', p_user_id, 'roles', to_jsonb(v_roles));
end;
$$;

create function public.admin_set_staff_roles(
  p_user_id uuid,
  p_roles public.app_role[],
  p_reason text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_roles public.app_role[];
begin
  perform private.begin_admin_action(array['super_admin']::public.app_role[], p_request_id, private.require_reason(p_reason));
  v_roles := private.validate_staff_roles(p_roles);

  if not exists (select 1 from public.staff_profiles where user_id = p_user_id) then
    raise exception 'staff member not found' using errcode = 'PT404';
  end if;

  delete from public.user_roles where user_id = p_user_id and role <> 'customer' and role <> all (v_roles);
  insert into public.user_roles (user_id, role, assigned_by)
  select p_user_id, r, (select auth.uid()) from unnest(v_roles) r
  on conflict (user_id, role) do nothing;

  if private.active_super_admin_count() = 0 then
    raise exception 'at least one active super_admin must remain' using errcode = 'PT409';
  end if;
  return jsonb_build_object('userId', p_user_id, 'roles', to_jsonb(v_roles));
end;
$$;

create function public.admin_set_staff_status(
  p_user_id uuid,
  p_is_active boolean,
  p_reason text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := private.require_reason(p_reason);
begin
  perform private.begin_admin_action(array['super_admin']::public.app_role[], p_request_id, v_reason);

  if p_user_id = (select auth.uid()) and not p_is_active then
    raise exception 'you cannot deactivate your own account' using errcode = 'PT409';
  end if;

  update public.staff_profiles set
    is_active = p_is_active,
    deactivated_at = case when p_is_active then null else now() end,
    deactivation_reason = case when p_is_active then null else v_reason end,
    updated_by = (select auth.uid())
  where user_id = p_user_id;
  if not found then
    raise exception 'staff member not found' using errcode = 'PT404';
  end if;

  if private.active_super_admin_count() = 0 then
    raise exception 'at least one active super_admin must remain' using errcode = 'PT409';
  end if;
  return jsonb_build_object('userId', p_user_id, 'isActive', p_is_active);
end;
$$;

create function public.admin_update_staff_name(
  p_user_id uuid,
  p_full_name text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.begin_admin_action(array['super_admin']::public.app_role[], p_request_id, 'staff name updated');
  update public.staff_profiles set full_name = btrim(p_full_name), updated_by = (select auth.uid())
  where user_id = p_user_id;
  if not found then
    raise exception 'staff member not found' using errcode = 'PT404';
  end if;
  return jsonb_build_object('userId', p_user_id);
end;
$$;

-- Called by admin-web right after a successful sign-in.
create function public.record_staff_login()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_staff() then
    raise exception 'not authorized' using errcode = 'PT403';
  end if;
  perform set_config('app.source', 'admin-web', true);
  perform set_config('app.reason', 'staff sign-in', true);
  update public.staff_profiles set last_login_at = now() where user_id = (select auth.uid());
end;
$$;

-- Super_admin staff list incl. Auth email/ban state (auth schema is not exposed).
create function public.admin_list_staff()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_role('super_admin') then
    raise exception 'not authorized' using errcode = 'PT403';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'userId', sp.user_id,
      'fullName', sp.full_name,
      'email', u.email,
      'isActive', sp.is_active,
      'lastLoginAt', sp.last_login_at,
      'deactivatedAt', sp.deactivated_at,
      'deactivationReason', sp.deactivation_reason,
      'roles', coalesce((select jsonb_agg(ur.role order by ur.role) from public.user_roles ur
                         where ur.user_id = sp.user_id and ur.role <> 'customer'), '[]'::jsonb),
      'createdAt', sp.created_at
    ) order by sp.full_name)
    from public.staff_profiles sp
    join auth.users u on u.id = sp.user_id
  ), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- Read RPCs
-- -----------------------------------------------------------------------------

-- Farmers list (WEB_ADMIN §6.1). Phone search/display only for contact readers;
-- viewers get masked phones and no phone search.
create function public.admin_list_farmers(
  p_search text default null,
  p_status public.supplier_status default null,
  p_district text default null,
  p_locality text default null,
  p_product_id uuid default null,
  p_sort text default 'name',
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_full_contacts boolean := private.can_read_supplier_contacts();
  v_search text := nullif(btrim(p_search), '');
  v_phone_search text;
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_size integer := least(100, greatest(1, coalesce(p_page_size, 25)));
  v_result jsonb;
begin
  if not private.can_read_suppliers() then
    raise exception 'not authorized' using errcode = 'PT403';
  end if;
  if p_sort not in ('name', 'code', 'recent', 'last_supply') then
    raise exception 'invalid sort' using errcode = 'PT422', detail = 'sort';
  end if;
  v_phone_search := case when v_full_contacts and v_search ~ '^\+?[0-9 ]{4,}$'
                         then regexp_replace(v_search, '[^0-9]', '', 'g') end;

  with base as (
    select s.*,
      (select c.phone_e164 from public.supplier_contacts c
        where c.supplier_id = s.id and c.contact_type = 'primary' and c.is_active) as primary_phone,
      (select max(sc.updated_at) from public.supply_confirmations sc where sc.supplier_id = s.id) as last_supply_at,
      (select coalesce(jsonb_agg(distinct p.name), '[]'::jsonb)
         from public.supply_confirmations sc join public.products p on p.id = sc.product_id
        where sc.supplier_id = s.id and sc.status = 'active'
          and sc.business_date >= public.current_business_date()) as products_supplied
    from public.suppliers s
    where s.supplier_type = 'farmer'
      and (p_status is null or s.status = p_status)
      and (p_district is null or s.district ilike p_district)
      and (p_locality is null or s.village_locality ilike '%' || p_locality || '%' or s.mandal ilike '%' || p_locality || '%')
      and (p_product_id is null or exists (
            select 1 from public.supply_confirmations sc where sc.supplier_id = s.id and sc.product_id = p_product_id))
      and (v_search is null
           or s.name ilike '%' || v_search || '%'
           or s.supplier_code ilike '%' || v_search || '%'
           or (v_phone_search is not null and exists (
                 select 1 from public.supplier_contacts c
                  where c.supplier_id = s.id and c.is_active
                    and regexp_replace(c.phone_e164, '[^0-9]', '', 'g') like '%' || v_phone_search || '%')))
  ),
  counted as (select count(*)::integer as total from base),
  page as (
    select * from base
    order by
      case when p_sort = 'name' then lower(name) end asc,
      case when p_sort = 'code' then supplier_code end asc,
      case when p_sort = 'recent' then updated_at end desc,
      case when p_sort = 'last_supply' then last_supply_at end desc nulls last,
      id
    offset (v_page - 1) * v_size limit v_size
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id,
        'supplierCode', supplier_code,
        'name', name,
        'supplierType', supplier_type,
        'status', status,
        'villageLocality', village_locality,
        'mandal', mandal,
        'district', district,
        'primaryPhone', case when v_full_contacts then primary_phone else private.mask_phone(primary_phone) end,
        'phoneMasked', not v_full_contacts,
        'productsSupplied', products_supplied,
        'verifiedAt', verified_at,
        'lastSupplyUpdateAt', last_supply_at,
        'updatedAt', updated_at,
        'version', version
      )) from page), '[]'::jsonb),
    'pagination', jsonb_build_object(
      'page', v_page, 'pageSize', v_size,
      'totalItems', (select total from counted),
      'totalPages', ceil((select total from counted)::numeric / v_size)::integer)
  ) into v_result;
  return v_result;
end;
$$;

create function public.admin_get_farmer(p_supplier_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_full_contacts boolean := private.can_read_supplier_contacts();
  v_result jsonb;
begin
  if not private.can_read_suppliers() then
    raise exception 'not authorized' using errcode = 'PT403';
  end if;
  select jsonb_build_object(
    'id', s.id, 'supplierCode', s.supplier_code, 'name', s.name, 'supplierType', s.supplier_type,
    'status', s.status, 'addressLine', s.address_line, 'villageLocality', s.village_locality,
    'mandal', s.mandal, 'district', s.district, 'state', s.state, 'pinCode', s.pin_code, 'notes', s.notes,
    'landAreaValue', fp.land_area_value::text, 'landAreaUnit', fp.land_area_unit,
    'hasPhoto', coalesce(fp.has_photo, false),
    'canViewPhoto', private.has_any_role(array['super_admin', 'operations_admin', 'finance_admin']::public.app_role[]),
    'verifiedAt', s.verified_at, 'verifiedBy', s.verified_by,
    'deactivatedAt', s.deactivated_at, 'deactivationReason', s.deactivation_reason,
    'primaryPhone', (select case when v_full_contacts then c.phone_e164 else private.mask_phone(c.phone_e164) end
                       from public.supplier_contacts c
                      where c.supplier_id = s.id and c.contact_type = 'primary' and c.is_active),
    'secondaryPhone', (select case when v_full_contacts then c.phone_e164 else private.mask_phone(c.phone_e164) end
                         from public.supplier_contacts c
                        where c.supplier_id = s.id and c.contact_type = 'secondary' and c.is_active),
    'phoneMasked', not v_full_contacts,
    'createdAt', s.created_at, 'updatedAt', s.updated_at, 'version', s.version
  ) into v_result
  from public.suppliers s
  left join public.farmer_profiles fp on fp.supplier_id = s.id
  where s.id = p_supplier_id and s.supplier_type = 'farmer';

  if v_result is null then
    raise exception 'farmer not found' using errcode = 'PT404';
  end if;
  return v_result;
end;
$$;

-- Supply list (WEB_ADMIN §8 views by date, farmer, product/category, status).
create function public.admin_list_supply(
  p_business_date date default null,
  p_supplier_id uuid default null,
  p_product_id uuid default null,
  p_category_id uuid default null,
  p_status public.supply_status default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_size integer := least(100, greatest(1, coalesce(p_page_size, 25)));
  v_today date := public.current_business_date();
  v_result jsonb;
begin
  if not private.can_read_supply() then
    raise exception 'not authorized' using errcode = 'PT403';
  end if;

  with base as (
    select c.*, s.name as supplier_name, s.supplier_code, s.status as supplier_status,
           p.name as product_name, p.product_code, sp.full_name as confirmed_by_name
    from public.supply_confirmations c
    join public.suppliers s on s.id = c.supplier_id
    join public.products p on p.id = c.product_id
    left join public.staff_profiles sp on sp.user_id = c.confirmed_by
    where (p_business_date is null or c.business_date = p_business_date)
      and (p_supplier_id is null or c.supplier_id = p_supplier_id)
      and (p_product_id is null or c.product_id = p_product_id)
      and (p_category_id is null or p.category_id = p_category_id)
      and (p_status is null or c.status = p_status)
  ),
  counted as (select count(*)::integer as total from base),
  page as (
    select * from base order by business_date desc, product_name, supplier_name, id
    offset (v_page - 1) * v_size limit v_size
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'supplierId', supplier_id, 'supplierCode', supplier_code, 'supplierName', supplier_name,
        'supplierStatus', supplier_status, 'productId', product_id, 'productCode', product_code,
        'productName', product_name, 'businessDate', business_date, 'quantity', quantity::text, 'unit', unit,
        'confirmationSource', confirmation_source, 'confirmedBy', confirmed_by, 'confirmedByName', confirmed_by_name,
        'confirmedAt', confirmed_at, 'note', note, 'hasEvidence', has_evidence, 'status', status,
        'isExpired', business_date < v_today, 'changeReason', change_reason,
        'updatedAt', updated_at, 'version', version
      )) from page), '[]'::jsonb),
    'pagination', jsonb_build_object(
      'page', v_page, 'pageSize', v_size,
      'totalItems', (select total from counted),
      'totalPages', ceil((select total from counted)::numeric / v_size)::integer)
  ) into v_result;
  return v_result;
end;
$$;

-- Overview dashboard (WEB_ADMIN §5 MVP widgets). Supply-based widgets require
-- supply readers; other dashboard roles receive only the counts they may see.
create function public.dashboard_overview(p_business_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := public.current_business_date();
  v_result jsonb;
begin
  if not private.is_dashboard_staff() then
    raise exception 'not authorized' using errcode = 'PT403';
  end if;
  if not private.can_read_supply() then
    return jsonb_build_object('businessDate', p_business_date, 'serverBusinessDate', v_today, 'supplyWidgets', false);
  end if;

  with avail as (
    select a.*, p.name, p.product_code, p.low_supply_threshold, p.is_listable
    from private.product_availability_core(p_business_date) a
    join public.products p on p.id = a.product_id
  )
  select jsonb_build_object(
    'businessDate', p_business_date,
    'serverBusinessDate', v_today,
    'supplyWidgets', true,
    'activeFarmers', (select count(*) from public.suppliers where supplier_type = 'farmer' and status = 'active'),
    'activeProductsWithAvailability', (select count(*) from avail where atp > 0),
    'activeSupplyRecords', (select count(*) from public.supply_confirmations
                             where business_date = p_business_date and status = 'active' and quantity > 0),
    'zeroSupplyProducts', coalesce((select jsonb_agg(jsonb_build_object(
        'productId', product_id, 'productCode', product_code, 'name', name, 'unit', base_unit) order by name)
        from avail where atp = 0), '[]'::jsonb),
    'lowSupplyProducts', coalesce((select jsonb_agg(jsonb_build_object(
        'productId', product_id, 'productCode', product_code, 'name', name, 'unit', base_unit,
        'sellableQuantity', atp::text, 'threshold', low_supply_threshold::text) order by atp)
        from avail where atp > 0 and low_supply_threshold is not null and atp <= low_supply_threshold), '[]'::jsonb),
    'recentSupplyUpdates', coalesce((select jsonb_agg(r) from (
        select jsonb_build_object(
          'id', c.id, 'supplierName', s.name, 'supplierCode', s.supplier_code, 'productName', p.name,
          'businessDate', c.business_date, 'quantity', c.quantity::text, 'unit', c.unit, 'status', c.status,
          'updatedAt', c.updated_at) as r
        from public.supply_confirmations c
        join public.suppliers s on s.id = c.supplier_id
        join public.products p on p.id = c.product_id
        order by c.updated_at desc limit 10) x), '[]'::jsonb),
    'expiredActiveRecords', (select count(*) from public.supply_confirmations
                              where status = 'active' and business_date < v_today
                                and business_date >= v_today - 7),
    'inactiveRecordsForDate', (select count(*) from public.supply_confirmations
                                where business_date = p_business_date and status = 'inactive'),
    'inactiveFarmersWithFutureSupply', (select count(distinct c.supplier_id) from public.supply_confirmations c
                                          join public.suppliers s on s.id = c.supplier_id
                                         where c.status = 'active' and c.business_date >= v_today and s.status <> 'active')
  ) into v_result;
  return v_result;
end;
$$;

-- Products & Availability table: per product with unit, plus per-SKU view.
create function public.admin_product_availability(p_business_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_read_supply() then
    raise exception 'not authorized' using errcode = 'PT403';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'productId', a.product_id, 'productCode', p.product_code, 'name', p.name, 'categoryName', cat.name,
      'baseUnit', a.base_unit, 'farmerConfirmedSupply', a.open_confirmed_supply::text,
      'sellableQuantity', a.atp::text, 'contributingFarmers', a.contributing_supplier_count,
      'lowSupplyThreshold', p.low_supply_threshold::text, 'isListable', p.is_listable,
      'skus', coalesce((select jsonb_agg(jsonb_build_object(
          'skuId', k.sku_id, 'skuCode', k.sku_code, 'packQuantity', k.pack_quantity::text,
          'pricePaise', k.price_paise, 'maxOrderable', k.max_orderable, 'availabilityStatus', k.availability_status)
          order by k.pack_quantity)
        from public.sku_availability(p_business_date, null, array[a.product_id]) k), '[]'::jsonb)
    ) order by p.display_order, p.name)
    from private.product_availability_core(p_business_date) a
    join public.products p on p.id = a.product_id
    join public.categories cat on cat.id = p.category_id
  ), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function public.admin_create_supply(uuid, uuid, date, numeric, text, text, uuid, timestamptz, text, text, text) from public, anon;
revoke all on function public.admin_update_supply(uuid, integer, numeric, text, text, text) from public, anon;
revoke all on function public.admin_set_supply_status(uuid, integer, public.supply_status, text, text) from public, anon;
revoke all on function public.admin_register_staff(uuid, text, public.app_role[], text) from public, anon;
revoke all on function public.admin_set_staff_roles(uuid, public.app_role[], text, text) from public, anon;
revoke all on function public.admin_set_staff_status(uuid, boolean, text, text) from public, anon;
revoke all on function public.admin_update_staff_name(uuid, text, text) from public, anon;
revoke all on function public.record_staff_login() from public, anon;
revoke all on function public.admin_list_staff() from public, anon;
revoke all on function public.admin_list_farmers(text, public.supplier_status, text, text, uuid, text, integer, integer) from public, anon;
revoke all on function public.admin_get_farmer(uuid) from public, anon;
revoke all on function public.admin_list_supply(date, uuid, uuid, uuid, public.supply_status, integer, integer) from public, anon;
revoke all on function public.dashboard_overview(date) from public, anon;
revoke all on function public.admin_product_availability(date) from public, anon;

grant execute on function public.admin_create_supply(uuid, uuid, date, numeric, text, text, uuid, timestamptz, text, text, text) to authenticated;
grant execute on function public.admin_update_supply(uuid, integer, numeric, text, text, text) to authenticated;
grant execute on function public.admin_set_supply_status(uuid, integer, public.supply_status, text, text) to authenticated;
grant execute on function public.admin_register_staff(uuid, text, public.app_role[], text) to authenticated;
grant execute on function public.admin_set_staff_roles(uuid, public.app_role[], text, text) to authenticated;
grant execute on function public.admin_set_staff_status(uuid, boolean, text, text) to authenticated;
grant execute on function public.admin_update_staff_name(uuid, text, text) to authenticated;
grant execute on function public.record_staff_login() to authenticated;
grant execute on function public.admin_list_staff() to authenticated;
grant execute on function public.admin_list_farmers(text, public.supplier_status, text, text, uuid, text, integer, integer) to authenticated;
grant execute on function public.admin_get_farmer(uuid) to authenticated;
grant execute on function public.admin_list_supply(date, uuid, uuid, uuid, public.supply_status, integer, integer) to authenticated;
grant execute on function public.dashboard_overview(date) to authenticated;
grant execute on function public.admin_product_availability(date) to authenticated;
