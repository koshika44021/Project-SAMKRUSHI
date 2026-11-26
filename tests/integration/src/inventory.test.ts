import {
  addBusinessDays,
  apiSuccessSchema,
  catalogResponseDataSchema,
  toBusinessDate,
} from '@samkrushi/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { functionUrl, uniqueMobile, userClient } from './setup.ts';

// Phase 4 end to end through PostgREST with real staff JWTs (ADR-0012):
// PO from supply → receipt (with rejection) → posted batch → availability,
// then hold, release and recall. SEED-VEG-02 is used ONLY by inventory tests;
// assertions are relative so stock from earlier runs never matters, and the
// batch is recalled at the end so it never stays available.
const businessDate = addBusinessDays(
  toBusinessDate(new Date()),
  700 + Math.floor(Math.random() * 300),
);
const SEED_VEG_B = '5eed0000-0000-4000-8000-0000000000a3';

let ops: SupabaseClient;
let finance: SupabaseClient;
let viewer: SupabaseClient;
let supplierId = '';
let baseline = 0;
let poId = '';
let receiptId = '';
let batchId = '';

async function atp(): Promise<number> {
  const { data, error } = await ops
    .rpc('product_availability', { p_business_date: businessDate })
    .eq('product_id', SEED_VEG_B)
    .single();
  if (error) throw error;
  // NUMERIC arrives as a JSON number from this table function; exact for test sizes.
  return Number((data as { atp: number | string }).atp);
}

async function version(
  table: 'purchase_orders' | 'goods_receipts' | 'product_batches',
  id: string,
) {
  const { data, error } = await ops.from(table).select('version').eq('id', id).single();
  if (error) throw error;
  return (data as { version: number }).version;
}

beforeAll(async () => {
  ops = (await userClient('inventory-ops', ['operations_admin'])).client;
  finance = (await userClient('inventory-finance', ['finance_admin'])).client;
  viewer = (await userClient('inventory-viewer', ['viewer'])).client;
  const farmer = await ops.rpc('admin_create_farmer', {
    p_name: 'IT Inventory Farmer',
    p_address_line: 'IT address',
    p_village_locality: 'IT Village',
    p_mandal: 'IT Mandal',
    p_district: 'IT District',
    p_state: 'IT State',
    p_pin_code: '500001',
    p_primary_phone: `+91${uniqueMobile()}`,
  });
  expect(farmer.error).toBeNull();
  supplierId = (farmer.data as { id: string }).id;
  baseline = await atp();
});

describe('procurement → receiving → inventory', () => {
  it('farmer-confirmed supply counts once, and a PO changes nothing', async () => {
    const supply = await ops.rpc('admin_create_supply', {
      p_supplier_id: supplierId,
      p_product_id: SEED_VEG_B,
      p_business_date: businessDate,
      p_quantity: '10' as unknown as number,
      p_confirmation_source: 'phone_call',
    });
    expect(supply.error).toBeNull();
    expect(await atp()).toBe(baseline + 10);

    const po = await ops.rpc('admin_create_po_from_supply', {
      p_supplier_id: supplierId,
      p_business_date: businessDate,
    });
    expect(po.error).toBeNull();
    poId = (po.data as { id: string }).id;
    const sent = await ops.rpc('admin_set_purchase_order_status', {
      p_po_id: poId,
      p_expected_version: 1,
      p_action: 'send',
    });
    expect(sent.error).toBeNull();
    expect(await atp()).toBe(baseline + 10);
  });

  it('viewer and finance cannot write; finance can read', async () => {
    const denied = await viewer.rpc('admin_create_po_from_supply', {
      p_supplier_id: supplierId,
      p_business_date: businessDate,
    });
    expect(denied.error?.code).toBe('PT403');
    const viewerRead = await viewer.rpc('admin_get_purchase_order', { p_po_id: poId });
    expect(viewerRead.error?.code).toBe('PT403');

    const financeRead = await finance.rpc('admin_get_purchase_order', { p_po_id: poId });
    expect(financeRead.error).toBeNull();
    expect((financeRead.data as { status: string }).status).toBe('sent');
    const financeWrite = await finance.rpc('admin_set_purchase_order_status', {
      p_po_id: poId,
      p_expected_version: 2,
      p_action: 'cancel',
      p_reason: 'IT finance attempt',
    });
    expect(financeWrite.error?.code).toBe('PT403');
  });

  it('posting a receipt converts supply to stock exactly once (rejected never counts)', async () => {
    const { data: lines } = await ops
      .from('purchase_order_lines')
      .select('id')
      .eq('purchase_order_id', poId);
    const receipt = await ops.rpc('admin_create_goods_receipt', {
      p_po_id: poId,
      p_lines: [
        {
          poLineId: (lines as { id: string }[])[0]?.id,
          received: '10',
          accepted: '8',
          rejected: '2',
          qualityNotes: 'IT two crates rejected',
        },
      ],
    });
    expect(receipt.error).toBeNull();
    receiptId = (receipt.data as { id: string }).id;
    expect(await atp()).toBe(baseline + 10); // draft: no change

    const posted = await ops.rpc('admin_post_goods_receipt', {
      p_receipt_id: receiptId,
      p_expected_version: await version('goods_receipts', receiptId),
    });
    expect(posted.error).toBeNull();
    expect((posted.data as { batches: number }).batches).toBe(1);
    // 10 open supply → 0 open + 8 on hand.
    expect(await atp()).toBe(baseline + 8);

    const po = await ops.rpc('admin_get_purchase_order', { p_po_id: poId });
    expect((po.data as { status: string }).status).toBe('received');

    const { data: batch } = await ops
      .from('product_batches')
      .select('id, initial_quantity, status')
      .eq('product_id', SEED_VEG_B)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    batchId = (batch as { id: string }).id;
    expect(Number((batch as { initial_quantity: number }).initial_quantity)).toBe(8);
  });

  it('the customer catalog lists the product while stock is available', async () => {
    const response = await fetch(functionUrl('get-catalog', { businessDate }));
    const body = apiSuccessSchema(catalogResponseDataSchema).parse(await response.json());
    expect(body.data.products.some((p) => p.productId === SEED_VEG_B)).toBe(true);
  });

  it('stock movements are ledgered and cannot remove more than is on hand', async () => {
    const tooMuch = await ops.rpc('admin_adjust_stock', {
      p_batch_id: batchId,
      p_movement_type: 'wastage',
      p_quantity: '9',
      p_reason: 'IT too much',
    });
    expect(tooMuch.error?.code).toBe('PT409');
    const wasted = await ops.rpc('admin_adjust_stock', {
      p_batch_id: batchId,
      p_movement_type: 'wastage',
      p_quantity: '0.5',
      p_reason: 'IT spoiled',
    });
    expect(wasted.error).toBeNull();
    expect((wasted.data as { onHand: string }).onHand).toBe('7.5');
    expect(await atp()).toBe(baseline + 7.5);
    const directWrite = await ops.from('inventory_movements').insert({
      batch_id: batchId,
      product_id: SEED_VEG_B,
      movement_type: 'receipt',
      quantity_delta: 100,
    });
    expect(directWrite.error?.code).toBe('42501');
  });

  it('hold removes stock from availability at once; release restores it', async () => {
    const hold = await ops.rpc('admin_set_batch_status', {
      p_batch_id: batchId,
      p_expected_version: await version('product_batches', batchId),
      p_status: 'on_hold',
      p_reason: 'IT quality check',
    });
    expect(hold.error).toBeNull();
    expect(await atp()).toBe(baseline);

    const release = await ops.rpc('admin_set_batch_status', {
      p_batch_id: batchId,
      p_expected_version: await version('product_batches', batchId),
      p_status: 'active',
      p_reason: 'IT passed',
    });
    expect(release.error).toBeNull();
    expect(await atp()).toBe(baseline + 7.5);
  });

  it('a recall is permanent and traceable', async () => {
    const recall = await ops.rpc('admin_create_recall', {
      p_reason: 'IT contamination report',
      p_batch_ids: [batchId],
    });
    expect(recall.error).toBeNull();
    expect((recall.data as { recallNumber: string }).recallNumber).toMatch(/^SAM-RC-\d{6}$/);
    expect(await atp()).toBe(baseline);

    const detail = await finance.rpc('admin_get_batch', { p_batch_id: batchId });
    expect(detail.error).toBeNull();
    const b = detail.data as { status: string; available: string; recalls: unknown[] };
    expect(b.status).toBe('recalled');
    expect(b.available).toBe('0');
    expect(b.recalls).toHaveLength(1);
  });
});
