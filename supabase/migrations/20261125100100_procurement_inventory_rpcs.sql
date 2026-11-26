-- =============================================================================
-- Phase 4 — procurement / receiving / inventory write path (ADR-0012).
-- All RPCs: private.begin_admin_action (role + audit context), optimistic
-- concurrency, PT403/PT404/PT409/PT422 errors, row locks for concurrency.
-- Roles: super_admin, operations_admin. Quantities: base unit, exact NUMERIC.
-- =============================================================================

-- ----------------------------------------------------------------- helpers
create function private.next_document_number(p_kind text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return case p_kind
    when 'po' then 'SAM-PO-' || lpad(nextval('private.po_number_seq')::text, 6, '0')
    when 'grn' then 'SAM-GRN-' || lpad(nextval('private.grn_number_seq')::text, 6, '0')
    when 'batch' then 'SAM-B-' || lpad(nextval('private.batch_number_seq')::text, 6, '0')
    when 'recall' then 'SAM-RC-' || lpad(nextval('private.recall_number_seq')::text, 6, '0')
  end;
end;
$$;

-- Quantity parsing: exact, positive (or non-negative), ≤ product precision.
create function private.parse_quantity(p_value text, p_field text, p_precision smallint, p_allow_zero boolean default false)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v numeric;
begin
  if p_value is null or p_value !~ '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,3})?$' then
    raise exception '% must be a decimal quantity', p_field using errcode = 'PT422', detail = p_field;
  end if;
  v := trim_scale(p_value::numeric);
  if v = 0 and not p_allow_zero then
    raise exception '% must be greater than zero', p_field using errcode = 'PT422', detail = p_field;
  end if;
  if v <> round(v, p_precision) then
    raise exception '% exceeds product precision (% decimals)', p_field, p_precision using errcode = 'PT422', detail = p_field;
  end if;
  return v;
end;
$$;

-- Received total already POSTED for a PO line.
create function private.po_line_posted(p_po_line_id uuid)
returns table (received numeric, accepted numeric, rejected numeric, damaged numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(rl.received_quantity), 0), coalesce(sum(rl.accepted_quantity), 0),
         coalesce(sum(rl.rejected_quantity), 0), coalesce(sum(rl.damaged_quantity), 0)
  from public.goods_receipt_lines rl
  join public.goods_receipts r on r.id = rl.goods_receipt_id and r.status = 'posted'
  where rl.purchase_order_line_id = p_po_line_id;
$$;

-- On-hand (ledger) and active reservations of one batch.
create function private.batch_balance(p_batch_id uuid)
returns table (on_hand numeric, reserved numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select sum(m.quantity_delta) from public.inventory_movements m where m.batch_id = p_batch_id), 0),
    coalesce((select sum(r.quantity) from public.inventory_reservations r where r.batch_id = p_batch_id and r.status = 'active'), 0);
$$;

-- Return a batch's active reservations to the supply pool (+ exception).
create function private.return_batch_reservations_to_pool(p_batch_id uuid, p_cause text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_product uuid;
begin
  with moved as (
    update public.inventory_reservations
       set batch_id = null, status_changed_at = now()
     where batch_id = p_batch_id and status = 'active'
     returning id, business_date, quantity
  )
  select count(*) into v_count from moved;
  if v_count > 0 then
    select product_id into v_product from public.product_batches where id = p_batch_id;
    insert into public.operations_exceptions (exception_type, product_id, batch_id, details)
    values ('reservations_returned_to_pool', v_product, p_batch_id,
            jsonb_build_object('cause', p_cause, 'reservations', v_count));
  end if;
  return v_count;
end;
$$;

-- Validate and insert PO lines from JSON: [{productId, quantity, unitCostPaise?, supplyConfirmationId?, notes?}]
create function private.insert_po_lines(p_po_id uuid, p_supplier_id uuid, p_lines jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line jsonb;
  v_n integer := 0;
  v_product record;
  v_qty numeric;
  v_supply record;
  v_cost bigint;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'a purchase order needs at least one line' using errcode = 'PT422', detail = 'lines';
  end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_n := v_n + 1;
    select id, base_unit, quantity_precision, is_active into v_product
    from public.products where id = nullif(v_line ->> 'productId', '')::uuid;
    if v_product.id is null or not v_product.is_active then
      raise exception 'line %: choose an active catalog product', v_n using errcode = 'PT422', detail = 'lines';
    end if;
    v_qty := private.parse_quantity(v_line ->> 'quantity', 'quantity', v_product.quantity_precision);
    v_cost := nullif(v_line ->> 'unitCostPaise', '')::bigint;
    if v_cost is not null and v_cost < 0 then
      raise exception 'line %: unit cost cannot be negative', v_n using errcode = 'PT422', detail = 'lines';
    end if;

    if nullif(v_line ->> 'supplyConfirmationId', '') is not null then
      select c.* into v_supply from public.supply_confirmations c
      where c.id = (v_line ->> 'supplyConfirmationId')::uuid for update;
      if v_supply.id is null or v_supply.supplier_id <> p_supplier_id or v_supply.product_id <> v_product.id
         or v_supply.status <> 'active' then
        raise exception 'line %: the linked supply must be active and belong to this farmer and product', v_n
          using errcode = 'PT422', detail = 'lines';
      end if;
      if exists (
        select 1 from public.purchase_order_lines l
        join public.purchase_orders po on po.id = l.purchase_order_id
        where l.supply_confirmation_id = v_supply.id and po.status <> 'cancelled' and po.id <> p_po_id
      ) then
        raise exception 'line %: this supply record is already on another purchase order', v_n
          using errcode = 'PT409', detail = 'lines';
      end if;
    end if;

    insert into public.purchase_order_lines
      (purchase_order_id, line_number, product_id, ordered_quantity, unit, agreed_unit_cost_paise, supply_confirmation_id, notes)
    values (p_po_id, v_n, v_product.id, v_qty, v_product.base_unit, v_cost,
            nullif(v_line ->> 'supplyConfirmationId', '')::uuid, nullif(btrim(v_line ->> 'notes'), ''));
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------- purchase orders
create function public.admin_create_purchase_order(
  p_supplier_id uuid,
  p_expected_date date,
  p_lines jsonb,
  p_notes text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_number text;
begin
  perform private.begin_admin_action(array['super_admin', 'operations_admin']::public.app_role[], p_request_id, 'purchase order created');
  if not exists (select 1 from public.suppliers where id = p_supplier_id and status = 'active') then
    raise exception 'choose an active farmer/supplier' using errcode = 'PT422', detail = 'supplierId';
  end if;
  if p_expected_date is null then
    raise exception 'expected date is required' using errcode = 'PT422', detail = 'expectedDate';
  end if;
  v_number := private.next_document_number('po');
  insert into public.purchase_orders (po_number, supplier_id, expected_date, notes, created_by, updated_by)
  values (v_number, p_supplier_id, p_expected_date, nullif(btrim(p_notes), ''), (select auth.uid()), (select auth.uid()))
  returning id into v_id;
  perform private.insert_po_lines(v_id, p_supplier_id, p_lines);
  return jsonb_build_object('id', v_id, 'poNumber', v_number, 'version', 1);
end;
$$;

-- Prefill a draft PO from a farmer's active, not-yet-ordered supply for a date.
create function public.admin_create_po_from_supply(
  p_supplier_id uuid,
  p_business_date date,
  p_expected_date date default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lines jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'productId', c.product_id, 'quantity', trim_scale(c.quantity)::text, 'supplyConfirmationId', c.id)
           order by p.display_order, p.name), '[]'::jsonb)
    into v_lines
  from public.supply_confirmations c
  join public.products p on p.id = c.product_id
  where c.supplier_id = p_supplier_id and c.business_date = p_business_date
    and c.status = 'active' and c.quantity > 0
    and not exists (
      select 1 from public.purchase_order_lines l
      join public.purchase_orders po on po.id = l.purchase_order_id
      where l.supply_confirmation_id = c.id and po.status <> 'cancelled');

  if jsonb_array_length(v_lines) = 0 then
    raise exception 'no active, unordered farmer-confirmed supply for this farmer and date'
      using errcode = 'PT422', detail = 'businessDate';
  end if;
  return public.admin_create_purchase_order(p_supplier_id, coalesce(p_expected_date, p_business_date), v_lines,
    'Created from farmer-confirmed supply for ' || p_business_date::text, p_request_id);
end;
$$;

create function public.admin_update_purchase_order(
  p_po_id uuid,
  p_expected_version integer,
  p_expected_date date,
  p_lines jsonb,
  p_notes text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_version integer;
begin
  perform private.begin_admin_action(array['super_admin', 'operations_admin']::public.app_role[], p_request_id, 'purchase order edited');
  select * into v_po from public.purchase_orders where id = p_po_id for update;
  if not found then raise exception 'purchase order not found' using errcode = 'PT404'; end if;
  if v_po.version <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'PT409', hint = 'Reload and try again.';
  end if;
  if v_po.status <> 'draft' then
    raise exception 'only draft purchase orders can be edited' using errcode = 'PT409';
  end if;
  delete from public.purchase_order_lines where purchase_order_id = p_po_id;
  perform private.insert_po_lines(p_po_id, v_po.supplier_id, p_lines);
  update public.purchase_orders set expected_date = p_expected_date, notes = nullif(btrim(p_notes), ''),
         updated_by = (select auth.uid())
  where id = p_po_id returning version into v_version;
  return jsonb_build_object('id', p_po_id, 'version', v_version);
end;
$$;

-- Status transitions: send / cancel / close (short).
create function public.admin_set_purchase_order_status(
  p_po_id uuid,
  p_expected_version integer,
  p_action text,
  p_reason text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_version integer;
  v_reason text;
begin
  perform private.begin_admin_action(array['super_admin', 'operations_admin']::public.app_role[], p_request_id,
    'purchase order ' || coalesce(p_action, ''));
  select * into v_po from public.purchase_orders where id = p_po_id for update;
  if not found then raise exception 'purchase order not found' using errcode = 'PT404'; end if;
  if v_po.version <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'PT409', hint = 'Reload and try again.';
  end if;

  if p_action = 'send' then
    if v_po.status <> 'draft' then raise exception 'only a draft can be sent' using errcode = 'PT409'; end if;
    update public.purchase_orders set status = 'sent', sent_at = now(), updated_by = (select auth.uid())
    where id = p_po_id returning version into v_version;
  elsif p_action = 'cancel' then
    v_reason := private.require_reason(p_reason);
    perform set_config('app.reason', 'purchase order cancelled: ' || v_reason, true);
    if v_po.status not in ('draft', 'sent') then
      raise exception 'only draft or sent purchase orders without receipts can be cancelled' using errcode = 'PT409';
    end if;
    if exists (select 1 from public.goods_receipts where purchase_order_id = p_po_id and status <> 'cancelled') then
      raise exception 'cancel the draft receipts of this purchase order first' using errcode = 'PT409';
    end if;
    update public.purchase_orders set status = 'cancelled', cancelled_at = now(), cancel_reason = v_reason,
           updated_by = (select auth.uid())
    where id = p_po_id returning version into v_version;
  elsif p_action = 'close' then
    v_reason := private.require_reason(p_reason);
    perform set_config('app.reason', 'purchase order closed short: ' || v_reason, true);
    if v_po.status <> 'partially_received' then
      raise exception 'only partially received purchase orders can be closed short' using errcode = 'PT409';
    end if;
    if exists (select 1 from public.goods_receipts where purchase_order_id = p_po_id and status = 'draft') then
      raise exception 'post or cancel the draft receipts of this purchase order first' using errcode = 'PT409';
    end if;
    update public.purchase_orders set status = 'received', closed_at = now(), close_reason = v_reason,
           updated_by = (select auth.uid())
    where id = p_po_id returning version into v_version;
  else
    raise exception 'unknown action' using errcode = 'PT422', detail = 'action';
  end if;
  return jsonb_build_object('id', p_po_id, 'version', v_version);
end;
$$;

-- ------------------------------------------------------------- receiving
-- Lines: [{poLineId, received, accepted, rejected?, damaged?, qualityGrade?, qualityNotes?, lotCode?, harvestDate?, evidenceKey?}]
create function public.admin_create_goods_receipt(
  p_po_id uuid,
  p_lines jsonb,
  p_received_at timestamptz default null,
  p_notes text default null,
  p_over_receipt_reason text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_id uuid;
  v_number text;
  v_line jsonb;
  v_po_line record;
  v_n integer := 0;
  v_received numeric;
  v_accepted numeric;
  v_rejected numeric;
  v_damaged numeric;
  v_over boolean := false;
begin
  perform private.begin_admin_action(array['super_admin', 'operations_admin']::public.app_role[], p_request_id, 'goods receipt recorded');
  select * into v_po from public.purchase_orders where id = p_po_id for update;
  if not found then raise exception 'purchase order not found' using errcode = 'PT404'; end if;
  if v_po.status not in ('sent', 'partially_received') then
    raise exception 'goods can only be received against a sent or partially received purchase order' using errcode = 'PT409';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'record at least one received line' using errcode = 'PT422', detail = 'lines';
  end if;

  v_number := private.next_document_number('grn');
  insert into public.goods_receipts (receipt_number, purchase_order_id, supplier_id, received_at, received_by, notes,
                                     over_receipt_reason, created_by, updated_by)
  values (v_number, p_po_id, v_po.supplier_id, coalesce(p_received_at, now()), (select auth.uid()),
          nullif(btrim(p_notes), ''), nullif(btrim(p_over_receipt_reason), ''), (select auth.uid()), (select auth.uid()))
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_n := v_n + 1;
    select l.*, p.quantity_precision into v_po_line
    from public.purchase_order_lines l join public.products p on p.id = l.product_id
    where l.id = nullif(v_line ->> 'poLineId', '')::uuid and l.purchase_order_id = p_po_id;
    if v_po_line.id is null then
      raise exception 'line %: not a line of this purchase order', v_n using errcode = 'PT422', detail = 'lines';
    end if;
    v_received := private.parse_quantity(v_line ->> 'received', 'received', v_po_line.quantity_precision);
    v_accepted := private.parse_quantity(coalesce(v_line ->> 'accepted', '0'), 'accepted', v_po_line.quantity_precision, true);
    v_rejected := private.parse_quantity(coalesce(v_line ->> 'rejected', '0'), 'rejected', v_po_line.quantity_precision, true);
    v_damaged := private.parse_quantity(coalesce(v_line ->> 'damaged', '0'), 'damaged', v_po_line.quantity_precision, true);
    if v_received <> v_accepted + v_rejected + v_damaged then
      raise exception 'line %: accepted + rejected + damaged must equal received', v_n using errcode = 'PT422', detail = 'lines';
    end if;
    if (select received from private.po_line_posted(v_po_line.id)) + v_received > v_po_line.ordered_quantity then
      v_over := true;
    end if;
    if nullif(v_line ->> 'evidenceKey', '') is not null and (v_line ->> 'evidenceKey') not like 'receipts/%' then
      raise exception 'line %: evidence key must live under receipts/', v_n using errcode = 'PT422', detail = 'lines';
    end if;

    insert into public.goods_receipt_lines (goods_receipt_id, purchase_order_line_id, product_id, received_quantity,
      accepted_quantity, rejected_quantity, damaged_quantity, quality_grade, quality_notes, lot_code, harvest_date,
      evidence_storage_key)
    values (v_id, v_po_line.id, v_po_line.product_id, v_received, v_accepted, v_rejected, v_damaged,
            nullif(btrim(v_line ->> 'qualityGrade'), ''), nullif(btrim(v_line ->> 'qualityNotes'), ''),
            nullif(btrim(v_line ->> 'lotCode'), ''), nullif(v_line ->> 'harvestDate', '')::date,
            nullif(v_line ->> 'evidenceKey', ''));
  end loop;

  if v_over and (p_over_receipt_reason is null or char_length(btrim(p_over_receipt_reason)) < 3) then
    raise exception 'over_receipt' using errcode = 'PT409',
      hint = 'More than the ordered quantity was received. Give a reason to accept the over-receipt.';
  end if;
  return jsonb_build_object('id', v_id, 'receiptNumber', v_number, 'version', 1, 'overReceipt', v_over);
end;
$$;

-- Posting: batches + receipt movements (accepted only), supply conversion
-- (derived from posted lines), pool → batch re-pointing, shortfall check,
-- PO status. One transaction; PO and supply rows locked.
create function public.admin_post_goods_receipt(
  p_receipt_id uuid,
  p_expected_version integer,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.goods_receipts%rowtype;
  v_line record;
  v_batch uuid;
  v_batch_code text;
  v_res record;
  v_remaining numeric;
  v_pool numeric;
  v_open numeric;
  v_batches integer := 0;
  v_moved integer := 0;
  v_over boolean := false;
  v_all_received boolean;
begin
  perform private.begin_admin_action(array['super_admin', 'operations_admin']::public.app_role[], p_request_id, 'goods receipt posted');
  select * into v_receipt from public.goods_receipts where id = p_receipt_id for update;
  if not found then raise exception 'goods receipt not found' using errcode = 'PT404'; end if;
  if v_receipt.version <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'PT409', hint = 'Reload and try again.';
  end if;
  if v_receipt.status <> 'draft' then raise exception 'only a draft receipt can be posted' using errcode = 'PT409'; end if;
  perform 1 from public.purchase_orders where id = v_receipt.purchase_order_id for update;

  for v_line in
    select rl.*, l.ordered_quantity, l.agreed_unit_cost_paise, l.supply_confirmation_id, sc.business_date as supply_date
    from public.goods_receipt_lines rl
    join public.purchase_order_lines l on l.id = rl.purchase_order_line_id
    left join public.supply_confirmations sc on sc.id = l.supply_confirmation_id
    where rl.goods_receipt_id = p_receipt_id
    order by l.line_number
  loop
    -- Concurrency-safe over-receipt re-check against POSTED totals.
    if (select received from private.po_line_posted(v_line.purchase_order_line_id)) + v_line.received_quantity > v_line.ordered_quantity then
      v_over := true;
    end if;
    if v_line.supply_confirmation_id is not null then
      perform 1 from public.supply_confirmations where id = v_line.supply_confirmation_id for update;
    end if;

    if v_line.accepted_quantity > 0 then
      v_batch_code := private.next_document_number('batch');
      insert into public.product_batches (batch_code, product_id, supplier_id, goods_receipt_line_id, received_at,
                                          harvest_date, initial_quantity, unit_cost_paise, created_by, updated_by)
      values (v_batch_code, v_line.product_id, v_receipt.supplier_id, v_line.id, v_receipt.received_at,
              v_line.harvest_date, v_line.accepted_quantity, v_line.agreed_unit_cost_paise,
              (select auth.uid()), (select auth.uid()))
      returning id into v_batch;
      insert into public.inventory_movements (batch_id, product_id, movement_type, quantity_delta, reason,
                                              reference_type, reference_id, request_id, created_by)
      values (v_batch, v_line.product_id, 'receipt', v_line.accepted_quantity, 'goods receipt ' || v_receipt.receipt_number,
              'goods_receipt_line', v_line.id, private.current_request_id(), (select auth.uid()));
      v_batches := v_batches + 1;

      -- Re-point pool reservations for the supply's business date (oldest first).
      if v_line.supply_date is not null then
        v_remaining := v_line.accepted_quantity;
        for v_res in
          select * from public.inventory_reservations
          where product_id = v_line.product_id and business_date = v_line.supply_date
            and batch_id is null and status = 'active'
          order by created_at, id
          for update
        loop
          exit when v_remaining <= 0;
          if v_res.quantity <= v_remaining then
            update public.inventory_reservations set batch_id = v_batch, status_changed_at = now() where id = v_res.id;
            v_remaining := v_remaining - v_res.quantity;
          else
            -- Split: the covered part moves to the batch, the rest stays in the pool.
            update public.inventory_reservations set quantity = v_res.quantity - v_remaining, status_changed_at = now()
            where id = v_res.id;
            insert into public.inventory_reservations (product_id, business_date, zone_id, batch_id, quantity, status,
                                                       expires_at, reference_type, reference_id, status_changed_at)
            values (v_res.product_id, v_res.business_date, v_res.zone_id, v_batch, v_remaining, 'active',
                    v_res.expires_at, v_res.reference_type, v_res.reference_id, now());
            v_remaining := 0;
          end if;
          v_moved := v_moved + 1;
        end loop;
      end if;
    end if;
  end loop;

  update public.goods_receipts set status = 'posted', posted_at = now(), posted_by = (select auth.uid()),
         updated_by = (select auth.uid())
  where id = p_receipt_id;

  -- Shortfall: pool reservations exceeding remaining open supply (per product/date touched).
  for v_line in
    select distinct rl.product_id, sc.business_date
    from public.goods_receipt_lines rl
    join public.purchase_order_lines l on l.id = rl.purchase_order_line_id
    join public.supply_confirmations sc on sc.id = l.supply_confirmation_id
    where rl.goods_receipt_id = p_receipt_id
  loop
    select coalesce(sum(quantity), 0) into v_pool from public.inventory_reservations
    where product_id = v_line.product_id and business_date = v_line.business_date and batch_id is null and status = 'active';
    select a.open_confirmed_supply into v_open
    from private.product_availability_core(v_line.business_date, null, array[v_line.product_id]) a;
    if v_pool > coalesce(v_open, 0) then
      insert into public.operations_exceptions (exception_type, product_id, business_date, details)
      values ('supply_shortfall', v_line.product_id, v_line.business_date,
              jsonb_build_object('poolReserved', v_pool::text, 'openSupply', coalesce(v_open, 0)::text,
                                 'receipt', v_receipt.receipt_number));
    end if;
  end loop;

  if v_over then
    if v_receipt.over_receipt_reason is null then
      raise exception 'over_receipt' using errcode = 'PT409',
        hint = 'Another receipt was posted meanwhile; this one now exceeds the ordered quantity. Recreate it with a reason.';
    end if;
    insert into public.operations_exceptions (exception_type, details)
    values ('over_receipt', jsonb_build_object('receipt', v_receipt.receipt_number, 'reason', v_receipt.over_receipt_reason));
  end if;

  select bool_and((select received from private.po_line_posted(l.id)) >= l.ordered_quantity) into v_all_received
  from public.purchase_order_lines l where l.purchase_order_id = v_receipt.purchase_order_id;
  update public.purchase_orders
     set status = case when v_all_received then 'received'::public.purchase_order_status else 'partially_received' end,
         updated_by = (select auth.uid())
   where id = v_receipt.purchase_order_id;

  return jsonb_build_object('id', p_receipt_id, 'batches', v_batches, 'reservationsMoved', v_moved);
end;
$$;

create function public.admin_cancel_goods_receipt(
  p_receipt_id uuid,
  p_expected_version integer,
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
  v_version integer;
begin
  perform private.begin_admin_action(array['super_admin', 'operations_admin']::public.app_role[], p_request_id,
    'goods receipt cancelled: ' || v_reason);
  update public.goods_receipts set status = 'cancelled', cancelled_at = now(), cancel_reason = v_reason,
         updated_by = (select auth.uid())
  where id = p_receipt_id and version = p_expected_version and status = 'draft'
  returning version into v_version;
  if v_version is null then
    if not exists (select 1 from public.goods_receipts where id = p_receipt_id) then
      raise exception 'goods receipt not found' using errcode = 'PT404';
    end if;
    raise exception 'only the current version of a draft receipt can be cancelled' using errcode = 'PT409';
  end if;
  return jsonb_build_object('id', p_receipt_id, 'version', v_version);
end;
$$;

-- ------------------------------------------------------------- inventory
create function public.admin_adjust_stock(
  p_batch_id uuid,
  p_movement_type public.inventory_movement_type,
  p_quantity text,
  p_reason text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch record;
  v_qty numeric;
  v_balance record;
  v_delta numeric;
  v_reason text := private.require_reason(p_reason);
begin
  perform private.begin_admin_action(array['super_admin', 'operations_admin']::public.app_role[], p_request_id,
    'stock ' || p_movement_type::text || ': ' || v_reason);
  if p_movement_type in ('receipt', 'sale') then
    raise exception 'receipt and sale movements are created by receiving and fulfilment only'
      using errcode = 'PT422', detail = 'movementType';
  end if;
  select b.*, p.quantity_precision into v_batch
  from public.product_batches b join public.products p on p.id = b.product_id
  where b.id = p_batch_id for update of b;
  if v_batch.id is null then raise exception 'batch not found' using errcode = 'PT404'; end if;
  if v_batch.status = 'recalled' then raise exception 'recalled batches cannot be adjusted' using errcode = 'PT409'; end if;

  v_qty := private.parse_quantity(p_quantity, 'quantity', v_batch.quantity_precision);
  select * into v_balance from private.batch_balance(p_batch_id);
  if p_movement_type in ('adjustment_increase', 'return_to_stock') then
    v_delta := v_qty;
  else
    v_delta := -v_qty;
    -- Never below reserved: ATP can never go negative.
    if v_qty > v_balance.on_hand - v_balance.reserved then
      raise exception 'only % can be removed (on hand % minus reserved %)',
        trim_scale(v_balance.on_hand - v_balance.reserved), trim_scale(v_balance.on_hand), trim_scale(v_balance.reserved)
        using errcode = 'PT409', detail = 'quantity';
    end if;
  end if;

  insert into public.inventory_movements (batch_id, product_id, movement_type, quantity_delta, reason, request_id, created_by)
  values (p_batch_id, v_batch.product_id, p_movement_type, v_delta, v_reason, private.current_request_id(), (select auth.uid()));

  update public.product_batches
     set status = case
                    when v_balance.on_hand + v_delta = 0 then 'depleted'::public.batch_status
                    when status = 'depleted' and v_balance.on_hand + v_delta > 0 then 'active'::public.batch_status
                    else status end,
         updated_by = (select auth.uid())
   where id = p_batch_id;
  return jsonb_build_object('batchId', p_batch_id, 'onHand', trim_scale(v_balance.on_hand + v_delta)::text);
end;
$$;

-- Hold / release. Holding returns the batch's reservations to the pool.
create function public.admin_set_batch_status(
  p_batch_id uuid,
  p_expected_version integer,
  p_status public.batch_status,
  p_reason text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.product_batches%rowtype;
  v_reason text := private.require_reason(p_reason);
  v_returned integer := 0;
  v_version integer;
begin
  perform private.begin_admin_action(array['super_admin', 'operations_admin']::public.app_role[], p_request_id,
    'batch ' || p_status::text || ': ' || v_reason);
  select * into v_batch from public.product_batches where id = p_batch_id for update;
  if not found then raise exception 'batch not found' using errcode = 'PT404'; end if;
  if v_batch.version <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'PT409', hint = 'Reload and try again.';
  end if;
  if p_status = 'on_hold' and v_batch.status = 'active' then
    v_returned := private.return_batch_reservations_to_pool(p_batch_id, 'hold');
  elsif p_status = 'active' and v_batch.status = 'on_hold' then
    null;
  else
    raise exception 'a % batch cannot become %', v_batch.status, p_status using errcode = 'PT409';
  end if;
  update public.product_batches set status = p_status, status_reason = v_reason, updated_by = (select auth.uid())
  where id = p_batch_id returning version into v_version;
  return jsonb_build_object('batchId', p_batch_id, 'version', v_version, 'reservationsReturned', v_returned);
end;
$$;

create function public.admin_create_recall(
  p_reason text,
  p_batch_ids uuid[],
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := private.require_reason(p_reason);
  v_id uuid;
  v_number text;
  v_batch uuid;
  v_returned integer := 0;
begin
  perform private.begin_admin_action(array['super_admin', 'operations_admin']::public.app_role[], p_request_id, 'recall: ' || v_reason);
  if p_batch_ids is null or cardinality(p_batch_ids) = 0 then
    raise exception 'choose at least one batch' using errcode = 'PT422', detail = 'batchIds';
  end if;
  v_number := private.next_document_number('recall');
  insert into public.product_recalls (recall_number, reason, created_by) values (v_number, v_reason, (select auth.uid()))
  returning id into v_id;
  foreach v_batch in array p_batch_ids loop
    perform 1 from public.product_batches where id = v_batch for update;
    if not found then raise exception 'batch not found' using errcode = 'PT404'; end if;
    insert into public.product_recall_batches (recall_id, batch_id) values (v_id, v_batch);
    v_returned := v_returned + private.return_batch_reservations_to_pool(v_batch, 'recall ' || v_number);
    update public.product_batches set status = 'recalled', status_reason = v_reason, updated_by = (select auth.uid())
    where id = v_batch;
  end loop;
  return jsonb_build_object('id', v_id, 'recallNumber', v_number, 'reservationsReturned', v_returned);
end;
$$;

create function public.admin_resolve_exception(p_exception_id uuid, p_note text, p_request_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := private.require_reason(p_note, 'note');
begin
  perform private.begin_admin_action(array['super_admin', 'operations_admin']::public.app_role[], p_request_id, 'exception resolved');
  update public.operations_exceptions set status = 'resolved', resolved_at = now(), resolved_by = (select auth.uid()),
         resolution_note = v_note
  where id = p_exception_id and status = 'open';
  if not found then raise exception 'open exception not found' using errcode = 'PT404'; end if;
  return jsonb_build_object('id', p_exception_id);
end;
$$;

-- --------------------------------------------- availability core (ADR-0007)
create or replace function private.product_availability_core(
  p_business_date date,
  p_zone_id uuid default null,
  p_product_ids uuid[] default null
)
returns table (
  product_id uuid,
  base_unit text,
  eligible_on_hand numeric,
  open_confirmed_supply numeric,
  active_reservations numeric,
  atp numeric,
  contributing_supplier_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := public.current_business_date();
begin
  if p_business_date is null then
    raise exception 'p_business_date is required' using errcode = '22004';
  end if;
  -- p_zone_id: single pool at launch (zone validation in Phase 5).

  return query
  with received_against as (
    select l.supply_confirmation_id as supply_id, sum(rl.received_quantity) as received
    from public.goods_receipt_lines rl
    join public.goods_receipts r on r.id = rl.goods_receipt_id and r.status = 'posted'
    join public.purchase_order_lines l on l.id = rl.purchase_order_line_id
    where l.supply_confirmation_id is not null
    group by l.supply_confirmation_id
  ),
  supply as (
    -- Open supply: confirmed minus received against each record, floored per record.
    select c.product_id,
           sum(greatest(0, c.quantity - coalesce(ra.received, 0))) as open_qty,
           count(distinct c.supplier_id) filter (where c.quantity - coalesce(ra.received, 0) > 0)::integer as suppliers
    from public.supply_confirmations c
    join public.suppliers s on s.id = c.supplier_id
    left join received_against ra on ra.supply_id = c.id
    where c.business_date = p_business_date
      and c.business_date >= v_today
      and c.status = 'active'
      and c.quantity > 0
      and s.status = 'active'
    group by c.product_id
  ),
  on_hand as (
    select b.product_id, sum(m.quantity_delta) as qty
    from public.product_batches b
    join public.inventory_movements m on m.batch_id = b.id
    where b.status = 'active'
    group by b.product_id
  ),
  reserved as (
    select r.product_id, sum(r.quantity) as qty
    from public.inventory_reservations r
    left join public.product_batches b on b.id = r.batch_id
    where r.status = 'active'
      and ((r.batch_id is null and r.business_date = p_business_date) or (r.batch_id is not null and b.status = 'active'))
    group by r.product_id
  )
  select
    p.id,
    p.base_unit,
    case when p_business_date >= v_today then coalesce(oh.qty, 0) else 0 end::numeric,
    coalesce(su.open_qty, 0)::numeric,
    coalesce(rs.qty, 0)::numeric,
    greatest(0, case when p_business_date >= v_today then coalesce(oh.qty, 0) else 0 end
                + coalesce(su.open_qty, 0) - coalesce(rs.qty, 0))::numeric,
    coalesce(su.suppliers, 0)
  from public.products p
  left join supply su on su.product_id = p.id
  left join on_hand oh on oh.product_id = p.id
  left join reserved rs on rs.product_id = p.id
  where p.is_active
    and (p_product_ids is null or p.id = any (p_product_ids))
  order by p.display_order, p.name;
end;
$$;

-- Orphan detection now also covers receipt evidence (stored in supply-evidence under receipts/).
create or replace function public.storage_orphan_candidates(p_grace_seconds integer, p_limit integer default 500)
returns table (bucket_id text, object_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id, o.name, o.created_at
  from storage.objects o
  where o.bucket_id in ('farmer-photos', 'supply-evidence')
    and o.created_at < now() - make_interval(secs => greatest(p_grace_seconds, 3600))
    and not exists (select 1 from public.farmer_profiles fp where o.bucket_id = 'farmer-photos' and fp.photo_storage_key = o.name)
    and not exists (select 1 from public.supply_confirmations sc where o.bucket_id = 'supply-evidence' and sc.evidence_storage_key = o.name)
    and not exists (select 1 from public.goods_receipt_lines gl where o.bucket_id = 'supply-evidence' and gl.evidence_storage_key = o.name)
  order by o.created_at
  limit least(greatest(p_limit, 1), 1000);
$$;

-- ------------------------------------------------------------------ grants
revoke all on function private.next_document_number(text) from public, anon, authenticated;
revoke all on function private.parse_quantity(text, text, smallint, boolean) from public, anon;
grant execute on function private.parse_quantity(text, text, smallint, boolean) to authenticated, service_role;
revoke all on function private.po_line_posted(uuid) from public, anon, authenticated;
revoke all on function private.batch_balance(uuid) from public, anon, authenticated;
revoke all on function private.return_batch_reservations_to_pool(uuid, text) from public, anon, authenticated;
revoke all on function private.insert_po_lines(uuid, uuid, jsonb) from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_create_purchase_order(uuid, date, jsonb, text, text)',
    'public.admin_create_po_from_supply(uuid, date, date, text)',
    'public.admin_update_purchase_order(uuid, integer, date, jsonb, text, text)',
    'public.admin_set_purchase_order_status(uuid, integer, text, text, text)',
    'public.admin_create_goods_receipt(uuid, jsonb, timestamptz, text, text, text)',
    'public.admin_post_goods_receipt(uuid, integer, text)',
    'public.admin_cancel_goods_receipt(uuid, integer, text, text)',
    'public.admin_adjust_stock(uuid, public.inventory_movement_type, text, text, text)',
    'public.admin_set_batch_status(uuid, integer, public.batch_status, text, text)',
    'public.admin_create_recall(text, uuid[], text)',
    'public.admin_resolve_exception(uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
revoke execute on all functions in schema private from public, anon;
