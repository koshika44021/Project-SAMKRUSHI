-- Business-rule constraints: identity, suppliers/farmers, catalog, supply,
-- policies and unit conversion (master §4.1–§4.2, §5; ADR-0004/0005/0006).
begin;
\ir _helpers.psql
select * from no_plan();

-- ---------------------------------------------------------------- identity
select throws_ok(
  $$insert into public.user_roles (user_id, role) values (tests.create_user('cust_x'), 'operations_admin')$$,
  '23514', null, 'a staff role cannot be granted to a user without a staff profile'
);
select lives_ok(
  $$insert into public.user_roles (user_id, role) values (tests.create_user('cust_y'), 'customer')$$,
  'a customer role needs no staff profile'
);
select throws_ok(
  $$insert into public.staff_profiles (user_id, full_name, is_active)
    values ((select id from auth.users where email = 'cust_y@test.invalid'), 'Inactive', false)$$,
  '23514', null, 'inactive staff must record deactivation time and reason'
);
select throws_ok(
  $$insert into public.profiles (id, phone_e164) values ((select id from auth.users where email = 'cust_y@test.invalid'), '9900001234')$$,
  '23514', null, 'profile phone must be E.164'
);

-- --------------------------------------------------------------- suppliers
insert into public.suppliers (id, supplier_code, name, supplier_type, status)
values
  ('00000000-0000-0000-0000-0000000000f1', 'SAM-FRM-900001', 'DEV Farmer', 'farmer', 'active'),
  ('00000000-0000-0000-0000-0000000000f2', 'SAM-FPO-900001', 'DEV FPO', 'fpo', 'active'),
  ('00000000-0000-0000-0000-0000000000f3', 'SAM-FRM-900003', 'DEV Pending Farmer', 'farmer', 'pending_verification');

select lives_ok(
  $$insert into public.farmer_profiles (supplier_id, land_area_value, land_area_unit)
    values ('00000000-0000-0000-0000-0000000000f1', 1.25, 'hectare')$$,
  'a farmer profile attaches to a farmer supplier'
);
select throws_ok(
  $$insert into public.farmer_profiles (supplier_id) values ('00000000-0000-0000-0000-0000000000f2')$$,
  '23503', null, 'a farmer profile cannot attach to a non-farmer supplier'
);
select throws_ok(
  $$update public.suppliers set supplier_type = 'fpo' where id = '00000000-0000-0000-0000-0000000000f1'$$,
  '23503', null, 'a farmer with a profile cannot change supplier type'
);
select throws_ok(
  $$insert into public.farmer_profiles (supplier_id, land_area_value) values ('00000000-0000-0000-0000-0000000000f3', 2)$$,
  '23514', null, 'land area value and unit are stored together'
);
select throws_ok(
  $$insert into public.suppliers (supplier_code, name, supplier_type, pin_code) values ('SAM-FRM-900009', 'X Farmer', 'farmer', '012345')$$,
  '23514', null, 'PIN code must be a six-digit Indian PIN'
);
select throws_ok(
  $$insert into public.suppliers (supplier_code, name, supplier_type) values ('sam-lower', 'X Farmer', 'farmer')$$,
  '23514', null, 'supplier code format is enforced'
);
select throws_ok(
  $$insert into public.suppliers (supplier_code, name, supplier_type) values ('SAM-WHL-1', 'Wholesaler', 'wholesaler')$$,
  '22P02', null, 'wholesaler is not an allowed supplier type'
);
select throws_ok(
  $$update public.suppliers set status = 'inactive' where id = '00000000-0000-0000-0000-0000000000f2'$$,
  '23514', null, 'deactivating a supplier requires a time and reason'
);
select throws_ok(
  $$update public.suppliers set supplier_code = 'SAM-FRM-999999' where id = '00000000-0000-0000-0000-0000000000f1'$$,
  '23514', null, 'supplier code is immutable'
);
select throws_ok(
  $$delete from public.suppliers where id = '00000000-0000-0000-0000-0000000000f2'$$,
  '42501', null, 'suppliers are never hard-deleted'
);
select throws_ok(
  $$insert into public.supplier_contacts (supplier_id, contact_type, phone_e164) values ('00000000-0000-0000-0000-0000000000f1', 'primary', '+91 99000 01234')$$,
  '23514', null, 'contact phone must be E.164'
);
select lives_ok(
  $$insert into public.supplier_contacts (supplier_id, contact_type, phone_e164) values
      ('00000000-0000-0000-0000-0000000000f1', 'primary', '+919900001234'),
      ('00000000-0000-0000-0000-0000000000f2', 'primary', '+919900001234')$$,
  'the same phone may appear on two suppliers (warn, never merge)'
);
select throws_ok(
  $$insert into public.supplier_contacts (supplier_id, contact_type, phone_e164) values ('00000000-0000-0000-0000-0000000000f1', 'primary', '+919900005678')$$,
  '23505', null, 'only one active primary contact per supplier'
);

select is(
  (select version from public.suppliers where id = '00000000-0000-0000-0000-0000000000f1'), 1,
  'supplier starts at version 1'
);
insert into public.suppliers (id, supplier_code, name, supplier_type, version)
  values ('00000000-0000-0000-0000-0000000000f9', 'SAM-FRM-900099', 'DEV Version Probe', 'farmer', 2147483647);
select is((select version from public.suppliers where id = '00000000-0000-0000-0000-0000000000f9'), 1,
  'callers cannot choose the starting version');
select lives_ok($$update public.suppliers set status = 'inactive', deactivated_at = now(), deactivation_reason = 'DEV test'
  where id = '00000000-0000-0000-0000-0000000000f9'$$, 'a supplier can be deactivated with a reason');
select throws_ok($$update public.suppliers set status = 'active' where id = '00000000-0000-0000-0000-0000000000f9'$$,
  '23514', null, 'reactivation must clear the deactivation record');
select lives_ok($$update public.suppliers set status = 'active', deactivated_at = null, deactivation_reason = null
  where id = '00000000-0000-0000-0000-0000000000f9'$$, 'reactivation clears deactivation fields (history stays in audit)');
update public.suppliers set name = 'DEV Farmer Renamed' where id = '00000000-0000-0000-0000-0000000000f1';
select is(
  (select version from public.suppliers where id = '00000000-0000-0000-0000-0000000000f1'), 2,
  'every update bumps the optimistic-concurrency version'
);
select throws_ok(
  $$update public.suppliers set version = 10 where id = '00000000-0000-0000-0000-0000000000f1'$$,
  '42501', null, 'version cannot be set by callers'
);

-- ----------------------------------------------------------------- catalog
insert into public.categories (id, code, name) values ('00000000-0000-0000-0000-0000000000c1', 'dev-cat', 'DEV Category');
insert into public.products (id, product_code, category_id, name, slug, base_unit, quantity_precision)
values
  ('00000000-0000-0000-0000-0000000000a1', 'DEV-A', '00000000-0000-0000-0000-0000000000c1', 'DEV Product A', 'dev-a', 'kg', 3),
  ('00000000-0000-0000-0000-0000000000a2', 'DEV-B', '00000000-0000-0000-0000-0000000000c1', 'DEV Product B', 'dev-b', 'piece', 0),
  ('00000000-0000-0000-0000-0000000000a3', 'DEV-C', '00000000-0000-0000-0000-0000000000c1', 'DEV Product C', 'dev-c', 'kg', 1);

select throws_ok(
  $$insert into public.products (product_code, category_id, name, slug, base_unit) values ('DEV-P', '00000000-0000-0000-0000-0000000000c1', 'DEV Pack', 'dev-pack', 'pack')$$,
  '23514', null, '"pack" is a sale unit, never a base unit'
);
select throws_ok(
  $$insert into public.products (product_code, category_id, name, slug, base_unit) values ('DEV-Q', '00000000-0000-0000-0000-0000000000c1', 'DEV Q', 'dev-q', 'litre')$$,
  '23514', 'unit litre is not allowed as a base unit', 'base unit must be a controlled unit code'
);
select throws_ok(
  $$insert into public.product_skus (product_id, sku_code, label, pack_quantity, sale_unit, price_paise)
    values ('00000000-0000-0000-0000-0000000000a2', 'DEV-B-HALF', 'half', 0.5, 'piece', 100)$$,
  '23514', null, 'SKU pack quantity respects product precision'
);
select throws_ok(
  $$insert into public.product_skus (product_id, sku_code, label, pack_quantity, sale_unit, price_paise)
    values ('00000000-0000-0000-0000-0000000000a1', 'DEV-A-NEG', 'neg', 1, 'pack', -1)$$,
  '23514', null, 'price in paise cannot be negative'
);
select throws_ok(
  $$insert into public.product_skus (product_id, sku_code, label, pack_quantity, sale_unit, price_paise, min_order_packs, max_order_packs)
    values ('00000000-0000-0000-0000-0000000000a1', 'DEV-A-MM', 'mm', 1, 'pack', 100, 5, 2)$$,
  '23514', null, 'max order packs cannot be below min order packs'
);
insert into public.product_skus (id, product_id, sku_code, label, pack_quantity, sale_unit, price_paise)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'DEV-A-500G', '500 g', 0.5, 'pack', 100);

select throws_ok(
  $$update public.products set base_unit = 'g' where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '23514', null, 'base unit is fixed once SKUs reference the product'
);
select throws_ok(
  $$update public.products set quantity_precision = 0 where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '23514', null, 'precision cannot drop below recorded SKU quantities'
);
select throws_ok(
  $$update public.product_skus set sku_code = 'DEV-A-RENAMED' where id = '00000000-0000-0000-0000-0000000000b1'$$,
  '23514', null, 'SKU code is immutable'
);
select throws_ok(
  $$update public.products set product_code = 'DEV-ZZ' where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '23514', null, 'product code is immutable'
);
select throws_ok(
  $$update public.categories set code = 'renamed' where id = '00000000-0000-0000-0000-0000000000c1'$$,
  '23514', null, 'category code is immutable'
);
select throws_ok(
  $$insert into public.product_skus (product_id, sku_code, label, pack_quantity, sale_unit, price_paise)
    values ('00000000-0000-0000-0000-0000000000a1', 'DEV-A-TINY', 'tiny', 0.0015, 'pack', 100)$$,
  '23514', null, 'over-precision pack quantities are rejected, never rounded'
);
select throws_ok(
  $$update public.product_skus set product_id = '00000000-0000-0000-0000-0000000000a3' where id = '00000000-0000-0000-0000-0000000000b1'$$,
  '23514', null, 'a SKU cannot move to another product'
);

select is(public.convert_quantity(500, 'g', 'kg'), 0.5::numeric, '500 g converts exactly to 0.5 kg');
select is(public.convert_quantity(1.25, 'kg', 'g'), 1250::numeric, '1.25 kg converts exactly to 1250 g');
select is(public.convert_quantity(3, 'bunch', 'piece'), null, 'bunch and piece are not convertible');
select is(public.convert_quantity(1, 'kg', 'piece'), null, 'mass and count are not convertible');

-- ------------------------------------------------------------------ supply
insert into public.supply_confirmation_sources (code, label) values ('dev_phone_call', 'DEV phone call');
create temporary table ctx as
  select tests.create_user('ops_c', '{operations_admin}', true) as staff_id,
         public.current_business_date() + 1 as d;

create function tests.add_supply(p_supplier uuid, p_product uuid, p_qty numeric, p_unit text default 'kg', p_date date default null)
returns uuid language sql as $$
  insert into public.supply_confirmations
    (supplier_id, product_id, business_date, quantity, unit, confirmation_source, confirmed_by, confirmed_at)
  select p_supplier, p_product, coalesce(p_date, ctx.d), p_qty, p_unit, 'dev_phone_call', ctx.staff_id, now()
  from ctx
  returning id;
$$;

select throws_ok($$select tests.add_supply('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', 0)$$,
  '23514', null, 'new supply requires quantity > 0');
select throws_ok($$select tests.add_supply('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', -1)$$,
  '23514', null, 'supply quantity cannot be negative');
select throws_ok($$select tests.add_supply('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a3', 1.25)$$,
  '23514', null, 'supply quantity respects product precision');
select throws_ok($$select tests.add_supply('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', 500, 'g')$$,
  '23514', null, 'supply is stored in the product base unit only');
select throws_ok($$select tests.add_supply('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000a1', 5)$$,
  '23514', null, 'a supplier pending verification cannot record supply');
select throws_ok(
  $$insert into public.supply_confirmations (supplier_id, product_id, business_date, quantity, unit, confirmation_source, confirmed_by, confirmed_at)
    values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', public.current_business_date() + 5, 1, 'kg',
            'dev_phone_call', (select id from auth.users where email = 'cust_y@test.invalid'), now())$$,
  '23514', null, 'supply must be confirmed by an active staff member (not a customer)'
);
select throws_ok($$select tests.add_supply('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', 1, 'kg', public.current_business_date() - 1)$$,
  '23514', null, 'supply cannot be created for a past business date');

update public.products set is_active = false where id = '00000000-0000-0000-0000-0000000000a3';
select throws_ok($$select tests.add_supply('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a3', 5)$$,
  '23514', null, 'an inactive product cannot receive supply');

create temporary table s1 as
  select tests.add_supply('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', 12.5) as id;
select isnt((select id from s1), null, 'valid supply is recorded');
select throws_ok($$select tests.add_supply('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', 3)$$,
  '23505', null, 'only one active record per supplier + product + business date');
select lives_ok($$select tests.add_supply('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', 3, 'kg', (select d + 1 from ctx))$$,
  'the same supplier and product may have supply on another business date');

select throws_ok($$update public.supply_confirmations set quantity = 10 where id = (select id from s1)$$,
  '23514', null, 'editing supply requires a change reason');
select lives_ok($$update public.supply_confirmations set quantity = 0, change_reason = 'DEV farmer cancelled' where id = (select id from s1)$$,
  'supply may be set to zero with a reason');
select is((select version from public.supply_confirmations where id = (select id from s1)), 2, 'supply edits bump version');
select throws_ok($$update public.supply_confirmations set quantity = 6 where id = (select id from s1)$$,
  '23514', null, 'a second edit without a NEW reason is rejected (stale reason does not count)');
select throws_ok($$update public.supply_confirmations set quantity = 6, change_reason = 'DEV farmer cancelled' where id = (select id from s1)$$,
  '23514', null, 'repeating the previous reason text is rejected');
select set_config('app.reason', 'DEV reason from request context', true);
select lives_ok($$update public.supply_confirmations set quantity = 6 where id = (select id from s1)$$,
  'a reason supplied via app.reason satisfies the rule');
select is((select change_reason from public.supply_confirmations where id = (select id from s1)),
  'DEV reason from request context', 'the request-context reason is recorded on the row');
select set_config('app.reason', '', true);
select throws_ok($$update public.supply_confirmations set quantity = 0.0005, change_reason = 'DEV precision' where id = (select id from s1)$$,
  '23514', null, 'over-precision quantities are rejected, never silently rounded');
select throws_ok($$update public.supply_confirmations set business_date = business_date + 1, change_reason = 'x' where id = (select id from s1)$$,
  '23514', null, 'supply business date cannot change');
select throws_ok($$update public.supply_confirmations set status = 'inactive', change_reason = 'x' where id = (select id from s1)$$,
  '23514', null, 'deactivation records deactivated_at');
select throws_ok($$update public.supply_confirmations set status = 'inactive', deactivated_at = now() where id = (select id from s1)$$,
  '23514', null, 'deactivation also needs a fresh reason');
select lives_ok($$update public.supply_confirmations set status = 'inactive', deactivated_at = now(), change_reason = 'DEV duplicate' where id = (select id from s1)$$,
  'supply can be deactivated with a reason');
select lives_ok($$select tests.add_supply('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', 4)$$,
  'a new active record may replace a deactivated one for the same date');
select throws_ok($$delete from public.supply_confirmations where id = (select id from s1)$$,
  '42501', null, 'supply records are never hard-deleted');

create temporary table s2 as
  select tests.add_supply('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a1', 2) as id;
update public.suppliers set status = 'suspended' where id = '00000000-0000-0000-0000-0000000000f2';
select throws_ok($$update public.supply_confirmations set quantity = 9999, change_reason = 'DEV raise' where id = (select id from s2)$$,
  '23514', null, 'an active record of a suspended supplier cannot be changed');
select lives_ok($$update public.supply_confirmations set status = 'inactive', deactivated_at = now(), change_reason = 'DEV supplier suspended' where id = (select id from s2)$$,
  'supply of a suspended supplier can still be deactivated');
insert into public.products (id, product_code, category_id, name, slug, base_unit)
  values ('00000000-0000-0000-0000-0000000000a4', 'DEV-D', '00000000-0000-0000-0000-0000000000c1', 'DEV Product D', 'dev-d', 'kg');
select throws_ok($$select tests.add_supply('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a4', 1)$$,
  '23514', null, 'a suspended supplier cannot record supply');

select throws_ok(
  $$update public.products set base_unit = 'g' where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '23514', null, 'base unit is fixed once supply references the product'
);

-- ---------------------------------------------------------------- policies
insert into public.policy_versions (id, policy_type, version_number, title, body_markdown, status, published_at, effective_from)
values ('00000000-0000-0000-0000-0000000000e1', 'refund', 1, 'DEV v1', 'DEV text', 'published', now(), now());
select throws_ok(
  $$update public.policy_versions set body_markdown = 'changed' where id = '00000000-0000-0000-0000-0000000000e1'$$,
  '23514', null, 'published policy text is immutable'
);
select throws_ok(
  $$update public.policy_versions set status = 'draft', published_at = null where id = '00000000-0000-0000-0000-0000000000e1'$$,
  '23514', null, 'a published policy cannot return to draft (no rewrite-and-republish)'
);
select throws_ok(
  $$update public.policy_versions set published_at = now() - interval '1 day' where id = '00000000-0000-0000-0000-0000000000e1'$$,
  '23514', null, 'publish metadata is immutable'
);
select throws_ok(
  $$delete from public.policy_versions where id = '00000000-0000-0000-0000-0000000000e1'$$,
  '42501', null, 'a published policy cannot be deleted'
);
insert into public.policy_versions (id, policy_type, version_number, title, body_markdown)
  values ('00000000-0000-0000-0000-0000000000e2', 'terms', 1, 'DEV draft', 'DEV draft text');
select lives_ok($$delete from public.policy_versions where id = '00000000-0000-0000-0000-0000000000e2'$$,
  'drafts may be deleted');
select throws_ok(
  $$insert into public.policy_versions (policy_type, version_number, title, body_markdown, status, published_at, effective_from)
    values ('refund', 2, 'DEV v2', 'DEV text 2', 'published', now(), now())$$,
  '23505', null, 'only one published version per policy type'
);
select throws_ok(
  $$insert into public.policy_versions (policy_type, version_number, title, body_markdown, status)
    values ('refund', 3, 'DEV v3', 'x', 'published')$$,
  '23514', null, 'publishing requires published_at and effective_from'
);
update public.policy_versions set status = 'retired' where id = '00000000-0000-0000-0000-0000000000e1';
select throws_ok(
  $$update public.policy_versions set status = 'published' where id = '00000000-0000-0000-0000-0000000000e1'$$,
  '23514', null, 'a retired policy cannot be republished'
);

select throws_ok(
  $$insert into public.app_settings (key, value, description) values ('Bad Key', '1', 'x')$$,
  '23514', null, 'setting keys are lowercase dot-namespaced'
);

select tests.authenticate_as_service_role();
select throws_ok($$truncate public.suppliers cascade$$, '42501', null, 'service_role cannot truncate suppliers');
select throws_ok($$truncate public.supply_confirmations$$, '42501', null, 'service_role cannot truncate supply');
select throws_ok($$truncate public.sku_price_history$$, '42501', null, 'service_role cannot truncate price history');
select throws_ok($$truncate public.policy_versions$$, '42501', null, 'service_role cannot truncate policies');
select throws_ok($$delete from public.sku_price_history$$, '42501', null, 'service_role cannot delete price history');
select tests.clear_authentication();
select ok(tests.sqlstate_of($$truncate public.supply_confirmations$$) in ('42501', '0A000'),
  'even the owner cannot truncate supply (no-truncate trigger, or FK from PO lines)');
select throws_ok($$truncate public.suppliers cascade$$, '42501', null, 'even the owner cannot truncate suppliers (trigger)');

select * from finish();
rollback;
