-- Phase 4 (ADR-0012, ADR-0007): PO lifecycle, receiving and quality,
-- batches, the append-only ledger, reservation re-pointing, holds, recalls,
-- exceptions and the availability formula without double counting.
-- All values are DEV synthetic test data.
begin;
\ir _helpers.psql
select * from no_plan();

-- ---------------------------------------------------------------- fixtures
create temporary table actors (label text primary key, user_id uuid);
create temporary table ctx (key text primary key, val jsonb);
grant select on actors to authenticated, service_role;
grant select, insert, update on ctx to authenticated;

insert into actors values
  ('ops',      tests.create_user('p4-ops', '{operations_admin}', true)),
  ('super',    tests.create_user('p4-super', '{super_admin}', true)),
  ('finance',  tests.create_user('p4-finance', '{finance_admin}', true)),
  ('viewer',   tests.create_user('p4-viewer', '{viewer}', true)),
  ('dispatch', tests.create_user('p4-dispatch', '{dispatch_admin}', true));

create function tests.uid(p_label text) returns uuid language sql stable as
  $$ select user_id from actors where label = p_label $$;
create function tests.ctx(p_key text) returns jsonb language sql stable as
  $$ select val from ctx where key = p_key $$;
create function tests.put(p_key text, p_val jsonb) returns void language sql as
  $$ insert into ctx values (p_key, p_val) on conflict (key) do update set val = excluded.val $$;
-- Availability as computed by the core (owner context).
create function tests.avail(p_product uuid, p_date date)
returns table (on_hand numeric, open_supply numeric, reserved numeric, atp numeric)
language sql stable as $$
  select eligible_on_hand, open_confirmed_supply, active_reservations, atp
  from private.product_availability_core(p_date, null, array[p_product])
$$;
grant execute on all functions in schema tests to authenticated;

-- D = tomorrow (Asia/Kolkata business date).
create function tests.d() returns date language sql stable as $$ select public.current_business_date() + 1 $$;
grant execute on function tests.d() to authenticated;

insert into public.supply_confirmation_sources (code, label) values ('p4_src', 'DEV source') on conflict do nothing;
insert into public.categories (id, code, name) values ('00000000-0000-0000-0000-0000000004c1', 'p4-cat', 'DEV P4');
-- A: kg, 3 decimals. B: whole units only (precision 0).
insert into public.products (id, product_code, category_id, name, slug, base_unit, quantity_precision) values
  ('00000000-0000-0000-0000-0000000004a1', 'P4-A', '00000000-0000-0000-0000-0000000004c1', 'DEV P4 A', 'p4-a', 'kg', 3),
  ('00000000-0000-0000-0000-0000000004a2', 'P4-B', '00000000-0000-0000-0000-0000000004c1', 'DEV P4 B', 'p4-b', 'kg', 0);
insert into public.suppliers (id, supplier_code, name, supplier_type, status) values
  ('00000000-0000-0000-0000-0000000004f1', 'SAM-FRM-940001', 'DEV P4 Farmer One', 'farmer', 'active'),
  ('00000000-0000-0000-0000-0000000004f2', 'SAM-FRM-940002', 'DEV P4 Farmer Two', 'farmer', 'active');
insert into public.supply_confirmations
  (id, supplier_id, product_id, business_date, quantity, unit, confirmation_source, confirmed_by, confirmed_at)
select v.id::uuid, v.supplier::uuid, v.product::uuid, tests.d(), v.qty, 'kg', 'p4_src', tests.uid('ops'), now()
from (values
  ('00000000-0000-0000-0000-0000000004e1', '00000000-0000-0000-0000-0000000004f1', '00000000-0000-0000-0000-0000000004a1', 100),
  ('00000000-0000-0000-0000-0000000004e2', '00000000-0000-0000-0000-0000000004f1', '00000000-0000-0000-0000-0000000004a2', 20),
  ('00000000-0000-0000-0000-0000000004e3', '00000000-0000-0000-0000-0000000004f2', '00000000-0000-0000-0000-0000000004a1', 10)
) as v(id, supplier, product, qty);
-- Two pool reservations for A on D (created by checkout from Phase 6; inserted directly here).
insert into public.inventory_reservations (id, product_id, business_date, quantity, created_at) values
  ('00000000-0000-0000-0000-0000000004d1', '00000000-0000-0000-0000-0000000004a1', tests.d(), 30, now() - interval '2 hours'),
  ('00000000-0000-0000-0000-0000000004d2', '00000000-0000-0000-0000-0000000004a1', tests.d(), 30, now() - interval '1 hour');

select results_eq(
  $$select * from tests.avail('00000000-0000-0000-0000-0000000004a1', tests.d())$$,
  $$values (0::numeric, 110::numeric, 60::numeric, 50::numeric)$$,
  'baseline A: ATP = 0 on hand + 110 open supply - 60 reserved = 50'
);

-- --------------------------------------------------------- authorization
select tests.authenticate_as(tests.uid('viewer'));
select throws_ok($$select public.admin_create_po_from_supply('00000000-0000-0000-0000-0000000004f1', tests.d())$$,
  'PT403', null, 'viewer cannot create purchase orders');
select throws_ok($$select public.admin_list_purchase_orders()$$, 'PT403', null, 'viewer cannot read procurement');
select is(public.dashboard_procurement_widgets() -> 'inventoryWidgets', 'false'::jsonb, 'viewer gets no inventory widgets');
select tests.clear_authentication();
select tests.authenticate_as(tests.uid('finance'));
select throws_ok($$select public.admin_create_po_from_supply('00000000-0000-0000-0000-0000000004f1', tests.d())$$,
  'PT403', null, 'finance cannot create purchase orders (read only)');
select tests.clear_authentication();
select tests.authenticate_as(tests.uid('dispatch'));
select throws_ok($$select public.admin_inventory_summary()$$, 'PT403', null, 'dispatch cannot read inventory');
select tests.clear_authentication();

-- ------------------------------------------------------------ purchase orders
select tests.authenticate_as(tests.uid('ops'));
select tests.put('po1', public.admin_create_po_from_supply('00000000-0000-0000-0000-0000000004f1', tests.d(), null, 'p4-req-po1'));
select tests.clear_authentication();

select matches(tests.ctx('po1') ->> 'poNumber', '^SAM-PO-[0-9]{6}$', 'PO numbers use the SAM-PO-000001 format');
select is((select count(*)::int from public.purchase_order_lines where purchase_order_id = (tests.ctx('po1') ->> 'id')::uuid), 2,
  'PO from supply has one line per unordered supply record of the farmer and date');
select is((select status::text from public.purchase_orders where id = (tests.ctx('po1') ->> 'id')::uuid), 'draft', 'new PO is draft');
select results_eq(
  $$select atp from tests.avail('00000000-0000-0000-0000-0000000004a1', tests.d())$$, $$values (50::numeric)$$,
  'creating a PO never changes availability'
);
select is((select count(*)::int from public.inventory_movements m join public.product_batches b on b.id = m.batch_id
           where b.product_id in ('00000000-0000-0000-0000-0000000004a1', '00000000-0000-0000-0000-0000000004a2')), 0,
  'creating a PO creates no stock movements');
select ok(exists (select 1 from public.audit_logs where entity_type = 'purchase_orders'
                  and entity_id = tests.ctx('po1') ->> 'id' and request_id = 'p4-req-po1' and actor_user_id = tests.uid('ops')),
  'PO creation is audited with actor and request id');

select tests.authenticate_as(tests.uid('viewer'));
select throws_ok($$select public.admin_create_po_from_supply('00000000-0000-0000-0000-0000000004f1', tests.d())$$,
  'PT403', null, 'unauthorized callers are refused before supply is read (no information leak)');
select tests.clear_authentication();
select tests.authenticate_as(tests.uid('ops'));
select throws_ok($$select public.admin_create_po_from_supply('00000000-0000-0000-0000-0000000004f1', tests.d())$$,
  'PT422', null, 'no second PO from the same supply');
select throws_ok($$select public.admin_create_purchase_order('00000000-0000-0000-0000-0000000004f1', tests.d(),
    '[{"productId":"00000000-0000-0000-0000-0000000004a1","quantity":"5","supplyConfirmationId":"00000000-0000-0000-0000-0000000004e1"}]')$$,
  'PT409', null, 'a supply record can be linked to only one open PO');
select throws_ok($$select public.admin_create_purchase_order('00000000-0000-0000-0000-0000000004f1', tests.d(),
    '[{"productId":"00000000-0000-0000-0000-0000000004a1","quantity":"5","supplyConfirmationId":"00000000-0000-0000-0000-0000000004e3"}]')$$,
  'PT422', null, 'linked supply must belong to the PO farmer');
select throws_ok($$select public.admin_create_purchase_order('00000000-0000-0000-0000-0000000004f1', tests.d(),
    '[{"productId":"00000000-0000-0000-0000-0000000004a1","quantity":"1.2345"}]')$$,
  'PT422', null, 'quantities have at most 3 decimals');
select throws_ok($$select public.admin_create_purchase_order('00000000-0000-0000-0000-0000000004f1', tests.d(),
    '[{"productId":"00000000-0000-0000-0000-0000000004a2","quantity":"1.5"}]')$$,
  'PT422', null, 'quantities respect the product precision');
select throws_ok($$select public.admin_create_purchase_order('00000000-0000-0000-0000-0000000004f1', tests.d(),
    '[{"productId":"00000000-0000-0000-0000-0000000004a1","quantity":"0"}]')$$,
  'PT422', null, 'ordered quantity must be positive');
select throws_ok($$select public.admin_create_purchase_order('00000000-0000-0000-0000-0000000004f1', tests.d(), '[]')$$,
  'PT422', null, 'a PO needs at least one line');
select throws_ok($$select public.admin_create_purchase_order('00000000-0000-0000-0000-0000000004f1', tests.d(),
    '[{"productId":"00000000-0000-0000-0000-0000000004a1","quantity":"1","unitCostPaise":-1}]')$$,
  'PT422', null, 'unit cost cannot be negative');
select throws_ok(format($$select public.admin_create_goods_receipt(%L, '[]')$$, tests.ctx('po1') ->> 'id'),
  'PT409', null, 'goods cannot be received against a draft PO');
select throws_ok(format($$select public.admin_set_purchase_order_status(%L, 99, 'send')$$, tests.ctx('po1') ->> 'id'),
  'PT409', null, 'stale PO version is rejected');
select lives_ok(format($$select tests.put('po1v', public.admin_set_purchase_order_status(%L, 1, 'send'))$$, tests.ctx('po1') ->> 'id'),
  'ops sends the PO');
select throws_ok(format($$select public.admin_update_purchase_order(%L, %s, tests.d(), '[{"productId":"00000000-0000-0000-0000-0000000004a1","quantity":"1"}]')$$,
    tests.ctx('po1') ->> 'id', tests.ctx('po1v') ->> 'version'),
  'PT409', null, 'a sent PO cannot be edited');
select throws_ok(format($$select public.admin_set_purchase_order_status(%L, %s, 'close', 'DEV short')$$,
    tests.ctx('po1') ->> 'id', tests.ctx('po1v') ->> 'version'),
  'PT409', null, 'only partially received POs can be closed short');
select tests.clear_authentication();

select tests.put('lineA', to_jsonb((select id from public.purchase_order_lines
  where purchase_order_id = (tests.ctx('po1') ->> 'id')::uuid and product_id = '00000000-0000-0000-0000-0000000004a1')));
select tests.put('lineB', to_jsonb((select id from public.purchase_order_lines
  where purchase_order_id = (tests.ctx('po1') ->> 'id')::uuid and product_id = '00000000-0000-0000-0000-0000000004a2')));

-- ------------------------------------------------------------- receiving
select tests.authenticate_as(tests.uid('ops'));
select throws_ok(format($$select public.admin_create_goods_receipt(%L,
    jsonb_build_array(jsonb_build_object('poLineId', %L, 'received', '60', 'accepted', '50', 'rejected', '5')))$$,
    tests.ctx('po1') ->> 'id', tests.ctx('lineA') #>> '{}'),
  'PT422', null, 'accepted + rejected + damaged must equal received');
select throws_ok(format($$select public.admin_create_goods_receipt(%L,
    jsonb_build_array(jsonb_build_object('poLineId', %L, 'received', '1', 'accepted', '1', 'evidenceKey', 'supply/x.webp')))$$,
    tests.ctx('po1') ->> 'id', tests.ctx('lineA') #>> '{}'),
  'PT422', null, 'receipt evidence must live under receipts/');
-- ADR-0007 worked example: 60 received, 50 accepted, 6 rejected, 4 damaged.
select tests.put('grn1', public.admin_create_goods_receipt((tests.ctx('po1') ->> 'id')::uuid,
  jsonb_build_array(jsonb_build_object('poLineId', tests.ctx('lineA') #>> '{}', 'received', '60', 'accepted', '50',
    'rejected', '6', 'damaged', '4', 'qualityGrade', 'DEV grade', 'lotCode', 'DEV-LOT-1'))));
select tests.clear_authentication();

select matches(tests.ctx('grn1') ->> 'receiptNumber', '^SAM-GRN-[0-9]{6}$', 'receipt numbers use the SAM-GRN format');
select is(tests.ctx('grn1') -> 'overReceipt', 'false'::jsonb, 'within the ordered quantity is not an over-receipt');
select results_eq(
  $$select atp from tests.avail('00000000-0000-0000-0000-0000000004a1', tests.d())$$, $$values (50::numeric)$$,
  'a draft receipt does not change availability'
);

select tests.authenticate_as(tests.uid('ops'));
select tests.put('post1', public.admin_post_goods_receipt((tests.ctx('grn1') ->> 'id')::uuid, 1));
select throws_ok(format($$select public.admin_post_goods_receipt(%L, 1)$$, tests.ctx('grn1') ->> 'id'),
  'PT409', null, 'a receipt cannot be posted twice');
select tests.clear_authentication();

select is(tests.ctx('post1') -> 'batches', '1'::jsonb, 'posting creates one batch per accepted line');
select tests.put('batchA', to_jsonb((select b.id from public.product_batches b
  join public.goods_receipt_lines rl on rl.id = b.goods_receipt_line_id
  where rl.goods_receipt_id = (tests.ctx('grn1') ->> 'id')::uuid)));
select is((select initial_quantity from public.product_batches where id = (tests.ctx('batchA') #>> '{}')::uuid), 50::public.base_quantity,
  'the batch holds the accepted quantity only');
select matches((select batch_code from public.product_batches where id = (tests.ctx('batchA') #>> '{}')::uuid), '^SAM-B-[0-9]{6}$',
  'batch codes use the SAM-B format');
select results_eq(
  format($$select movement_type::text, quantity_delta from public.inventory_movements where batch_id = %L$$, tests.ctx('batchA') #>> '{}'),
  $$values ('receipt'::text, 50::numeric)$$,
  'one receipt movement for the accepted quantity; rejected and damaged never become stock'
);
select is(tests.ctx('post1') -> 'reservationsMoved', '2'::jsonb, 'pool reservations re-pointed oldest first');
select is((select batch_id from public.inventory_reservations where id = '00000000-0000-0000-0000-0000000004d1'),
  (tests.ctx('batchA') #>> '{}')::uuid, 'the oldest reservation moved to the batch in full');
select results_eq(
  $$select coalesce(batch_id is not null, false), quantity from public.inventory_reservations
    where product_id = '00000000-0000-0000-0000-0000000004a1' and status = 'active' order by batch_id nulls last, quantity$$,
  $$values (true, 20::public.base_quantity), (true, 30::public.base_quantity), (false, 10::public.base_quantity)$$,
  'the younger reservation was split: 20 on the batch, 10 left in the supply pool'
);
-- No double count: 100 confirmed - 60 received = 40 still open (+10 from farmer two).
select results_eq(
  $$select * from tests.avail('00000000-0000-0000-0000-0000000004a1', tests.d())$$,
  $$values (50::numeric, 50::numeric, 60::numeric, 40::numeric)$$,
  'after posting: ATP = 50 on hand + 50 open supply - 60 reserved = 40 (drops by rejected + damaged only)'
);
select is((select count(*)::int from public.operations_exceptions where product_id = '00000000-0000-0000-0000-0000000004a1'
           and exception_type = 'supply_shortfall'), 0, 'no shortfall while open supply covers the pool');
select is((select status::text from public.purchase_orders where id = (tests.ctx('po1') ->> 'id')::uuid), 'partially_received',
  'PO is partially received');
select results_eq(
  $$select on_hand, open_supply, reserved, atp from tests.avail('00000000-0000-0000-0000-0000000004a1', public.current_business_date())$$,
  $$values (50::numeric, 0::numeric, 50::numeric, 0::numeric)$$,
  'today: on-hand counts (no sell-by policy) and batch reservations hold it for every date; pool reservations of D do not count'
);

-- Over-receipt on line B (ordered 20): needs an explicit reason.
select tests.authenticate_as(tests.uid('ops'));
select throws_ok(format($$select public.admin_create_goods_receipt(%L,
    jsonb_build_array(jsonb_build_object('poLineId', %L, 'received', '25', 'accepted', '25')))$$,
    tests.ctx('po1') ->> 'id', tests.ctx('lineB') #>> '{}'),
  'PT409', 'over_receipt', 'over-receipt without a reason is refused');
select tests.put('grn2', public.admin_create_goods_receipt((tests.ctx('po1') ->> 'id')::uuid,
  jsonb_build_array(jsonb_build_object('poLineId', tests.ctx('lineB') #>> '{}', 'received', '25', 'accepted', '25')),
  null, null, 'DEV farmer delivered extra'));
select is(tests.ctx('grn2') -> 'overReceipt', 'true'::jsonb, 'over-receipt is flagged');
select lives_ok(format($$select public.admin_post_goods_receipt(%L, 1)$$, tests.ctx('grn2') ->> 'id'), 'over-receipt with a reason posts');
select tests.clear_authentication();
select is((select count(*)::int from public.operations_exceptions where exception_type = 'over_receipt'
           and details ->> 'receipt' = tests.ctx('grn2') ->> 'receiptNumber'), 1, 'over-receipt raises an operations exception');
select results_eq(
  $$select * from tests.avail('00000000-0000-0000-0000-0000000004a2', tests.d())$$,
  $$values (25::numeric, 0::numeric, 0::numeric, 25::numeric)$$,
  'B: open supply is floored at 0 per record (25 received against 20 confirmed): no double count'
);
select tests.put('batchB', to_jsonb((select b.id from public.product_batches b
  join public.goods_receipt_lines rl on rl.id = b.goods_receipt_line_id
  where rl.goods_receipt_id = (tests.ctx('grn2') ->> 'id')::uuid)));

-- Close short: line A received 60 of 100.
select tests.authenticate_as(tests.uid('ops'));
select tests.put('po1v', to_jsonb((select version from public.purchase_orders where id = (tests.ctx('po1') ->> 'id')::uuid)));
select throws_ok(format($$select public.admin_set_purchase_order_status(%L, %s, 'close')$$, tests.ctx('po1') ->> 'id', tests.ctx('po1v')),
  'PT422', null, 'closing short needs a reason');
select lives_ok(format($$select public.admin_set_purchase_order_status(%L, %s, 'close', 'DEV farmer short')$$,
    tests.ctx('po1') ->> 'id', tests.ctx('po1v')), 'partially received PO closed short with a reason');
select throws_ok(format($$select public.admin_create_goods_receipt(%L,
    jsonb_build_array(jsonb_build_object('poLineId', %L, 'received', '1', 'accepted', '1')))$$,
    tests.ctx('po1') ->> 'id', tests.ctx('lineA') #>> '{}'),
  'PT409', null, 'a received PO takes no further receipts');
select tests.clear_authentication();
select is((select status::text from public.purchase_orders where id = (tests.ctx('po1') ->> 'id')::uuid), 'received', 'closed PO is received');

-- Rejection-only receipt on farmer two + shortfall: pool reservations exceed open supply.
insert into public.inventory_reservations (id, product_id, business_date, quantity, created_at)
  values ('00000000-0000-0000-0000-0000000004d3', '00000000-0000-0000-0000-0000000004a1', tests.d(), 35, now());
select tests.authenticate_as(tests.uid('ops'));
select tests.put('po2', public.admin_create_po_from_supply('00000000-0000-0000-0000-0000000004f2', tests.d()));
select lives_ok(format($$select public.admin_set_purchase_order_status(%L, 1, 'send')$$, tests.ctx('po2') ->> 'id'), 'PO 2 sent');
select tests.put('grn3', public.admin_create_goods_receipt((tests.ctx('po2') ->> 'id')::uuid,
  jsonb_build_array(jsonb_build_object('poLineId',
    (select id from public.purchase_order_lines where purchase_order_id = (tests.ctx('po2') ->> 'id')::uuid),
    'received', '10', 'accepted', '0', 'rejected', '10', 'qualityNotes', 'DEV all rejected'))));
select tests.put('post3', public.admin_post_goods_receipt((tests.ctx('grn3') ->> 'id')::uuid, 1));
select tests.clear_authentication();
select is(tests.ctx('post3') -> 'batches', '0'::jsonb, 'a fully rejected line creates no batch');
select is((select status::text from public.purchase_orders where id = (tests.ctx('po2') ->> 'id')::uuid), 'received',
  'fully received (even if rejected) PO becomes received');
select results_eq(
  $$select * from tests.avail('00000000-0000-0000-0000-0000000004a1', tests.d())$$,
  $$values (50::numeric, 40::numeric, 95::numeric, 0::numeric)$$,
  'rejected supply leaves open supply; ATP never goes negative (50 + 40 - 95 floored at 0)'
);
select ok(exists (select 1 from public.operations_exceptions where exception_type = 'supply_shortfall'
                  and product_id = '00000000-0000-0000-0000-0000000004a1' and business_date = tests.d()
                  and details ->> 'poolReserved' = '45' and details ->> 'openSupply' = '40'),
  'pool reservations above open supply raise a supply shortfall exception');

-- ------------------------------------------------------------ stock ledger
select tests.authenticate_as(tests.uid('ops'));
select throws_ok(format($$select public.admin_adjust_stock(%L, 'wastage', '1', 'DEV spoiled')$$, tests.ctx('batchA') #>> '{}'),
  'PT409', null, 'cannot remove reserved stock (on hand 50, reserved 50)');
select throws_ok(format($$select public.admin_adjust_stock(%L, 'receipt', '1', 'DEV')$$, tests.ctx('batchA') #>> '{}'),
  'PT422', null, 'receipt movements come from receiving only');
select throws_ok(format($$select public.admin_adjust_stock(%L, 'sale', '1', 'DEV')$$, tests.ctx('batchA') #>> '{}'),
  'PT422', null, 'sale movements come from fulfilment only');
select throws_ok(format($$select public.admin_adjust_stock(%L, 'adjustment_increase', '1', '')$$, tests.ctx('batchA') #>> '{}'),
  'PT422', null, 'adjustments need a reason');
select is(public.admin_adjust_stock((tests.ctx('batchA') #>> '{}')::uuid, 'adjustment_increase', '5', 'DEV recount') ->> 'onHand', '55',
  'an increase adds a positive movement');
select is(public.admin_adjust_stock((tests.ctx('batchA') #>> '{}')::uuid, 'wastage', '5', 'DEV spoiled') ->> 'onHand', '50',
  'unreserved stock can be wasted');
select tests.clear_authentication();
select tests.authenticate_as(tests.uid('finance'));
select throws_ok(format($$select public.admin_adjust_stock(%L, 'adjustment_increase', '1', 'DEV')$$, tests.ctx('batchA') #>> '{}'),
  'PT403', null, 'finance cannot adjust stock');
select tests.clear_authentication();
select is((select sum(quantity_delta) from public.inventory_movements where batch_id = (tests.ctx('batchA') #>> '{}')::uuid), 50::numeric,
  'on hand is the ledger sum');
select is((select count(*)::int from public.inventory_movements where batch_id = (tests.ctx('batchA') #>> '{}')::uuid
           and movement_type = 'wastage' and quantity_delta = -5), 1, 'decreases are negative movements');
select isnt(tests.sqlstate_of(format($$update public.inventory_movements set quantity_delta = 999 where batch_id = %L$$,
  tests.ctx('batchA') #>> '{}')), '00000', 'the movement ledger is append-only (even for the owner)');
select isnt(tests.sqlstate_of(format($$delete from public.inventory_movements where batch_id = %L$$,
  tests.ctx('batchA') #>> '{}')), '00000', 'movements cannot be deleted');
select isnt(tests.sqlstate_of($$insert into public.inventory_movements (batch_id, product_id, movement_type, quantity_delta)
  select id, product_id, 'wastage', 1 from public.product_batches limit 1$$), '00000', 'movement sign must match its type');

-- Depletion and return to stock on batch B (25 on hand, nothing reserved).
select tests.authenticate_as(tests.uid('ops'));
select is(public.admin_adjust_stock((tests.ctx('batchB') #>> '{}')::uuid, 'damage', '25', 'DEV crushed') ->> 'onHand', '0', 'B emptied');
select tests.clear_authentication();
select is((select status::text from public.product_batches where id = (tests.ctx('batchB') #>> '{}')::uuid), 'depleted',
  'a batch at zero becomes depleted');
select tests.authenticate_as(tests.uid('ops'));
select lives_ok(format($$select public.admin_adjust_stock(%L, 'return_to_stock', '3', 'DEV found')$$, tests.ctx('batchB') #>> '{}'),
  'stock can be returned to a depleted batch');
select tests.clear_authentication();
select is((select status::text from public.product_batches where id = (tests.ctx('batchB') #>> '{}')::uuid), 'active',
  'returned stock reactivates the batch');

-- -------------------------------------------------------- hold and release
insert into public.inventory_reservations (id, product_id, business_date, batch_id, quantity)
  values ('00000000-0000-0000-0000-0000000004d4', '00000000-0000-0000-0000-0000000004a2', tests.d(),
          (tests.ctx('batchB') #>> '{}')::uuid, 2);
select results_eq($$select atp from tests.avail('00000000-0000-0000-0000-0000000004a2', tests.d())$$, $$values (1::numeric)$$,
  'B before hold: 3 on hand - 2 reserved = 1');
select tests.authenticate_as(tests.uid('ops'));
select tests.put('holdB', public.admin_set_batch_status((tests.ctx('batchB') #>> '{}')::uuid,
  (select version from public.product_batches where id = (tests.ctx('batchB') #>> '{}')::uuid), 'on_hold', 'DEV quality check'));
select tests.clear_authentication();
select is(tests.ctx('holdB') -> 'reservationsReturned', '1'::jsonb, 'holding returns the batch reservations to the pool');
select is((select batch_id from public.inventory_reservations where id = '00000000-0000-0000-0000-0000000004d4'), null::uuid,
  'the reservation is back in the supply pool');
select ok(exists (select 1 from public.operations_exceptions where exception_type = 'reservations_returned_to_pool'
                  and batch_id = (tests.ctx('batchB') #>> '{}')::uuid and details ->> 'cause' = 'hold'),
  'returning reservations raises an operations exception');
select results_eq($$select on_hand, atp from tests.avail('00000000-0000-0000-0000-0000000004a2', tests.d())$$,
  $$values (0::numeric, 0::numeric)$$, 'held stock is not available at once');
select tests.authenticate_as(tests.uid('ops'));
select throws_ok(format($$select public.admin_set_batch_status(%L, 1, 'on_hold', 'DEV again')$$, tests.ctx('batchB') #>> '{}'),
  'PT409', null, 'stale batch version is rejected');
select lives_ok(format($$select public.admin_set_batch_status(%L, %s, 'active', 'DEV passed')$$, tests.ctx('batchB') #>> '{}',
  tests.ctx('holdB') ->> 'version'), 'a held batch can be released');
select tests.clear_authentication();
select results_eq($$select on_hand, atp from tests.avail('00000000-0000-0000-0000-0000000004a2', tests.d())$$,
  $$values (3::numeric, 1::numeric)$$, 'released stock is available again; the pool reservation still counts');

-- ------------------------------------------------------------------ recall
select tests.authenticate_as(tests.uid('ops'));
select tests.put('recall', public.admin_create_recall('DEV contamination report', array[(tests.ctx('batchA') #>> '{}')::uuid]));
select tests.clear_authentication();
select matches(tests.ctx('recall') ->> 'recallNumber', '^SAM-RC-[0-9]{6}$', 'recall numbers use the SAM-RC format');
select is(tests.ctx('recall') -> 'reservationsReturned', '2'::jsonb, 'recall returns the batch reservations to the pool');
select is((select status::text from public.product_batches where id = (tests.ctx('batchA') #>> '{}')::uuid), 'recalled', 'batch recalled');
select is((select count(*)::int from public.product_recall_batches where batch_id = (tests.ctx('batchA') #>> '{}')::uuid), 1,
  'recall links the batch for traceability');
select results_eq($$select on_hand, reserved from tests.avail('00000000-0000-0000-0000-0000000004a1', tests.d())$$,
  $$values (0::numeric, 95::numeric)$$, 'recalled stock leaves availability; reservations stay counted in the pool');
select tests.authenticate_as(tests.uid('ops'));
select throws_ok(format($$select public.admin_adjust_stock(%L, 'adjustment_increase', '1', 'DEV')$$, tests.ctx('batchA') #>> '{}'),
  'PT409', null, 'recalled batches cannot be adjusted');
select throws_ok(format($$select public.admin_set_batch_status(%L, %s, 'active', 'DEV undo')$$, tests.ctx('batchA') #>> '{}',
  (select version from public.product_batches where id = (tests.ctx('batchA') #>> '{}')::uuid)),
  'PT409', null, 'a recall cannot be undone by a status change');
select throws_ok($$select public.admin_create_recall('DEV', array[]::uuid[])$$, 'PT422', null, 'a recall needs a batch');
select tests.clear_authentication();

-- ------------------------------------------------- receipt cancel, PO cancel
select tests.authenticate_as(tests.uid('ops'));
select tests.put('po3', public.admin_create_purchase_order('00000000-0000-0000-0000-0000000004f2', tests.d(),
  '[{"productId":"00000000-0000-0000-0000-0000000004a1","quantity":"4","unitCostPaise":1}]', 'DEV manual PO'));
select lives_ok(format($$select public.admin_set_purchase_order_status(%L, 1, 'send')$$, tests.ctx('po3') ->> 'id'), 'PO 3 sent');
select tests.put('grn4', public.admin_create_goods_receipt((tests.ctx('po3') ->> 'id')::uuid,
  jsonb_build_array(jsonb_build_object('poLineId',
    (select id from public.purchase_order_lines where purchase_order_id = (tests.ctx('po3') ->> 'id')::uuid),
    'received', '4', 'accepted', '4'))));
select throws_ok(format($$select public.admin_set_purchase_order_status(%L, 2, 'cancel', 'DEV not needed')$$, tests.ctx('po3') ->> 'id'),
  'PT409', null, 'a PO with an open draft receipt cannot be cancelled');
select throws_ok(format($$select public.admin_cancel_goods_receipt(%L, 1, '')$$, tests.ctx('grn4') ->> 'id'),
  'PT422', null, 'cancelling a receipt needs a reason');
select lives_ok(format($$select public.admin_cancel_goods_receipt(%L, 1, 'DEV wrong delivery')$$, tests.ctx('grn4') ->> 'id'),
  'a draft receipt can be cancelled');
select throws_ok(format($$select public.admin_post_goods_receipt(%L, 2)$$, tests.ctx('grn4') ->> 'id'),
  'PT409', null, 'a cancelled receipt cannot be posted');
select throws_ok(format($$select public.admin_set_purchase_order_status(%L, 2, 'cancel')$$, tests.ctx('po3') ->> 'id'),
  'PT422', null, 'cancelling a PO needs a reason');
select lives_ok(format($$select public.admin_set_purchase_order_status(%L, 2, 'cancel', 'DEV not needed')$$, tests.ctx('po3') ->> 'id'),
  'a sent PO without receipts can be cancelled');
select tests.clear_authentication();
select is((select count(*)::int from public.product_batches where supplier_id = '00000000-0000-0000-0000-0000000004f2'), 0,
  'cancelled receipts never create stock');
select isnt(tests.sqlstate_of(format($$update public.purchase_order_lines set ordered_quantity = 1 where purchase_order_id = %L$$,
  tests.ctx('po1') ->> 'id')), '00000', 'lines of a non-draft PO are frozen (even for the owner)');

-- ------------------------------------------------------- exceptions & reads
select tests.put('exc', to_jsonb((select id from public.operations_exceptions where exception_type = 'supply_shortfall'
  and product_id = '00000000-0000-0000-0000-0000000004a1' limit 1)));
select tests.authenticate_as(tests.uid('ops'));
select throws_ok(format($$select public.admin_resolve_exception(%L, '')$$, tests.ctx('exc') #>> '{}'),
  'PT422', null, 'resolving needs a note');
select lives_ok(format($$select public.admin_resolve_exception(%L, 'DEV customers informed')$$, tests.ctx('exc') #>> '{}'),
  'ops resolves an exception');
select throws_ok(format($$select public.admin_resolve_exception(%L, 'DEV again')$$, tests.ctx('exc') #>> '{}'),
  'PT404', null, 'an exception is resolved only once');
select is((public.dashboard_procurement_widgets() ->> 'inventoryWidgets')::boolean, true, 'ops gets inventory widgets');
select ok((public.dashboard_procurement_widgets() ->> 'openExceptions')::int >= 2, 'widgets count open exceptions');
select tests.clear_authentication();

select tests.authenticate_as(tests.uid('finance'));
select ok((public.admin_list_purchase_orders() #>> '{pagination,totalItems}')::int >= 3, 'finance can list purchase orders');
select is(public.admin_get_batch((tests.ctx('batchA') #>> '{}')::uuid) ->> 'onHand', '50', 'finance can read batch detail');
select is(public.admin_get_batch((tests.ctx('batchA') #>> '{}')::uuid) ->> 'available', '0', 'a recalled batch has nothing available');
select is((select x ->> 'recalled' from jsonb_array_elements(public.admin_inventory_summary()) x
           where x ->> 'productId' = '00000000-0000-0000-0000-0000000004a1'), '50', 'inventory summary shows recalled stock');
select is((select x ->> 'rejectedTotal' from jsonb_array_elements(public.admin_inventory_summary()) x
           where x ->> 'productId' = '00000000-0000-0000-0000-0000000004a1'), '16', 'inventory summary totals rejected quantities');
select throws_ok($$select public.admin_get_batch(gen_random_uuid())$$, 'PT404', null, 'unknown batch is not found');
select throws_ok($$select public.admin_resolve_exception(gen_random_uuid(), 'DEV')$$, 'PT403', null, 'finance cannot resolve exceptions');
select tests.clear_authentication();

select tests.authenticate_as(tests.uid('super'));
select is((select count(*)::int from jsonb_array_elements(public.admin_supply_awaiting_po(tests.d())) x
           where x ->> 'supplierId' in ('00000000-0000-0000-0000-0000000004f1', '00000000-0000-0000-0000-0000000004f2')), 0,
  'no supply awaits a PO once every record is ordered');
select tests.clear_authentication();

select * from finish();
rollback;
