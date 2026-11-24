import {
  addBusinessDays,
  apiErrorSchema,
  apiSuccessSchema,
  catalogResponseDataSchema,
  catalogProductSchema,
  toBusinessDate,
} from '@samkrushi/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { functionUrl, uniqueMobile, userClient } from './setup.ts';

// get-catalog / get-product-detail Edge Functions (master §7, ADR-0003).
// A random future business date isolates this run from earlier data.
const businessDate = addBusinessDays(
  toBusinessDate(new Date()),
  400 + Math.floor(Math.random() * 300),
);
const SEED_VEG_A = '5eed0000-0000-4000-8000-0000000000a2'; // kg, SKUs 500 g (max 10) and 1 kg (max 10), threshold 5
const SEED_HIDDEN = '5eed0000-0000-4000-8000-0000000000a5'; // not listable

const catalogEnvelope = apiSuccessSchema(catalogResponseDataSchema);
const detailEnvelope = apiSuccessSchema(
  z.object({ businessDate: z.string(), product: catalogProductSchema }),
);

async function getJson(
  name: string,
  params: Record<string, string>,
  headers: Record<string, string> = {},
) {
  const response = await fetch(functionUrl(name, params), { headers });
  return { response, body: (await response.json()) as unknown };
}

let ops: SupabaseClient;

beforeAll(async () => {
  ops = (await userClient('catalog-ops', ['operations_admin'])).client;
});

describe('get-catalog', () => {
  it('requires a valid business date', async () => {
    const { response, body } = await getJson('get-catalog', { businessDate: '2026-02-30' });
    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(body).error.code).toBe('VALIDATION_ERROR');
  });

  it('lists nothing for a date without supply, unless unavailable items are requested', async () => {
    const none = catalogEnvelope.parse((await getJson('get-catalog', { businessDate })).body);
    expect(none.data.products.find((p) => p.productId === SEED_VEG_A)).toBeUndefined();

    const all = catalogEnvelope.parse(
      (await getJson('get-catalog', { businessDate, includeUnavailable: 'true' })).body,
    );
    const veg = all.data.products.find((p) => p.productId === SEED_VEG_A);
    expect(veg?.availabilityStatus).toBe('unavailable');
    expect(veg?.skus.every((s) => s.maxOrderable === 0)).toBe(true);
    expect(all.data.products.find((p) => p.productId === SEED_HIDDEN)).toBeUndefined();
  });

  it('reflects farmer-confirmed supply through the shared availability function', async () => {
    const farmer = await ops.rpc('admin_create_farmer', {
      p_name: 'IT Catalog Farmer',
      p_address_line: 'IT address',
      p_village_locality: 'IT Village',
      p_mandal: 'IT Mandal',
      p_district: 'IT District',
      p_state: 'IT State',
      p_pin_code: '500001',
      p_primary_phone: `+91${uniqueMobile()}`,
    });
    expect(farmer.error).toBeNull();
    const supply = await ops.rpc('admin_create_supply', {
      p_supplier_id: (farmer.data as { id: string }).id,
      p_product_id: SEED_VEG_A,
      p_business_date: businessDate,
      p_quantity: '3.5' as unknown as number,
      p_confirmation_source: 'phone_call',
    });
    expect(supply.error).toBeNull();

    const { response, body } = await getJson(
      'get-catalog',
      { businessDate },
      { 'x-request-id': 'it-req-1' },
    );
    expect(response.headers.get('x-request-id')).toBe('it-req-1');
    const parsed = catalogEnvelope.parse(body);
    expect(parsed.meta.requestId).toBe('it-req-1');
    const veg = parsed.data.products.find((p) => p.productId === SEED_VEG_A);
    // 3.5 kg ≤ threshold 5 → limited; 500 g pack: floor(3.5/0.5)=7; 1 kg: 3.
    expect(veg?.availabilityStatus).toBe('limited');
    expect(veg?.skus.map((s) => [s.skuCode, s.maxOrderable])).toEqual([
      ['SEED-VEG-01-500G', 7],
      ['SEED-VEG-01-1KG', 3],
    ]);
    const text = JSON.stringify(body);
    expect(text).not.toContain('3.5');
    expect(text).not.toMatch(/atp|confirmed_supply|farmer/i);
  });

  it('never enables credentialed CORS (token-based API; no cookies)', async () => {
    // Note: the LOCAL API gateway (kong) adds `Access-Control-Allow-Origin: *`
    // to every function response; the function's own allow-list
    // (ALLOWED_ORIGINS) applies where the gateway does not. A wildcard without
    // credentials cannot leak a session.
    const { response } = await getJson(
      'get-catalog',
      { businessDate },
      { origin: 'https://evil.example' },
    );
    expect(response.headers.get('access-control-allow-credentials')).not.toBe('true');
    expect(response.headers.get('access-control-allow-origin')).not.toBe('https://evil.example');
  });
});

describe('get-product-detail', () => {
  it('returns one product by id or slug, and 404 for hidden or unknown products', async () => {
    const byId = detailEnvelope.parse(
      (await getJson('get-product-detail', { businessDate, productId: SEED_VEG_A })).body,
    );
    const bySlug = detailEnvelope.parse(
      (await getJson('get-product-detail', { businessDate, slug: byId.data.product.slug })).body,
    );
    expect(bySlug.data.product.productId).toBe(SEED_VEG_A);

    const hidden = await getJson('get-product-detail', { businessDate, productId: SEED_HIDDEN });
    expect(hidden.response.status).toBe(404);
    const bad = await getJson('get-product-detail', { businessDate });
    expect(bad.response.status).toBe(400);
  });
});
