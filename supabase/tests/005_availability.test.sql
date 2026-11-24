-- Shared availability function, MVP form (master §1.1, ADR-0006, ADR-0007).
-- All quantities and names are SYNTHETIC test values.
begin;
\ir _helpers.psql
select * from no_plan();

-- Isolate from data left by E2E/integration runs (rolled back at the end).
set local session_replication_role = replica;
delete from public.supply_confirmations;
delete from public.supplier_contacts;
delete from public.farmer_profiles;
delete from public.suppliers;
set local session_replication_role = origin;

create temporary table ctx as
  select tests.create_user('ops_av', '{operations_admin}', true) as staff_id,
         public.current_business_date() as today,
         public.current_business_date() + 1 as d;
grant select on ctx to authenticated;

insert into public.supply_confirmation_sources (code, label) values ('dev_phone_call', 'DEV phone call');
insert into public.categories (id, code, name) values ('00000000-0000-0000-0000-0000000000c1', 'dev-cat', 'DEV Category');
insert into public.products (id, product_code, category_id, name, slug, base_unit, quantity_precision, low_supply_threshold, is_listable, display_order)
values
  ('00000000-0000-0000-0000-0000000000a1', 'DEV-A', '00000000-0000-0000-0000-0000000000c1', 'DEV Produce A', 'dev-a', 'kg',    3, 15,   true,  1),
  ('00000000-0000-0000-0000-0000000000a2', 'DEV-B', '00000000-0000-0000-0000-0000000000c1', 'DEV Produce B', 'dev-b', 'piece', 0, 20,   true,  2),
  ('00000000-0000-0000-0000-0000000000a3', 'DEV-C', '00000000-0000-0000-0000-0000000000c1', 'DEV Produce C', 'dev-c', 'kg',    3, null, false, 3),
  ('00000000-0000-0000-0000-0000000000a4', 'DEV-D', '00000000-0000-0000-0000-0000000000c1', 'DEV Produce D', 'dev-d', 'kg',    3, null, true,  4);

insert into public.suppliers (id, supplier_code, name, supplier_type, status) values
  ('00000000-0000-0000-0000-0000000000f1', 'SAM-FRM-900001', 'DEV Farmer 1', 'farmer', 'active'),
  ('00000000-0000-0000-0000-0000000000f2', 'SAM-FRM-900002', 'DEV Farmer 2', 'farmer', 'active'),
  ('00000000-0000-0000-0000-0000000000f3', 'SAM-FRM-900003', 'DEV Farmer 3', 'farmer', 'active');

create function tests.supply(p_supplier text, p_product text, p_qty numeric, p_date date) returns uuid
language sql as $$
  insert into public.supply_confirmations
    (supplier_id, product_id, business_date, quantity, unit, confirmation_source, confirmed_by, confirmed_at)
  select ('00000000-0000-0000-0000-0000000000' || p_supplier)::uuid,
         ('00000000-0000-0000-0000-0000000000' || p_product)::uuid,
         p_date, p_qty, p.base_unit, 'dev_phone_call', ctx.staff_id, now()
  from ctx, public.products p where p.id = ('00000000-0000-0000-0000-0000000000' || p_product)::uuid
  returning id;
$$;

-- Product A on day d: S1 30 + S2 20 (+ S3 100, suspended later) → 50
select tests.supply('f1', 'a1', 30, (select d from ctx));
select tests.supply('f2', 'a1', 20, (select d from ctx));
select tests.supply('f3', 'a1', 100, (select d from ctx));
update public.suppliers set status = 'suspended' where id = '00000000-0000-0000-0000-0000000000f3';
-- Other dates for A must not leak into day d
select tests.supply('f1', 'a1', 7, (select d + 1 from ctx));
select tests.supply('f2', 'a1', 9, (select today from ctx));
-- Product B (pieces) on day d: 12, plus a record zeroed with a reason and an inactive one
select tests.supply('f1', 'a2', 12, (select d from ctx));
create temporary table zeroed as select tests.supply('f2', 'a2', 8, (select d from ctx)) as id;
update public.supply_confirmations set quantity = 0, change_reason = 'DEV cancelled' where id = (select id from zeroed);
create temporary table deact as select tests.supply('f1', 'a4', 5, (select d from ctx)) as id;
update public.supply_confirmations set status = 'inactive', deactivated_at = now(), change_reason = 'DEV duplicate'
  where id = (select id from deact);
-- Product C supply, then C deactivated
select tests.supply('f1', 'a3', 4, (select d from ctx));
update public.products set is_active = false where id = '00000000-0000-0000-0000-0000000000a3';

select tests.authenticate_as((select staff_id from ctx));

create temporary table av as select * from public.product_availability((select d from ctx));

select results_eq(
  $$select open_confirmed_supply, atp, contributing_supplier_count from av where product_id = '00000000-0000-0000-0000-0000000000a1'$$,
  $$values (50.000::numeric, 50.000::numeric, 2)$$,
  'multi-supplier sum for the date; suspended supplier and other dates excluded'
);
select results_eq(
  $$select base_unit, atp from av where product_id = '00000000-0000-0000-0000-0000000000a2'$$,
  $$values ('piece'::text, 12.000::numeric)$$,
  'zeroed records are excluded and each product keeps its own base unit (no unlike-unit sums)'
);
select results_eq(
  $$select atp, contributing_supplier_count from av where product_id = '00000000-0000-0000-0000-0000000000a4'$$,
  $$values (0.000::numeric, 0)$$,
  'inactive supply records are excluded; products without supply report zero'
);
select is(
  (select count(*)::int from av where product_id = '00000000-0000-0000-0000-0000000000a3'),
  0, 'inactive products are not returned'
);
select is(
  (select bool_and(eligible_on_hand = 0 and active_reservations = 0 and atp >= 0) from av),
  true, 'MVP form: on-hand and reservations are zero and ATP is never negative'
);

select is(
  (select atp from public.product_availability((select today from ctx)) where product_id = '00000000-0000-0000-0000-0000000000a1'),
  9.000::numeric, 'supply for the current business date counts'
);
select is(
  (select atp from public.product_availability((select today - 1 from ctx)) where product_id = '00000000-0000-0000-0000-0000000000a1'),
  0.000::numeric, 'past business dates are expired (no carry-forward)'
);
select is(
  (select count(*)::int from public.product_availability((select d from ctx), null, array['00000000-0000-0000-0000-0000000000a2'::uuid])),
  1, 'product filter limits results'
);
select is(
  (select atp from public.product_availability((select d from ctx), gen_random_uuid()) where product_id = '00000000-0000-0000-0000-0000000000a1'),
  50.000::numeric, 'zone parameter accepted; all zones share one pool at launch'
);
select throws_ok(
  $$select * from public.product_availability(null)$$, '22004', null, 'business date is required'
);
select tests.clear_authentication();

-- Yesterday's quantity never carries forward. New past-date rows are
-- rejected, so simulate a record that was valid and has since expired by
-- bypassing triggers for this fixture row only.
select throws_ok(
  $$select tests.supply('f1', 'a4', 99, (select today - 1 from ctx))$$,
  '23514', null, 'supply cannot be created for a past business date'
);
set local session_replication_role = replica;
insert into public.supply_confirmations (id, supplier_id, product_id, business_date, quantity, unit, confirmation_source, confirmed_by, confirmed_at)
select '00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a4',
       (select today - 1 from ctx), 99, 'kg', 'dev_phone_call', staff_id, now() from ctx;
set local session_replication_role = origin;
select throws_ok(
  $$update public.supply_confirmations set quantity = 100, change_reason = 'DEV late edit' where id = '00000000-0000-0000-0000-0000000000e9'$$,
  '23514', null, 'expired supply quantities cannot be edited'
);
select lives_ok(
  $$update public.supply_confirmations set status = 'inactive', deactivated_at = now(), change_reason = 'DEV close out'
     where id = '00000000-0000-0000-0000-0000000000e9'$$,
  'expired supply can still be deactivated'
);
set local session_replication_role = replica;
update public.supply_confirmations set status = 'active', deactivated_at = null where id = '00000000-0000-0000-0000-0000000000e9';
set local session_replication_role = origin;
select tests.authenticate_as((select staff_id from ctx));
select is(
  (select atp from public.product_availability((select today - 1 from ctx)) where product_id = '00000000-0000-0000-0000-0000000000a4'),
  0.000::numeric, 'a record for a past business date is excluded even though it is active'
);
select tests.clear_authentication();

-- ------------------------------------------------------- per-SKU availability
insert into public.product_skus (id, product_id, sku_code, label, pack_quantity, sale_unit, price_paise, min_order_packs, max_order_packs, order_step_packs)
values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'DEV-A-500G', '500 g', 0.5,   'pack', 100, 1, 10,   1),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', 'DEV-A-2KG',  '2 kg',  2,     'pack', 100, 2, null, 2),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1', 'DEV-A-5KG',  '5 kg',  5,     'pack', 100, 3, null, 4),
  ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000a1', 'DEV-A-100KG','100 kg',100,   'pack', 100, 1, null, 1),
  ('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000000a2', 'DEV-B-1PC',  '1 pc',  1,     'piece',100, 1, null, 1),
  ('00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-0000000000a1', 'DEV-A-OFF',  'off',   1,     'pack', 100, 1, null, 1);
update public.product_skus set is_active = false where id = '00000000-0000-0000-0000-0000000000b6';

select tests.authenticate_as((select staff_id from ctx));
create temporary table skus as select * from public.sku_availability((select d from ctx))
  where sku_code like 'DEV-%';

select results_eq(
  $$select sku_code, max_orderable, availability_status from skus order by sku_code$$,
  $$values
      ('DEV-A-100KG'::text, 0,  'unavailable'::text),
      ('DEV-A-2KG',         24, 'available'),
      ('DEV-A-500G',        10, 'available'),
      ('DEV-A-5KG',         7,  'available'),
      ('DEV-B-1PC',         12, 'limited')$$,
  'maxOrderable honours pack size, max, min and step; status reflects threshold; inactive SKUs omitted'
);
-- 2 kg: floor(50/2) = 25 → step 2 from min 2 → 24.  5 kg: floor(50/5) = 10 → 3 + 4 = 7.
select is(
  (select bool_and(product_atp = 50.000) from skus where product_id = '00000000-0000-0000-0000-0000000000a1'),
  true, 'all SKUs of a product draw from the same base-unit pool'
);
select tests.clear_authentication();

-- At exactly the threshold the product is limited (0 < ATP <= threshold).
update public.products set low_supply_threshold = 50 where id = '00000000-0000-0000-0000-0000000000a1';
select tests.authenticate_as((select staff_id from ctx));
select is(
  (select availability_status from public.sku_availability((select d from ctx)) where sku_code = 'DEV-A-500G'),
  'limited', 'ATP equal to the low-supply threshold is limited'
);
select tests.clear_authentication();

-- Listability is reported (customer APIs must hide non-listable products).
update public.products set is_listable = false where id = '00000000-0000-0000-0000-0000000000a2';
select tests.authenticate_as((select staff_id from ctx));
select is(
  (select is_listable from public.sku_availability((select d from ctx)) where sku_code = 'DEV-B-1PC'),
  false, 'non-listable products are flagged for customer APIs to hide'
);
select tests.clear_authentication();

-- Very large totals never overflow the result (one product cannot take
-- availability down for every product).
insert into public.products (id, product_code, category_id, name, slug, base_unit, display_order)
  values ('00000000-0000-0000-0000-0000000000a9', 'DEV-BIG', '00000000-0000-0000-0000-0000000000c1', 'DEV Big', 'dev-big', 'kg', 9);
select tests.supply('f1', 'a9', 999999999.999, (select d from ctx));
select tests.supply('f2', 'a9', 999999999.999, (select d from ctx));
select tests.authenticate_as((select staff_id from ctx));
select is(
  (select atp from public.product_availability((select d from ctx)) where product_id = '00000000-0000-0000-0000-0000000000a9'),
  1999999999.998::numeric, 'large multi-supplier totals are exact and do not overflow'
);
select is(
  (select count(*)::int from public.product_availability((select d from ctx))
    where product_id::text like '00000000-0000-0000-0000-0000000000a%'),
  4, 'other products are still returned alongside the large total'
);
select tests.clear_authentication();

select * from finish();
rollback;
