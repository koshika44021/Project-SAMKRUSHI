-- =============================================================================
-- Phase 4 — procurement, receiving, batches, movement ledger, reservations,
-- recalls and operations exceptions (ADR-0012, ADR-0007).
-- Quantities are NUMERIC in the PRODUCT BASE UNIT (ADR-0006); money is BIGINT
-- paise. No sell-by/expiry and no fulfilment location (founder decisions
-- 2026-11-25). Writes go through RPCs in the next migration only.
-- =============================================================================

create type public.purchase_order_status as enum ('draft', 'sent', 'partially_received', 'received', 'cancelled');
create type public.goods_receipt_status as enum ('draft', 'posted', 'cancelled');
create type public.batch_status as enum ('active', 'on_hold', 'recalled', 'depleted');
create type public.inventory_movement_type as enum (
  'receipt', 'adjustment_increase', 'return_to_stock',
  'wastage', 'damage', 'sample', 'adjustment_decrease', 'sale'
);
create type public.reservation_status as enum ('active', 'consumed', 'released', 'expired');
create type public.operations_exception_type as enum ('supply_shortfall', 'reservations_returned_to_pool', 'over_receipt');
create type public.operations_exception_status as enum ('open', 'resolved');

-- Exact base-unit quantity: NUMERIC (unconstrained) with ≤ 3 decimals.
create domain public.base_quantity as numeric
  check (value >= 0 and value < 1000000000 and value = round(value, 3));

-- -----------------------------------------------------------------------------
-- Number generators (dev default formats; founder confirmation)
-- -----------------------------------------------------------------------------
create sequence private.po_number_seq as bigint minvalue 1 start 1;
create sequence private.grn_number_seq as bigint minvalue 1 start 1;
create sequence private.batch_number_seq as bigint minvalue 1 start 1;
create sequence private.recall_number_seq as bigint minvalue 1 start 1;
revoke all on sequence private.po_number_seq, private.grn_number_seq, private.batch_number_seq,
  private.recall_number_seq from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Purchase orders
-- -----------------------------------------------------------------------------
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique check (po_number ~ '^[A-Z0-9][A-Z0-9-]{2,29}$'),
  supplier_id uuid not null references public.suppliers (id),
  status public.purchase_order_status not null default 'draft',
  expected_date date not null,
  notes text check (notes is null or char_length(notes) <= 2000),
  sent_at timestamptz,
  closed_at timestamptz,
  close_reason text check (close_reason is null or char_length(close_reason) <= 500),
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 500),
  version integer not null default 1,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_orders_cancel_consistent check ((status = 'cancelled') = (cancelled_at is not null and cancel_reason is not null))
);
comment on table public.purchase_orders is 'Purchase orders. Creating or editing a PO never changes stock or availability (ADR-0012).';
create index purchase_orders_supplier_idx on public.purchase_orders (supplier_id, created_at desc);
create index purchase_orders_status_idx on public.purchase_orders (status, expected_date);

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id),
  line_number integer not null check (line_number >= 1),
  product_id uuid not null references public.products (id),
  ordered_quantity public.base_quantity not null check (ordered_quantity > 0),
  unit text not null references public.units (code),
  agreed_unit_cost_paise bigint check (agreed_unit_cost_paise is null or agreed_unit_cost_paise >= 0),
  supply_confirmation_id uuid references public.supply_confirmations (id),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  constraint purchase_order_lines_number_unique unique (purchase_order_id, line_number)
);
comment on column public.purchase_order_lines.agreed_unit_cost_paise is 'Agreed cost per BASE UNIT in paise (no standard rates; recorded per PO).';
create index purchase_order_lines_po_idx on public.purchase_order_lines (purchase_order_id);
create index purchase_order_lines_supply_idx on public.purchase_order_lines (supply_confirmation_id) where supply_confirmation_id is not null;

-- -----------------------------------------------------------------------------
-- Goods receipts (quality recorded per line; no enforced quality rules)
-- -----------------------------------------------------------------------------
create table public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique check (receipt_number ~ '^[A-Z0-9][A-Z0-9-]{2,29}$'),
  purchase_order_id uuid not null references public.purchase_orders (id),
  supplier_id uuid not null references public.suppliers (id),
  status public.goods_receipt_status not null default 'draft',
  received_at timestamptz not null default now(),
  received_by uuid not null references auth.users (id),
  notes text check (notes is null or char_length(notes) <= 2000),
  over_receipt_reason text check (over_receipt_reason is null or char_length(over_receipt_reason) <= 500),
  posted_at timestamptz,
  posted_by uuid references auth.users (id),
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 500),
  version integer not null default 1,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goods_receipts_posted_consistent check ((status = 'posted') = (posted_at is not null and posted_by is not null)),
  constraint goods_receipts_cancel_consistent check ((status = 'cancelled') = (cancelled_at is not null and cancel_reason is not null))
);
create index goods_receipts_po_idx on public.goods_receipts (purchase_order_id);
create index goods_receipts_status_idx on public.goods_receipts (status, received_at desc);

create table public.goods_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  goods_receipt_id uuid not null references public.goods_receipts (id),
  purchase_order_line_id uuid not null references public.purchase_order_lines (id),
  product_id uuid not null references public.products (id),
  received_quantity public.base_quantity not null check (received_quantity > 0),
  accepted_quantity public.base_quantity not null,
  rejected_quantity public.base_quantity not null default 0,
  damaged_quantity public.base_quantity not null default 0,
  quality_grade text check (quality_grade is null or char_length(quality_grade) <= 40),
  quality_notes text check (quality_notes is null or char_length(quality_notes) <= 1000),
  lot_code text check (lot_code is null or char_length(lot_code) <= 60),
  harvest_date date,
  evidence_storage_key text check (
    evidence_storage_key is null
    or (evidence_storage_key ~ '^[a-z0-9][a-z0-9/_.-]+$' and char_length(evidence_storage_key) between 3 and 300
        and evidence_storage_key !~ '\.\.')
  ),
  created_at timestamptz not null default now(),
  -- Quantities reconcile exactly (WEB_ADMIN §10).
  constraint goods_receipt_lines_reconcile check (received_quantity = accepted_quantity + rejected_quantity + damaged_quantity),
  constraint goods_receipt_lines_po_line_unique unique (goods_receipt_id, purchase_order_line_id)
);
comment on column public.goods_receipt_lines.harvest_date is 'Verifiable harvest/collection date. NOT an expiry date (master §4.4).';
create index goods_receipt_lines_receipt_idx on public.goods_receipt_lines (goods_receipt_id);
create index goods_receipt_lines_po_line_idx on public.goods_receipt_lines (purchase_order_line_id);

-- -----------------------------------------------------------------------------
-- Batches (accepted stock only) and the append-only movement ledger
-- -----------------------------------------------------------------------------
create table public.product_batches (
  id uuid primary key default gen_random_uuid(),
  batch_code text not null unique check (batch_code ~ '^[A-Z0-9][A-Z0-9-]{2,29}$'),
  product_id uuid not null references public.products (id),
  supplier_id uuid not null references public.suppliers (id),
  goods_receipt_line_id uuid not null unique references public.goods_receipt_lines (id),
  received_at timestamptz not null,
  harvest_date date,
  initial_quantity public.base_quantity not null check (initial_quantity > 0),
  unit_cost_paise bigint check (unit_cost_paise is null or unit_cost_paise >= 0),
  status public.batch_status not null default 'active',
  status_reason text check (status_reason is null or char_length(status_reason) <= 500),
  version integer not null default 1,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.product_batches is
  'Accepted physical stock. No sell-by/expiry (no policy); FIFO by received_at. On-hand = SUM(inventory_movements.quantity_delta).';
create index product_batches_fifo_idx on public.product_batches (product_id, status, received_at, id);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.product_batches (id),
  product_id uuid not null references public.products (id),
  movement_type public.inventory_movement_type not null,
  quantity_delta numeric not null check (quantity_delta <> 0 and abs(quantity_delta) < 1000000000 and quantity_delta = round(quantity_delta, 3)),
  reason text check (reason is null or char_length(reason) <= 500),
  reference_type text check (reference_type is null or reference_type ~ '^[a-z_]{1,40}$'),
  reference_id uuid,
  request_id text check (request_id is null or char_length(request_id) <= 128),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  -- Sign must match the movement type.
  constraint inventory_movements_sign check (
    (movement_type in ('receipt', 'adjustment_increase', 'return_to_stock') and quantity_delta > 0)
    or (movement_type in ('wastage', 'damage', 'sample', 'adjustment_decrease', 'sale') and quantity_delta < 0)
  )
);
comment on table public.inventory_movements is 'Append-only stock ledger. Every stock change is a movement; stock is never overwritten (master §4.5).';
create index inventory_movements_batch_idx on public.inventory_movements (batch_id, created_at);
create index inventory_movements_product_idx on public.inventory_movements (product_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Reservations (schema; created by checkout in Phase 6). Never movements.
-- batch_id NULL = supply-pool reservation for (product, business_date).
-- -----------------------------------------------------------------------------
create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  business_date date not null,
  zone_id uuid,
  batch_id uuid references public.product_batches (id),
  quantity public.base_quantity not null check (quantity > 0),
  status public.reservation_status not null default 'active',
  expires_at timestamptz,
  reference_type text check (reference_type is null or reference_type ~ '^[a-z_]{1,40}$'),
  reference_id uuid,
  status_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.inventory_reservations is
  'Commitment ledger (ADR-0007). Pool reservations (batch_id null) are re-pointed to batches on receipt posting.';
create index inventory_reservations_pool_idx on public.inventory_reservations (product_id, business_date, created_at)
  where status = 'active' and batch_id is null;
create index inventory_reservations_batch_idx on public.inventory_reservations (batch_id) where status = 'active';

-- -----------------------------------------------------------------------------
-- Recalls (master §13.10) and operations exceptions
-- -----------------------------------------------------------------------------
create table public.product_recalls (
  id uuid primary key default gen_random_uuid(),
  recall_number text not null unique,
  reason text not null check (char_length(btrim(reason)) >= 3 and char_length(reason) <= 1000),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.product_recall_batches (
  recall_id uuid not null references public.product_recalls (id),
  batch_id uuid not null references public.product_batches (id),
  primary key (recall_id, batch_id)
);

create table public.operations_exceptions (
  id uuid primary key default gen_random_uuid(),
  exception_type public.operations_exception_type not null,
  status public.operations_exception_status not null default 'open',
  product_id uuid references public.products (id),
  business_date date,
  batch_id uuid references public.product_batches (id),
  details jsonb not null default '{}'::jsonb,
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 1000),
  created_at timestamptz not null default now(),
  constraint operations_exceptions_resolved_consistent check (
    (status = 'resolved') = (resolved_at is not null and resolved_by is not null and resolution_note is not null)
  )
);
create index operations_exceptions_open_idx on public.operations_exceptions (status, created_at desc);

-- -----------------------------------------------------------------------------
-- Integrity triggers
-- -----------------------------------------------------------------------------
create trigger purchase_orders_bump_version before insert or update on public.purchase_orders
  for each row execute function private.bump_version();
create trigger goods_receipts_bump_version before insert or update on public.goods_receipts
  for each row execute function private.bump_version();
create trigger product_batches_bump_version before insert or update on public.product_batches
  for each row execute function private.bump_version();
create trigger inventory_reservations_set_updated_at before update on public.inventory_reservations
  for each row execute function private.set_updated_at();

create trigger purchase_orders_immutable before update on public.purchase_orders
  for each row execute function private.forbid_column_change('po_number', 'supplier_id', 'created_at', 'created_by');
create trigger goods_receipts_immutable before update on public.goods_receipts
  for each row execute function private.forbid_column_change('receipt_number', 'purchase_order_id', 'supplier_id', 'created_at', 'created_by');
create trigger product_batches_immutable before update on public.product_batches
  for each row execute function private.forbid_column_change('batch_code', 'product_id', 'supplier_id', 'goods_receipt_line_id', 'received_at', 'initial_quantity', 'created_at');

-- Lines of non-draft documents are frozen.
create function private.guard_document_lines()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  if tg_table_name = 'purchase_order_lines' then
    select status::text into v_status from public.purchase_orders
    where id = coalesce(new.purchase_order_id, old.purchase_order_id);
    -- supply link and cost may still be edited while draft only
  else
    select status::text into v_status from public.goods_receipts
    where id = coalesce(new.goods_receipt_id, old.goods_receipt_id);
  end if;
  if v_status is distinct from 'draft' then
    raise exception '% lines can only change while the document is draft', tg_table_name using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger purchase_order_lines_guard before insert or update or delete on public.purchase_order_lines
  for each row execute function private.guard_document_lines();
create trigger goods_receipt_lines_guard before insert or update or delete on public.goods_receipt_lines
  for each row execute function private.guard_document_lines();

-- Append-only / no-delete guards (owner included; TRUNCATE blocked).
create trigger inventory_movements_append_only before update or delete on public.inventory_movements
  for each row execute function private.audit_logs_append_only();
create trigger inventory_movements_no_truncate before truncate on public.inventory_movements
  for each statement execute function private.forbid_truncate();
create trigger product_recall_batches_append_only before update or delete on public.product_recall_batches
  for each row execute function private.audit_logs_append_only();
create trigger product_recalls_append_only before update or delete on public.product_recalls
  for each row execute function private.audit_logs_append_only();
create trigger purchase_orders_no_delete before delete on public.purchase_orders
  for each row execute function private.forbid_delete();
create trigger goods_receipts_no_delete before delete on public.goods_receipts
  for each row execute function private.forbid_delete();
create trigger product_batches_no_delete before delete on public.product_batches
  for each row execute function private.forbid_delete();
create trigger inventory_reservations_no_delete before delete on public.inventory_reservations
  for each row execute function private.forbid_delete();
create trigger operations_exceptions_no_delete before delete on public.operations_exceptions
  for each row execute function private.forbid_delete();
do $$
declare t text;
begin
  foreach t in array array['purchase_orders', 'purchase_order_lines', 'goods_receipts', 'goods_receipt_lines',
                           'product_batches', 'inventory_reservations', 'product_recalls', 'product_recall_batches',
                           'operations_exceptions'] loop
    execute format('create trigger %I before truncate on public.%I for each statement execute function private.forbid_truncate()',
                   t || '_no_truncate', t);
  end loop;
end;
$$;

-- Audit (movements are their own ledger; reservations are audited too).
do $$
declare t text;
begin
  foreach t in array array['purchase_orders', 'purchase_order_lines', 'goods_receipts', 'goods_receipt_lines',
                           'product_batches', 'inventory_reservations', 'product_recalls', 'product_recall_batches',
                           'operations_exceptions'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row_change(%L)',
                   t || '_audit', t, case when t = 'product_recall_batches' then 'recall_id' else 'id' end);
  end loop;
end;
$$;
create trigger goods_receipt_lines_audit_redact after insert or update on public.goods_receipt_lines
  for each row execute function private.audit_row_change('id', 'evidence_storage_key');
drop trigger goods_receipt_lines_audit on public.goods_receipt_lines;
alter trigger goods_receipt_lines_audit_redact on public.goods_receipt_lines rename to goods_receipt_lines_audit;

-- -----------------------------------------------------------------------------
-- RLS: super_admin + operations_admin full read; finance_admin read (costs);
-- nobody else. No client writes (ADR-0011).
-- -----------------------------------------------------------------------------
create function private.can_read_inventory()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_role(array['super_admin', 'operations_admin', 'finance_admin']::public.app_role[]);
$$;
revoke all on function private.can_read_inventory() from public, anon;
grant execute on function private.can_read_inventory() to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array['purchase_orders', 'purchase_order_lines', 'goods_receipts', 'product_batches',
                           'inventory_movements', 'inventory_reservations', 'product_recalls', 'product_recall_batches',
                           'operations_exceptions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.can_read_inventory()))',
                   t || '_select', t);
  end loop;
end;
$$;

-- Receipt lines: column grant hides the private evidence key.
alter table public.goods_receipt_lines enable row level security;
revoke all on public.goods_receipt_lines from anon, authenticated;
grant select (id, goods_receipt_id, purchase_order_line_id, product_id, received_quantity, accepted_quantity,
              rejected_quantity, damaged_quantity, quality_grade, quality_notes, lot_code, harvest_date, created_at)
  on public.goods_receipt_lines to authenticated;
create policy goods_receipt_lines_select on public.goods_receipt_lines
  for select to authenticated using ((select private.can_read_inventory()));

revoke truncate on all tables in schema public from anon, authenticated, service_role;
revoke execute on all functions in schema private from public, anon;
