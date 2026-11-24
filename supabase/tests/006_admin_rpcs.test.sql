-- Phase 3 admin RPCs: authorization, audit context, optimistic concurrency,
-- duplicate phones, supply rules, staff administration, reads, rate limiter.
-- All values are SYNTHETIC.
begin;
\ir _helpers.psql
select * from no_plan();

create temporary table actors (label text primary key, user_id uuid);
grant select on actors to anon, authenticated, service_role;
insert into actors values
  ('super',    tests.create_user('super',    '{super_admin}',      true)),
  ('super2',   tests.create_user('super2',   '{super_admin}',      true)),
  ('ops',      tests.create_user('ops',      '{operations_admin}', true)),
  ('finance',  tests.create_user('finance',  '{finance_admin}',    true)),
  ('dispatch', tests.create_user('dispatch', '{dispatch_admin}',   true)),
  ('viewer',   tests.create_user('viewer',   '{viewer}',           true)),
  ('customer', tests.create_user('customer', '{customer}',         false)),
  ('inactive', tests.create_user('inactive', '{operations_admin}', true, false)),
  ('newstaff', tests.create_user('newstaff', '{}',                 false));

create function tests.as_(p_label text) returns void language sql as $$
  select tests.authenticate_as((select user_id from actors where label = p_label));
$$;
grant execute on function tests.as_(text) to authenticated;

insert into public.supply_confirmation_sources (code, label) values ('dev_phone_call', 'DEV phone call');
insert into public.categories (id, code, name) values ('00000000-0000-0000-0000-0000000000c1', 'dev-cat', 'DEV Category');
insert into public.products (id, product_code, category_id, name, slug, base_unit, low_supply_threshold, is_listable)
values
  ('00000000-0000-0000-0000-0000000000a1', 'DEV-A', '00000000-0000-0000-0000-0000000000c1', 'DEV Produce A', 'dev-a', 'kg', 15, true),
  ('00000000-0000-0000-0000-0000000000a2', 'DEV-B', '00000000-0000-0000-0000-0000000000c1', 'DEV Produce B', 'dev-b', 'piece', null, true);
insert into public.product_skus (product_id, sku_code, label, pack_quantity, sale_unit, price_paise)
values ('00000000-0000-0000-0000-0000000000a1', 'DEV-A-1KG', '1 kg', 1, 'pack', 100);

create temporary table ids (k text primary key, v uuid);
grant select, insert, update on ids to authenticated;
create temporary table vers (k text primary key, v integer);
grant select, insert, update on vers to authenticated;

-- ------------------------------------------------------------ farmer create
create function tests.create_farmer(p_name text, p_phone text, p_dup_reason text default null) returns jsonb
language sql as $$
  select public.admin_create_farmer(
    p_name => p_name, p_address_line => 'DEV address', p_village_locality => 'DEV Village',
    p_mandal => 'DEV Mandal', p_district => 'DEV District', p_state => 'DEV State', p_pin_code => '500001',
    p_primary_phone => p_phone, p_land_area_value => 2.5, p_land_area_unit => 'acre',
    p_duplicate_phone_reason => p_dup_reason, p_request_id => 'req-create-' || p_name);
$$;
grant execute on function tests.create_farmer(text, text, text) to authenticated;

select tests.as_('viewer');
select throws_ok($$select tests.create_farmer('DEV Viewer Farmer', '+919900000001')$$, 'PT403', null, 'viewer cannot register farmers');
select tests.clear_authentication();
select tests.as_('finance');
select throws_ok($$select tests.create_farmer('DEV Finance Farmer', '+919900000001')$$, 'PT403', null, 'finance cannot register farmers');
select tests.clear_authentication();
select tests.as_('inactive');
select throws_ok($$select tests.create_farmer('DEV Inactive Farmer', '+919900000001')$$, 'PT403', null, 'inactive staff cannot register farmers');
select tests.clear_authentication();
select tests.as_('customer');
select throws_ok($$select tests.create_farmer('DEV Customer Farmer', '+919900000001')$$, 'PT403', null, 'customers cannot register farmers');
select tests.clear_authentication();

select tests.as_('ops');
insert into ids select 'f1', (tests.create_farmer('DEV Farmer One', '+919900000001') ->> 'id')::uuid;
select tests.clear_authentication();

select matches((select supplier_code from public.suppliers where id = (select v from ids where k = 'f1')),
  '^SAM-FRM-[0-9]{6}$', 'farmers get a generated SAM-FRM-###### code');
select results_eq(
  $$select actor_role, reason, request_id, source from public.audit_logs
     where action = 'suppliers.insert' and entity_id = (select v from ids where k = 'f1')::text$$,
  $$values ('operations_admin'::text, 'farmer registered'::text, 'req-create-DEV Farmer One'::text, 'admin-web'::text)$$,
  'the RPC sets audit context: actor role, reason, request id, source'
);
select is((select actor_user_id from public.audit_logs where action = 'suppliers.insert'
            and entity_id = (select v from ids where k = 'f1')::text),
  (select user_id from actors where label = 'ops'), 'audit records the real staff actor');
select is((select status::text from public.suppliers where id = (select v from ids where k = 'f1')), 'active',
  'dev default: farmers are active on creation');
select is((select count(*)::int from public.supplier_contacts where supplier_id = (select v from ids where k = 'f1') and is_active),
  1, 'primary contact stored');

-- duplicate phone
select tests.as_('ops');
select throws_ok($$select tests.create_farmer('DEV Farmer Two', '+919900000001')$$, 'PT409', 'duplicate_phone',
  'a duplicate phone requires explicit confirmation');
insert into ids select 'f2', (tests.create_farmer('DEV Farmer Two', '+919900000001', 'DEV shared family phone') ->> 'id')::uuid;
select tests.clear_authentication();
select matches((select reason from public.audit_logs where action = 'suppliers.insert'
                 and entity_id = (select v from ids where k = 'f2')::text),
  'duplicate phone confirmed: DEV shared family phone', 'the duplicate-phone confirmation reason is audited');

-- ------------------------------------------------------------ farmer update
insert into vers select 'f1', version from public.suppliers where id = (select v from ids where k = 'f1');

create function tests.update_farmer(p_version integer, p_reason text, p_secondary text default null) returns jsonb
language sql as $$
  select public.admin_update_farmer(
    p_supplier_id => (select v from ids where k = 'f1'), p_expected_version => p_version,
    p_name => 'DEV Farmer One Renamed', p_address_line => 'DEV address', p_village_locality => 'DEV Village',
    p_mandal => 'DEV Mandal', p_district => 'DEV District', p_state => 'DEV State', p_pin_code => '500001',
    p_primary_phone => '+919900000001', p_secondary_phone => p_secondary, p_reason => p_reason);
$$;
grant execute on function tests.update_farmer(integer, text, text) to authenticated;

select tests.as_('ops');
select throws_ok($$select tests.update_farmer((select v from vers where k = 'f1'), null)$$, 'PT422', null,
  'editing a farmer requires a reason');
select throws_ok($$select tests.update_farmer((select v from vers where k = 'f1') + 5, 'DEV correction')$$, 'PT409', 'version_conflict',
  'a stale version is rejected (optimistic concurrency)');
select is((tests.update_farmer((select v from vers where k = 'f1'), 'DEV correction', '+919900000099') ->> 'version')::int,
  (select v from vers where k = 'f1') + 1, 'a valid edit bumps the version');
select tests.clear_authentication();
select is((select phone_e164 from public.supplier_contacts where supplier_id = (select v from ids where k = 'f1')
            and contact_type = 'secondary' and is_active), '+919900000099', 'secondary contact added');
update vers set v = (select version from public.suppliers where id = (select v from ids where k = 'f1')) where k = 'f1';
select tests.as_('ops');
select lives_ok($$select tests.update_farmer((select v from vers where k = 'f1'), 'DEV remove secondary', null)$$,
  'secondary contact can be removed');
select tests.clear_authentication();
select is((select count(*)::int from public.supplier_contacts where supplier_id = (select v from ids where k = 'f1')
            and contact_type = 'secondary' and is_active), 0, 'removed secondary contact is deactivated, not deleted');

-- ------------------------------------------------------------ farmer status
update vers set v = (select version from public.suppliers where id = (select v from ids where k = 'f2')) where k = 'f1';
select tests.as_('ops');
select lives_ok($$select public.admin_set_farmer_status((select v from ids where k = 'f2'), (select v from vers where k = 'f1'),
  'inactive', 'DEV farmer left the programme')$$, 'a farmer can be deactivated with a reason');
select tests.clear_authentication();
select results_eq($$select status::text, deactivation_reason from public.suppliers where id = (select v from ids where k = 'f2')$$,
  $$values ('inactive'::text, 'DEV farmer left the programme'::text)$$, 'deactivation records status and reason');

-- ------------------------------------------------------------ farmer photo
select tests.as_('ops');
select throws_ok($$select public.admin_set_farmer_photo((select v from ids where k = 'f1'), 'other/key.webp')$$, 'PT422', null,
  'photo keys must live under the farmer folder');
select is(public.admin_set_farmer_photo((select v from ids where k = 'f1'),
  'farmers/' || (select v from ids where k = 'f1') || '/a.webp') ->> 'previousKey', null, 'first photo has no previous key');
select is(public.admin_set_farmer_photo((select v from ids where k = 'f1'),
  'farmers/' || (select v from ids where k = 'f1') || '/b.webp') ->> 'previousKey',
  'farmers/' || (select v from ids where k = 'f1') || '/a.webp', 'replacing a photo returns the previous key for deletion');
select is(public.admin_farmer_photo_key((select v from ids where k = 'f1')),
  'farmers/' || (select v from ids where k = 'f1') || '/b.webp', 'operations can resolve the photo key for signing');
select tests.clear_authentication();
select tests.as_('viewer');
select throws_ok($$select public.admin_farmer_photo_key((select v from ids where k = 'f1'))$$, 'PT403', null,
  'viewer cannot obtain photo keys (photos hidden)');
select tests.clear_authentication();

-- ------------------------------------------------------------ supply
create function tests.create_supply(p_product uuid, p_qty numeric, p_unit text default null, p_supplier text default 'f1') returns jsonb
language sql as $$
  select public.admin_create_supply(
    p_supplier_id => (select v from ids where k = p_supplier), p_product_id => p_product,
    p_business_date => public.current_business_date() + 1, p_quantity => p_qty,
    p_confirmation_source => 'dev_phone_call', p_entry_unit => p_unit, p_request_id => 'req-supply');
$$;
grant execute on function tests.create_supply(uuid, numeric, text, text) to authenticated;

select tests.as_('viewer');
select throws_ok($$select tests.create_supply('00000000-0000-0000-0000-0000000000a1', 5)$$, 'PT403', null, 'viewer cannot record supply');
select tests.clear_authentication();

select tests.as_('ops');
insert into ids select 's1', (tests.create_supply('00000000-0000-0000-0000-0000000000a1', 500, 'g') ->> 'id')::uuid;
select tests.clear_authentication();
select results_eq($$select quantity::text, unit from public.supply_confirmations where id = (select v from ids where k = 's1')$$,
  $$values ('0.5'::text, 'kg'::text)$$, '500 g entry is converted exactly to 0.5 kg (base unit)');
select is((select confirmed_by from public.supply_confirmations where id = (select v from ids where k = 's1')),
  (select user_id from actors where label = 'ops'), 'confirmed_by defaults to the acting staff member');

select tests.as_('ops');
select throws_ok($$select tests.create_supply('00000000-0000-0000-0000-0000000000a1', 3)$$, 'PT409', 'duplicate_active_supply',
  'a second active record for the same farmer/product/date is rejected');
select throws_ok($$select tests.create_supply('00000000-0000-0000-0000-0000000000a2', 500, 'g')$$, 'PT422', null,
  'grams cannot convert to pieces');
select throws_ok($$select public.admin_create_supply((select v from ids where k = 'f1'), '00000000-0000-0000-0000-0000000000a2',
  public.current_business_date() + 1, 1, 'unknown_source')$$, 'PT422', null, 'unknown confirmation source rejected');
select throws_ok($$select tests.create_supply('00000000-0000-0000-0000-0000000000a2', 3, null, 'f2')$$, '23514', null,
  'an inactive farmer cannot receive supply');
select throws_ok($$select public.admin_update_supply((select v from ids where k = 's1'), 1, 2, null)$$, 'PT422', null,
  'supply edits require a reason');
select throws_ok($$select public.admin_update_supply((select v from ids where k = 's1'), 99, 2, 'DEV correction')$$, 'PT409', 'version_conflict',
  'stale supply version rejected');
select lives_ok($$select public.admin_update_supply((select v from ids where k = 's1'), 1, 2, 'DEV farmer increased')$$,
  'supply quantity updated with reason');
select tests.clear_authentication();
select results_eq($$select quantity::text, change_reason, version from public.supply_confirmations where id = (select v from ids where k = 's1')$$,
  $$values ('2'::text, 'DEV farmer increased'::text, 2)$$, 'the edit records the reason on the row and bumps the version');
select is((select reason from public.audit_logs where action = 'supply_confirmations.update'
            and entity_id = (select v from ids where k = 's1')::text order by occurred_at desc limit 1),
  'DEV farmer increased', 'the edit reason is audited');

select tests.as_('ops');
select lives_ok($$select public.admin_set_supply_status((select v from ids where k = 's1'), 2, 'inactive', 'DEV duplicate entry')$$,
  'supply deactivated with reason');
insert into ids select 's2', (tests.create_supply('00000000-0000-0000-0000-0000000000a1', 4) ->> 'id')::uuid;
select throws_ok($$select public.admin_set_supply_status((select v from ids where k = 's1'), 3, 'active', 'DEV reactivate')$$, 'PT409', 'duplicate_active_supply',
  'reactivation is blocked while another active record exists');
select tests.clear_authentication();

-- ------------------------------------------------------------ reads
select tests.as_('ops');
select is((public.admin_list_farmers(p_search => 'Renamed') -> 'pagination' ->> 'totalItems')::int, 1, 'search by name');
select is((public.admin_list_farmers(p_search => (select supplier_code from public.suppliers where id = (select v from ids where k = 'f1'))) -> 'pagination' ->> 'totalItems')::int,
  1, 'search by farmer code');
select is((public.admin_list_farmers(p_search => '9900000001') -> 'pagination' ->> 'totalItems')::int, 2, 'operations can search by phone');
select is((public.admin_list_farmers(p_status => 'inactive') -> 'pagination' ->> 'totalItems')::int, 1, 'filter by status');
select is((public.admin_list_farmers(p_page_size => 1) -> 'pagination' ->> 'totalPages')::int, 2, 'pagination metadata');
select throws_ok($$select public.admin_list_farmers(p_sort => 'drop table')$$, 'PT422', null, 'sort is whitelisted');
select is(public.admin_list_supply(p_business_date => public.current_business_date() + 1, p_status => 'active') -> 'items' -> 0 ->> 'quantity', '4',
  'supply quantities are decimal strings');
select is((public.dashboard_overview(public.current_business_date() + 1) ->> 'activeFarmers')::int, 1, 'overview: active farmers');
select is((public.dashboard_overview(public.current_business_date() + 1) ->> 'activeSupplyRecords')::int, 1, 'overview: active supply records');
select is((select e ->> 'sellableQuantity' from jsonb_array_elements(public.dashboard_overview(public.current_business_date() + 1) -> 'lowSupplyProducts') e
            where e ->> 'productCode' = 'DEV-A'), '4', 'overview: low supply uses the shared availability function');
select is((select count(*)::int from jsonb_array_elements(public.dashboard_overview(public.current_business_date() + 1) -> 'zeroSupplyProducts') e
            where e ->> 'productCode' = 'DEV-B'), 1, 'overview: zero-supply products listed');
select is((select e ->> 'sellableQuantity' from jsonb_array_elements(public.admin_product_availability(public.current_business_date() + 1)) e
            where e ->> 'productCode' = 'DEV-A'), '4', 'availability table: sellable quantity as a string');
select tests.clear_authentication();

select tests.as_('viewer');
select is(public.admin_list_farmers(p_search => 'Renamed') -> 'items' -> 0 ->> 'primaryPhone', '+91******0001',
  'viewer sees masked phones in the list');
select is((public.admin_list_farmers(p_search => '9900000001') -> 'pagination' ->> 'totalItems')::int, 0,
  'viewer cannot search by phone');
select is(public.admin_get_farmer((select v from ids where k = 'f1')) ->> 'canViewPhoto', 'false', 'viewer cannot view photos');
select tests.clear_authentication();
select tests.as_('dispatch');
select throws_ok($$select public.admin_list_farmers()$$, 'PT403', null, 'dispatch cannot list farmers');
select is((public.dashboard_overview(public.current_business_date()) ->> 'supplyWidgets')::boolean, false,
  'dispatch gets an overview without supply widgets');
select tests.clear_authentication();

-- ------------------------------------------------------------ staff
-- Isolate from pre-existing data (e.g. a locally bootstrapped super_admin).
delete from public.user_roles
 where role = 'super_admin' and user_id not in (select user_id from actors where user_id is not null);
select tests.as_('ops');
select throws_ok($$select public.admin_register_staff((select user_id from actors where label = 'newstaff'), 'DEV New Staff', '{viewer}')$$,
  'PT403', null, 'only super_admin can register staff');
select tests.clear_authentication();
select tests.as_('super');
select throws_ok($$select public.admin_register_staff((select user_id from actors where label = 'newstaff'), 'DEV New Staff', '{customer}')$$,
  'PT422', null, 'customer is not a staff role');
select lives_ok($$select public.admin_register_staff((select user_id from actors where label = 'newstaff'), 'DEV New Staff', '{viewer,operations_admin}')$$,
  'super_admin registers a staff member with roles');
select lives_ok($$select public.admin_set_staff_roles((select user_id from actors where label = 'super2'), '{viewer}', 'DEV demote second admin')$$,
  'a super_admin can be demoted while another remains');
select throws_ok($$select public.admin_set_staff_roles((select user_id from actors where label = 'super'), '{viewer}', 'DEV demote last admin')$$,
  'PT409', null, 'the last active super_admin cannot be demoted');
select throws_ok($$select public.admin_set_staff_status((select user_id from actors where label = 'super'), false, 'DEV self lockout')$$,
  'PT409', null, 'a super_admin cannot deactivate their own account');
select lives_ok($$select public.admin_set_staff_status((select user_id from actors where label = 'newstaff'), false, 'DEV left the company')$$,
  'staff can be deactivated with a reason');
select is((select count(*)::int from jsonb_array_elements(public.admin_list_staff()) e where e ->> 'email' = 'newstaff@test.invalid'),
  1, 'super_admin staff list includes Auth emails');
select tests.clear_authentication();
select results_eq($$select role::text from public.user_roles where user_id = (select user_id from actors where label = 'newstaff') order by role$$,
  $$values ('operations_admin'::text), ('viewer'::text)$$, 'registered roles are stored');

select tests.as_('newstaff');
select is((select is_active_staff from public.my_access()), false, 'deactivated staff lose access immediately');
select tests.clear_authentication();
select tests.as_('ops');
select throws_ok($$select public.admin_list_staff()$$, 'PT403', null, 'operations cannot list staff');
select lives_ok($$select public.record_staff_login()$$, 'active staff can stamp their login');
select tests.clear_authentication();
select isnt((select last_login_at from public.staff_profiles where user_id = (select user_id from actors where label = 'ops')), null,
  'last_login_at recorded');
select tests.as_('customer');
select throws_ok($$select public.record_staff_login()$$, 'PT403', null, 'customers cannot stamp a staff login');
select tests.clear_authentication();

-- ------------------------------------------------------------ staff auth events
select tests.as_('super');
select lives_ok($$select public.admin_record_staff_auth_event((select user_id from actors where label = 'newstaff'), 'password_reset', 'DEV forgot password', 'req-reset')$$,
  'super_admin records an admin-assisted password reset');
select throws_ok($$select public.admin_record_staff_auth_event((select user_id from actors where label = 'newstaff'), 'drop_tables', 'DEV x')$$,
  'PT422', null, 'unknown staff auth events are rejected');
select tests.clear_authentication();
select results_eq($$select action, actor_role, reason, request_id from public.audit_logs where action = 'staff_auth.password_reset'$$,
  $$values ('staff_auth.password_reset'::text, 'super_admin'::text, 'DEV forgot password'::text, 'req-reset'::text)$$,
  'the Auth-side event is audited');
select tests.as_('ops');
select throws_ok($$select public.admin_record_staff_auth_event((select user_id from actors where label = 'newstaff'), 'password_reset', 'DEV x')$$,
  'PT403', null, 'only super_admin records staff auth events');
select tests.clear_authentication();

-- ------------------------------------------------------------ rate limiter
select tests.as_('ops');
select throws_ok($$select * from public.consume_rate_limit('staff_login', 'x', 2, 60)$$, '42501', null,
  'clients cannot call the rate limiter');
select tests.clear_authentication();
select tests.authenticate_as_service_role();
select is((select allowed from public.consume_rate_limit('test_bucket', 'key-1', 2, 3600)), true, 'first hit allowed');
select is((select allowed from public.consume_rate_limit('test_bucket', 'key-1', 2, 3600)), true, 'second hit allowed');
select results_eq($$select allowed, retry_after_seconds > 0 from public.consume_rate_limit('test_bucket', 'key-1', 2, 3600)$$,
  $$values (false, true)$$, 'third hit is limited with a retry-after');
select is((select allowed from public.consume_rate_limit('test_bucket', 'key-2', 2, 3600)), true, 'other keys are independent');
select tests.clear_authentication();
select is((select count(*)::int from public.rate_limit_counters where key_hash like '%key-1%'), 0, 'raw keys are never stored');

select * from finish();
rollback;
