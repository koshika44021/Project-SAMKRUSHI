-- =============================================================================
-- Phase 4 — read RPCs (single round trip) and overview widgets. Readers:
-- super_admin, operations_admin, finance_admin (private.can_read_inventory).
-- Quantities returned as decimal strings.
-- =============================================================================

create function private.require_inventory_reader()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_read_inventory() then
    raise exception 'not authorized' using errcode = 'PT403';
  end if;
end;
$$;
revoke all on function private.require_inventory_reader() from public, anon;
grant execute on function private.require_inventory_reader() to authenticated;

create function public.admin_list_purchase_orders(
  p_status public.purchase_order_status default null,
  p_supplier_id uuid default null,
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
  v_total integer;
  v_items jsonb;
begin
  perform private.require_inventory_reader();
  select count(*) into v_total from public.purchase_orders po
  where (p_status is null or po.status = p_status) and (p_supplier_id is null or po.supplier_id = p_supplier_id);

  select coalesce(jsonb_agg(x order by (x ->> 'createdAt') desc), '[]'::jsonb) into v_items from (
    select jsonb_build_object(
      'id', po.id, 'poNumber', po.po_number, 'status', po.status, 'expectedDate', po.expected_date,
      'supplierId', s.id, 'supplierName', s.name, 'supplierCode', s.supplier_code,
      'lineCount', (select count(*) from public.purchase_order_lines l where l.purchase_order_id = po.id),
      'createdAt', po.created_at, 'version', po.version) as x
    from public.purchase_orders po join public.suppliers s on s.id = po.supplier_id
    where (p_status is null or po.status = p_status) and (p_supplier_id is null or po.supplier_id = p_supplier_id)
    order by po.created_at desc, po.id
    offset (v_page - 1) * v_size limit v_size
  ) t;
  return jsonb_build_object('items', v_items, 'pagination', jsonb_build_object(
    'page', v_page, 'pageSize', v_size, 'totalItems', v_total, 'totalPages', ceil(v_total::numeric / v_size)::integer));
end;
$$;

create function public.admin_get_purchase_order(p_po_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform private.require_inventory_reader();
  select jsonb_build_object(
    'id', po.id, 'poNumber', po.po_number, 'status', po.status, 'expectedDate', po.expected_date, 'notes', po.notes,
    'supplierId', s.id, 'supplierName', s.name, 'supplierCode', s.supplier_code,
    'sentAt', po.sent_at, 'closedAt', po.closed_at, 'closeReason', po.close_reason,
    'cancelledAt', po.cancelled_at, 'cancelReason', po.cancel_reason,
    'createdAt', po.created_at, 'updatedAt', po.updated_at, 'version', po.version,
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
        'id', l.id, 'lineNumber', l.line_number, 'productId', l.product_id, 'productName', p.name,
        'productCode', p.product_code, 'unit', l.unit, 'quantityPrecision', p.quantity_precision,
        'orderedQuantity', trim_scale(l.ordered_quantity)::text,
        'agreedUnitCostPaise', l.agreed_unit_cost_paise, 'notes', l.notes,
        'supplyConfirmationId', l.supply_confirmation_id, 'supplyBusinessDate', sc.business_date,
        'receivedQuantity', trim_scale(pp.received)::text, 'acceptedQuantity', trim_scale(pp.accepted)::text,
        'rejectedQuantity', trim_scale(pp.rejected)::text, 'damagedQuantity', trim_scale(pp.damaged)::text,
        'remainingQuantity', trim_scale(greatest(0, l.ordered_quantity - pp.received))::text)
        order by l.line_number)
      from public.purchase_order_lines l
      join public.products p on p.id = l.product_id
      left join public.supply_confirmations sc on sc.id = l.supply_confirmation_id
      cross join lateral private.po_line_posted(l.id) pp
      where l.purchase_order_id = po.id), '[]'::jsonb),
    'receipts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'receiptNumber', r.receipt_number, 'status', r.status, 'receivedAt', r.received_at,
        'postedAt', r.posted_at) order by r.received_at desc)
      from public.goods_receipts r where r.purchase_order_id = po.id), '[]'::jsonb)
  ) into v
  from public.purchase_orders po join public.suppliers s on s.id = po.supplier_id
  where po.id = p_po_id;
  if v is null then raise exception 'purchase order not found' using errcode = 'PT404'; end if;
  return v;
end;
$$;

create function public.admin_list_goods_receipts(
  p_status public.goods_receipt_status default null,
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
  v_total integer;
  v_items jsonb;
begin
  perform private.require_inventory_reader();
  select count(*) into v_total from public.goods_receipts r where p_status is null or r.status = p_status;
  select coalesce(jsonb_agg(x order by (x ->> 'receivedAt') desc), '[]'::jsonb) into v_items from (
    select jsonb_build_object(
      'id', r.id, 'receiptNumber', r.receipt_number, 'status', r.status, 'receivedAt', r.received_at,
      'postedAt', r.posted_at, 'poId', po.id, 'poNumber', po.po_number,
      'supplierName', s.name, 'supplierCode', s.supplier_code,
      'lineCount', (select count(*) from public.goods_receipt_lines l where l.goods_receipt_id = r.id),
      'version', r.version) as x
    from public.goods_receipts r
    join public.purchase_orders po on po.id = r.purchase_order_id
    join public.suppliers s on s.id = r.supplier_id
    where p_status is null or r.status = p_status
    order by r.received_at desc, r.id
    offset (v_page - 1) * v_size limit v_size
  ) t;
  return jsonb_build_object('items', v_items, 'pagination', jsonb_build_object(
    'page', v_page, 'pageSize', v_size, 'totalItems', v_total, 'totalPages', ceil(v_total::numeric / v_size)::integer));
end;
$$;

create function public.admin_get_goods_receipt(p_receipt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform private.require_inventory_reader();
  select jsonb_build_object(
    'id', r.id, 'receiptNumber', r.receipt_number, 'status', r.status, 'receivedAt', r.received_at,
    'receivedByName', (select full_name from public.staff_profiles where user_id = r.received_by),
    'notes', r.notes, 'overReceiptReason', r.over_receipt_reason, 'postedAt', r.posted_at,
    'cancelledAt', r.cancelled_at, 'cancelReason', r.cancel_reason, 'version', r.version,
    'poId', po.id, 'poNumber', po.po_number, 'supplierName', s.name, 'supplierCode', s.supplier_code,
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
        'id', rl.id, 'poLineId', rl.purchase_order_line_id, 'productName', p.name, 'unit', p.base_unit,
        'receivedQuantity', trim_scale(rl.received_quantity)::text, 'acceptedQuantity', trim_scale(rl.accepted_quantity)::text,
        'rejectedQuantity', trim_scale(rl.rejected_quantity)::text, 'damagedQuantity', trim_scale(rl.damaged_quantity)::text,
        'qualityGrade', rl.quality_grade, 'qualityNotes', rl.quality_notes, 'lotCode', rl.lot_code,
        'harvestDate', rl.harvest_date, 'hasEvidence', rl.evidence_storage_key is not null,
        'batchId', b.id, 'batchCode', b.batch_code)
        order by l.line_number)
      from public.goods_receipt_lines rl
      join public.purchase_order_lines l on l.id = rl.purchase_order_line_id
      join public.products p on p.id = rl.product_id
      left join public.product_batches b on b.goods_receipt_line_id = rl.id
      where rl.goods_receipt_id = r.id), '[]'::jsonb)
  ) into v
  from public.goods_receipts r
  join public.purchase_orders po on po.id = r.purchase_order_id
  join public.suppliers s on s.id = r.supplier_id
  where r.id = p_receipt_id;
  if v is null then raise exception 'goods receipt not found' using errcode = 'PT404'; end if;
  return v;
end;
$$;

-- Inventory summary per product (base unit): on-hand by status, reserved, ATP today.
create function public.admin_inventory_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_inventory_reader();
  return coalesce((
    with bal as (
      select b.product_id, b.status, coalesce(sum(m.quantity_delta), 0) as qty
      from public.product_batches b left join public.inventory_movements m on m.batch_id = b.id
      group by b.product_id, b.id, b.status
    ),
    q as (
      select rl.product_id, sum(rl.rejected_quantity) as rejected, sum(rl.damaged_quantity) as damaged
      from public.goods_receipt_lines rl join public.goods_receipts r on r.id = rl.goods_receipt_id and r.status = 'posted'
      group by rl.product_id
    )
    select jsonb_agg(jsonb_build_object(
      'productId', p.id, 'productCode', p.product_code, 'name', p.name, 'baseUnit', p.base_unit,
      'onHandActive', trim_scale(coalesce((select sum(qty) from bal where bal.product_id = p.id and status = 'active'), 0))::text,
      'onHold', trim_scale(coalesce((select sum(qty) from bal where bal.product_id = p.id and status = 'on_hold'), 0))::text,
      'recalled', trim_scale(coalesce((select sum(qty) from bal where bal.product_id = p.id and status = 'recalled'), 0))::text,
      'reservedOnBatches', trim_scale(coalesce((select sum(r.quantity) from public.inventory_reservations r
          join public.product_batches b on b.id = r.batch_id and b.status = 'active'
          where r.product_id = p.id and r.status = 'active'), 0))::text,
      'rejectedTotal', trim_scale(coalesce(q.rejected, 0))::text,
      'damagedTotal', trim_scale(coalesce(q.damaged, 0))::text,
      'atpToday', trim_scale(a.atp)::text,
      'batchCount', (select count(*) from public.product_batches b where b.product_id = p.id and b.status in ('active', 'on_hold')))
      order by p.display_order, p.name)
    from public.products p
    join private.product_availability_core(public.current_business_date()) a on a.product_id = p.id
    left join q on q.product_id = p.id
  ), '[]'::jsonb);
end;
$$;

create function public.admin_list_batches(
  p_product_id uuid default null,
  p_status public.batch_status default null,
  p_page integer default 1,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_size integer := least(100, greatest(1, coalesce(p_page_size, 50)));
  v_total integer;
  v_items jsonb;
begin
  perform private.require_inventory_reader();
  select count(*) into v_total from public.product_batches b
  where (p_product_id is null or b.product_id = p_product_id) and (p_status is null or b.status = p_status);
  select coalesce(jsonb_agg(x order by (x ->> 'receivedAt'), (x ->> 'batchCode')), '[]'::jsonb) into v_items from (
    select jsonb_build_object(
      'id', b.id, 'batchCode', b.batch_code, 'productId', p.id, 'productName', p.name, 'unit', p.base_unit,
      'supplierName', s.name, 'supplierCode', s.supplier_code, 'receivedAt', b.received_at, 'harvestDate', b.harvest_date,
      'status', b.status, 'statusReason', b.status_reason,
      'initialQuantity', trim_scale(b.initial_quantity)::text,
      'onHand', trim_scale(bb.on_hand)::text, 'reserved', trim_scale(bb.reserved)::text,
      'available', trim_scale(case when b.status = 'active' then greatest(0, bb.on_hand - bb.reserved) else 0 end)::text,
      'version', b.version) as x
    from public.product_batches b
    join public.products p on p.id = b.product_id
    join public.suppliers s on s.id = b.supplier_id
    cross join lateral private.batch_balance(b.id) bb
    where (p_product_id is null or b.product_id = p_product_id) and (p_status is null or b.status = p_status)
    order by b.received_at, b.batch_code
    offset (v_page - 1) * v_size limit v_size
  ) t;
  return jsonb_build_object('items', v_items, 'pagination', jsonb_build_object(
    'page', v_page, 'pageSize', v_size, 'totalItems', v_total, 'totalPages', ceil(v_total::numeric / v_size)::integer));
end;
$$;

create function public.admin_get_batch(p_batch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform private.require_inventory_reader();
  select jsonb_build_object(
    'id', b.id, 'batchCode', b.batch_code, 'productId', p.id, 'productName', p.name, 'unit', p.base_unit,
    'quantityPrecision', p.quantity_precision,
    'supplierName', s.name, 'supplierCode', s.supplier_code, 'receivedAt', b.received_at, 'harvestDate', b.harvest_date,
    'status', b.status, 'statusReason', b.status_reason, 'initialQuantity', trim_scale(b.initial_quantity)::text,
    'unitCostPaise', b.unit_cost_paise,
    'onHand', trim_scale(bb.on_hand)::text, 'reserved', trim_scale(bb.reserved)::text,
    'available', trim_scale(case when b.status = 'active' then greatest(0, bb.on_hand - bb.reserved) else 0 end)::text,
    'receiptId', r.id, 'receiptNumber', r.receipt_number, 'version', b.version,
    'movements', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'movementType', m.movement_type, 'quantityDelta', trim_scale(m.quantity_delta)::text,
        'reason', m.reason, 'createdAt', m.created_at,
        'createdByName', (select full_name from public.staff_profiles where user_id = m.created_by))
        order by m.created_at, m.id)
      from public.inventory_movements m where m.batch_id = b.id), '[]'::jsonb),
    'recalls', coalesce((select jsonb_agg(jsonb_build_object('recallNumber', rc.recall_number, 'reason', rc.reason,
        'createdAt', rc.created_at))
      from public.product_recall_batches rb join public.product_recalls rc on rc.id = rb.recall_id
      where rb.batch_id = b.id), '[]'::jsonb)
  ) into v
  from public.product_batches b
  join public.products p on p.id = b.product_id
  join public.suppliers s on s.id = b.supplier_id
  join public.goods_receipt_lines rl on rl.id = b.goods_receipt_line_id
  join public.goods_receipts r on r.id = rl.goods_receipt_id
  cross join lateral private.batch_balance(b.id) bb
  where b.id = p_batch_id;
  if v is null then raise exception 'batch not found' using errcode = 'PT404'; end if;
  return v;
end;
$$;

create function public.admin_list_exceptions(
  p_status public.operations_exception_status default 'open',
  p_page integer default 1,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_size integer := least(100, greatest(1, coalesce(p_page_size, 50)));
  v_total integer;
  v_items jsonb;
begin
  perform private.require_inventory_reader();
  select count(*) into v_total from public.operations_exceptions e where p_status is null or e.status = p_status;
  select coalesce(jsonb_agg(x order by (x ->> 'createdAt') desc), '[]'::jsonb) into v_items from (
    select jsonb_build_object(
      'id', e.id, 'type', e.exception_type, 'status', e.status, 'productName', p.name, 'businessDate', e.business_date,
      'batchCode', b.batch_code, 'details', e.details, 'createdAt', e.created_at,
      'resolvedAt', e.resolved_at, 'resolutionNote', e.resolution_note,
      'resolvedByName', (select full_name from public.staff_profiles where user_id = e.resolved_by)) as x
    from public.operations_exceptions e
    left join public.products p on p.id = e.product_id
    left join public.product_batches b on b.id = e.batch_id
    where p_status is null or e.status = p_status
    order by e.created_at desc, e.id
    offset (v_page - 1) * v_size limit v_size
  ) t;
  return jsonb_build_object('items', v_items, 'pagination', jsonb_build_object(
    'page', v_page, 'pageSize', v_size, 'totalItems', v_total, 'totalPages', ceil(v_total::numeric / v_size)::integer));
end;
$$;

-- Active suppliers + their open supply for a date (PO-from-supply picker).
create function public.admin_supply_awaiting_po(p_business_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_inventory_reader();
  return coalesce((
    select jsonb_agg(jsonb_build_object('supplierId', s.id, 'supplierName', s.name, 'supplierCode', s.supplier_code,
             'records', x.records) order by s.name)
    from (
      select c.supplier_id, count(*)::integer as records
      from public.supply_confirmations c
      where c.business_date = p_business_date and c.status = 'active' and c.quantity > 0
        and not exists (select 1 from public.purchase_order_lines l join public.purchase_orders po on po.id = l.purchase_order_id
                        where l.supply_confirmation_id = c.id and po.status <> 'cancelled')
      group by c.supplier_id
    ) x
    join public.suppliers s on s.id = x.supplier_id and s.status = 'active'
  ), '[]'::jsonb);
end;
$$;

-- --------------------------------------------- overview: procurement widgets
create function public.dashboard_procurement_widgets()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_read_inventory() then
    return jsonb_build_object('inventoryWidgets', false);
  end if;
  return jsonb_build_object(
    'inventoryWidgets', true,
    'posAwaitingReceipt', (select count(*) from public.purchase_orders where status in ('sent', 'partially_received')),
    'draftReceipts', (select count(*) from public.goods_receipts where status = 'draft'),
    'heldBatches', (select count(*) from public.product_batches where status = 'on_hold'),
    'recalledBatches', (select count(*) from public.product_batches where status = 'recalled'),
    'openExceptions', (select count(*) from public.operations_exceptions where status = 'open'));
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_list_purchase_orders(public.purchase_order_status, uuid, integer, integer)',
    'public.admin_get_purchase_order(uuid)',
    'public.admin_list_goods_receipts(public.goods_receipt_status, integer, integer)',
    'public.admin_get_goods_receipt(uuid)',
    'public.admin_inventory_summary()',
    'public.admin_list_batches(uuid, public.batch_status, integer, integer)',
    'public.admin_get_batch(uuid)',
    'public.admin_list_exceptions(public.operations_exception_status, integer, integer)',
    'public.admin_supply_awaiting_po(date)',
    'public.dashboard_procurement_widgets()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
revoke execute on all functions in schema private from public, anon;
