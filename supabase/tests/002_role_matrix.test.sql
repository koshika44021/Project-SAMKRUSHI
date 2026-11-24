-- Role matrix (WEB_ADMIN §3, ADR-0005): read visibility per role and table,
-- write denial for every client role, RPC authorization, viewer masking.
begin;
\ir _helpers.psql
select * from no_plan();

-- ---------------------------------------------------------------- fixtures
create temporary table actors (label text primary key, user_id uuid);
grant select on actors to anon, authenticated, service_role;

insert into actors values
  ('super_admin',      tests.create_user('super',    '{super_admin}',      true)),
  ('operations_admin', tests.create_user('ops',      '{operations_admin}', true)),
  ('finance_admin',    tests.create_user('finance',  '{finance_admin}',    true)),
  ('dispatch_admin',   tests.create_user('dispatch', '{dispatch_admin}',   true)),
  ('support_agent',    tests.create_user('support',  '{support_agent}',    true)),
  ('rider',            tests.create_user('rider',    '{rider}',            true)),
  ('viewer',           tests.create_user('viewer',   '{viewer}',           true)),
  ('customer',         tests.create_user('customer', '{customer}',         false)),
  ('inactive_ops',     tests.create_user('inactive', '{operations_admin}', true, false)),
  ('staff_no_role',    tests.create_user('norole',   '{}',                 true)),
  ('anon',             null);

insert into public.profiles (id, full_name) select user_id, 'Customer' from actors where label = 'customer';

insert into public.categories (id, code, name) values ('00000000-0000-0000-0000-0000000000c1', 'dev-cat', 'DEV Category');
insert into public.products (id, product_code, category_id, name, slug, base_unit, is_listable)
  values ('00000000-0000-0000-0000-0000000000a1', 'DEV-A', '00000000-0000-0000-0000-0000000000c1',
          'DEV Product A', 'dev-product-a', 'kg', true);
insert into public.product_skus (product_id, sku_code, label, pack_quantity, sale_unit, price_paise)
  values ('00000000-0000-0000-0000-0000000000a1', 'DEV-A-1KG', '1 kg', 1, 'pack', 100);
insert into public.product_images (product_id, storage_key, alt_text)
  values ('00000000-0000-0000-0000-0000000000a1', 'products/dev-a.webp', 'DEV image');

insert into public.suppliers (id, supplier_code, name, supplier_type, status)
  values ('00000000-0000-0000-0000-0000000000f1', 'SAM-FRM-900001', 'DEV Farmer One', 'farmer', 'active');
insert into public.farmer_profiles (supplier_id, land_area_value, land_area_unit, photo_storage_key)
  values ('00000000-0000-0000-0000-0000000000f1', 2.5, 'acre', 'farmers/dev-photo.webp');
insert into public.supplier_contacts (supplier_id, contact_type, phone_e164)
  values ('00000000-0000-0000-0000-0000000000f1', 'primary', '+919900001234');

insert into public.supply_confirmation_sources (code, label) values ('dev_phone_call', 'DEV phone call');
insert into public.supply_confirmations
  (supplier_id, product_id, business_date, quantity, unit, confirmation_source, confirmed_by, confirmed_at)
  select '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1',
         public.current_business_date() + 1, 10, 'kg', 'dev_phone_call', user_id, now()
  from actors where label = 'super_admin';

insert into public.app_settings (key, value, description) values ('dev.example', '1', 'DEV example setting');
insert into public.policy_versions (policy_type, version_number, title, body_markdown)
  values ('refund', 1, 'DEV refund policy', 'Content pending founder/legal approval');

-- --------------------------------------------------------- read visibility
-- expected: true = sees rows, false = sees nothing (0 rows or no privilege)
create temporary table expected (tbl text, label text, visible boolean);
grant select on expected to anon, authenticated, service_role;

insert into expected
select t.tbl, a.label, a.label = any (t.readers)
from (values
  ('suppliers',                   '{super_admin,operations_admin,finance_admin,viewer}'::text[]),
  ('farmer_profiles',             '{super_admin,operations_admin,finance_admin,viewer}'),
  ('supplier_contacts',           '{super_admin,operations_admin,finance_admin}'),
  ('categories',                  '{super_admin,operations_admin,finance_admin,support_agent,viewer}'),
  ('products',                    '{super_admin,operations_admin,finance_admin,support_agent,viewer}'),
  ('product_skus',                '{super_admin,operations_admin,finance_admin,support_agent,viewer}'),
  ('product_images',              '{super_admin,operations_admin,finance_admin,support_agent,viewer}'),
  ('sku_price_history',           '{super_admin,operations_admin,finance_admin}'),
  ('supply_confirmations',        '{super_admin,operations_admin,viewer}'),
  ('supply_confirmation_sources', '{super_admin,operations_admin,viewer}'),
  ('units',                       '{super_admin,operations_admin,finance_admin,support_agent,viewer}'),
  ('audit_logs',                  '{super_admin}'),
  ('app_settings',                '{super_admin}'),
  ('rate_limit_counters',         '{}'),
  ('policy_versions',             '{super_admin,operations_admin,finance_admin,dispatch_admin,support_agent,viewer}'),
  -- own row only for these; listed readers can see rows
  ('profiles',                    '{customer}'),
  ('staff_profiles',              '{super_admin,operations_admin,finance_admin,dispatch_admin,support_agent,viewer,rider,inactive_ops,staff_no_role}'),
  ('user_roles',                  '{super_admin,operations_admin,finance_admin,dispatch_admin,support_agent,viewer,rider,inactive_ops,customer}')
) as t(tbl, readers)
cross join actors a;

select ok(
  (tests.visible_rows(a.user_id, e.tbl) > 0) = e.visible,
  format('%s %s read %s', e.label, case when e.visible then 'CAN' else 'CANNOT' end, e.tbl)
)
from expected e join actors a using (label)
order by e.tbl, e.label;

-- Own-row scoping: non-super staff see only their own role rows.
select is(
  tests.visible_rows((select user_id from actors where label = 'operations_admin'), 'user_roles'),
  1::bigint, 'operations_admin sees only its own user_roles row'
);
select is(
  tests.visible_rows((select user_id from actors where label = 'super_admin'), 'user_roles'),
  (select count(*) from public.user_roles), 'super_admin sees every user_roles row'
);
select is(
  tests.visible_rows((select user_id from actors where label = 'rider'), 'staff_profiles'),
  1::bigint, 'rider sees only its own staff profile'
);
select is(
  tests.visible_rows((select user_id from actors where label = 'viewer'), 'staff_profiles'),
  1::bigint, 'viewer sees only its own staff profile (Staff/Users is super_admin-only)'
);
select is(
  tests.visible_rows((select user_id from actors where label = 'operations_admin'), 'staff_profiles'),
  1::bigint, 'operations_admin sees only its own staff profile'
);
select is(
  tests.visible_rows((select user_id from actors where label = 'super_admin'), 'staff_profiles'),
  (select count(*) from public.staff_profiles), 'super_admin sees every staff profile'
);
select is(
  tests.visible_rows((select user_id from actors where label = 'customer'), 'profiles'),
  1::bigint, 'customer sees only its own profile'
);

-- ------------------------------------------------------------ write denial
-- No client role can mutate business tables directly (insufficient_privilege).
create temporary table write_attempts (label text, sql text);
grant select on write_attempts to anon, authenticated, service_role;
insert into write_attempts
select a.label, w.sql
from actors a
cross join (values
  ($$insert into public.suppliers (supplier_code, name, supplier_type) values ('SAM-X-1', 'X', 'farmer')$$),
  ($$update public.suppliers set name = 'Hacked'$$),
  ($$update public.products set is_listable = true$$),
  ($$update public.product_skus set price_paise = 1$$),
  ($$delete from public.supply_confirmations$$),
  ($$insert into public.audit_logs (action, entity_type, entity_id) values ('x', 'x', 'x')$$),
  ($$insert into public.user_roles (user_id, role) values (auth.uid(), 'super_admin')$$),
  ($$update public.staff_profiles set is_active = true$$),
  ($$update public.app_settings set value = '2'$$),
  ($$insert into public.profiles (id) values (gen_random_uuid())$$),
  ($$update public.profiles set full_name = 'x'$$),
  ($$update public.farmer_profiles set land_area_value = 1$$),
  ($$insert into public.supplier_contacts (supplier_id, contact_type, phone_e164) values ('00000000-0000-0000-0000-0000000000f1', 'authorized', '+919900009999')$$),
  ($$insert into public.categories (code, name) values ('x-cat', 'X')$$),
  ($$delete from public.units$$),
  ($$update public.policy_versions set title = 'x'$$),
  ($$delete from public.product_images$$),
  ($$insert into public.sku_price_history (sku_id, price_paise) select id, 1 from public.product_skus limit 1$$),
  ($$insert into public.supply_confirmation_sources (code, label) values ('x_src', 'X')$$),
  ($$truncate public.suppliers cascade$$),
  ($$truncate public.audit_logs$$)
) as w(sql);

create function tests.attempt_write(p_user_id uuid, p_sql text) returns text
language plpgsql as $$
begin
  if p_user_id is null then perform tests.authenticate_as_anon(); else perform tests.authenticate_as(p_user_id); end if;
  begin
    execute p_sql;
    perform tests.clear_authentication();
    return 'succeeded';
  exception when others then
    perform tests.clear_authentication();
    return sqlstate;
  end;
end;
$$;
grant execute on function tests.attempt_write(uuid, text) to anon, authenticated;

select is(
  tests.attempt_write(a.user_id, w.sql), '42501',
  format('%s is denied: %s', w.label, left(w.sql, 60))
)
from write_attempts w join actors a using (label);

-- ----------------------------------------------------------- RPC behaviour
select tests.authenticate_as((select user_id from actors where label = 'super_admin'));
select is((select is_active_staff from public.my_access()), true, 'my_access: super_admin is active staff');
select is((select roles from public.my_access()), '{super_admin}'::public.app_role[], 'my_access: super_admin roles');
select tests.clear_authentication();

select tests.authenticate_as((select user_id from actors where label = 'inactive_ops'));
select is((select is_active_staff from public.my_access()), false, 'my_access: inactive staff is not active staff');
select is((select roles from public.my_access()), '{}'::public.app_role[], 'my_access: inactive staff holds no effective roles');
select tests.clear_authentication();

select tests.authenticate_as((select user_id from actors where label = 'customer'));
select is((select is_active_staff from public.my_access()), false, 'my_access: customer is not staff');
select is((select roles from public.my_access()), '{customer}'::public.app_role[], 'my_access: customer role only');
select throws_ok(
  $$select * from public.product_availability(public.current_business_date())$$,
  '42501', null, 'customer cannot call product_availability directly'
);
select tests.clear_authentication();

select tests.authenticate_as((select user_id from actors where label = 'staff_no_role'));
select is((select is_active_staff from public.my_access()), false, 'my_access: staff profile without roles is not active staff');
select tests.clear_authentication();

select tests.authenticate_as((select user_id from actors where label = 'rider'));
select throws_ok(
  $$select * from public.product_availability(public.current_business_date())$$,
  '42501', null, 'rider cannot read availability'
);
select throws_ok(
  $$select * from public.supplier_contact_summaries(array['00000000-0000-0000-0000-0000000000f1'::uuid])$$,
  '42501', null, 'rider cannot read supplier contacts'
);
select tests.clear_authentication();

select tests.authenticate_as((select user_id from actors where label = 'inactive_ops'));
select throws_ok(
  $$select * from public.product_availability(public.current_business_date())$$,
  '42501', null, 'inactive operations staff cannot read availability'
);
select tests.clear_authentication();

select tests.authenticate_as((select user_id from actors where label = 'viewer'));
select is(
  (select atp from public.product_availability(public.current_business_date() + 1)
    where product_id = '00000000-0000-0000-0000-0000000000a1'),
  10.000::numeric, 'viewer can read availability'
);
select is(
  (select phone from public.supplier_contact_summaries(array['00000000-0000-0000-0000-0000000000f1'::uuid])),
  '+91******1234', 'viewer sees a masked supplier phone'
);
select is(
  (select is_masked from public.supplier_contact_summaries(array['00000000-0000-0000-0000-0000000000f1'::uuid])),
  true, 'viewer contact summary is flagged as masked'
);
select tests.clear_authentication();

select tests.authenticate_as((select user_id from actors where label = 'operations_admin'));
select is(
  (select phone from public.supplier_contact_summaries(array['00000000-0000-0000-0000-0000000000f1'::uuid])),
  '+919900001234', 'operations_admin sees the full supplier phone'
);
select tests.clear_authentication();

-- Availability is limited to supply readers + service_role (WEB_ADMIN §3:
-- farmer supply is No for finance, dispatch and support).
select tests.authenticate_as(a.user_id) from actors a where a.label = 'finance_admin';
select throws_ok($$select * from public.product_availability(public.current_business_date())$$,
  '42501', null, 'finance_admin cannot read availability');
select throws_ok($$select * from public.sku_availability(public.current_business_date())$$,
  '42501', null, 'finance_admin cannot read SKU availability');
select tests.clear_authentication();
select tests.authenticate_as(a.user_id) from actors a where a.label = 'dispatch_admin';
select throws_ok($$select * from public.product_availability(public.current_business_date())$$,
  '42501', null, 'dispatch_admin cannot read availability');
select throws_ok($$select * from public.sku_availability(public.current_business_date())$$,
  '42501', null, 'dispatch_admin cannot read SKU availability (prices/catalog)');
select tests.clear_authentication();
select tests.authenticate_as(a.user_id) from actors a where a.label = 'support_agent';
select throws_ok($$select * from public.product_availability(public.current_business_date())$$,
  '42501', null, 'support_agent cannot read availability');
select tests.clear_authentication();
select tests.authenticate_as(a.user_id) from actors a where a.label = 'customer';
select throws_ok($$select * from private.product_availability_core(public.current_business_date())$$,
  '42501', null, 'clients cannot call the private availability core');
select tests.clear_authentication();

-- Private object keys are not readable by any client (column grants).
select tests.authenticate_as(a.user_id) from actors a where a.label = 'viewer';
select throws_ok($$select photo_storage_key from public.farmer_profiles$$, '42501', null,
  'viewer cannot read farmer photo keys');
select throws_ok($$select evidence_storage_key from public.supply_confirmations$$, '42501', null,
  'viewer cannot read supply evidence keys');
select is((select has_photo from public.farmer_profiles where supplier_id = '00000000-0000-0000-0000-0000000000f1'), true, 'viewer sees only that a photo exists');
select is((select count(*)::int from public.staff_display_names(array[(select user_id from actors where label = 'super_admin')])),
  1, 'dashboard staff can resolve actor display names');
select tests.clear_authentication();
select tests.authenticate_as(a.user_id) from actors a where a.label = 'super_admin';
select throws_ok($$select photo_storage_key from public.farmer_profiles$$, '42501', null,
  'even super_admin reads photo keys only through server code (signed URLs)');
select tests.clear_authentication();
select tests.authenticate_as(a.user_id) from actors a where a.label = 'rider';
select throws_ok($$select * from public.staff_display_names(array[gen_random_uuid()])$$, '42501', null,
  'rider cannot resolve staff names');
select tests.clear_authentication();

select tests.authenticate_as_service_role();
select is(
  (select atp from public.product_availability(public.current_business_date() + 1)
    where product_id = '00000000-0000-0000-0000-0000000000a1'),
  10.000::numeric, 'service_role (Edge Functions) can read availability'
);
select tests.clear_authentication();

select * from finish();
rollback;
