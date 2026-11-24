import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { anon, uniqueMobile, userClient } from './setup.ts';

// Real JWTs through PostgREST: confirms RLS + RPC role checks + error mapping
// (PT403/PT409/PT422 → HTTP status) exactly as admin-web experiences them.

const farmerArgs = (name: string, phone: string) => ({
  p_name: name,
  p_address_line: 'IT address',
  p_village_locality: 'IT Village',
  p_mandal: 'IT Mandal',
  p_district: 'IT District',
  p_state: 'IT State',
  p_pin_code: '500001',
  p_primary_phone: `+91${phone}`,
});

let ops: SupabaseClient;
let viewer: SupabaseClient;
let customer: SupabaseClient;
let inactive: SupabaseClient;

beforeAll(async () => {
  ops = (await userClient('ops', ['operations_admin'])).client;
  viewer = (await userClient('viewer', ['viewer'])).client;
  customer = (await userClient('customer', ['customer'], { staff: false })).client;
  inactive = (await userClient('inactive', ['operations_admin'], { active: false })).client;
});

describe('PostgREST access with real sessions', () => {
  it('anon cannot read business tables', async () => {
    const { error } = await anon().from('suppliers').select('id').limit(1);
    expect(error?.code).toBe('42501');
  });

  it('customers see no catalog or supply rows and cannot call availability', async () => {
    const { data } = await customer.from('products').select('id');
    expect(data).toEqual([]);
    const { error } = await customer.rpc('product_availability', { p_business_date: '2026-11-25' });
    expect(error?.code).toBe('42501');
  });

  it('no client can write tables directly', async () => {
    const { error } = await ops
      .from('suppliers')
      .insert({ supplier_code: 'IT-X-1', name: 'X', supplier_type: 'farmer' });
    expect(error?.code).toBe('42501');
    const { error: roleError } = await customer
      .from('user_roles')
      .insert({ user_id: '00000000-0000-4000-8000-000000000000', role: 'super_admin' });
    expect(roleError?.code).toBe('42501');
  });

  it('inactive staff are refused by every RPC', async () => {
    const { data } = await inactive.rpc('my_access').single();
    expect((data as { is_active_staff: boolean } | null)?.is_active_staff).toBe(false);
    const { error } = await inactive.rpc('admin_list_farmers', {});
    expect(error?.code).toBe('PT403');
  });

  it('viewer cannot mutate (HTTP 403 via PT403)', async () => {
    const { error, status } = await viewer.rpc(
      'admin_create_farmer',
      farmerArgs('IT Viewer Farmer', uniqueMobile()),
    );
    expect(error?.code).toBe('PT403');
    expect(status).toBe(403);
  });

  it('operations can register a farmer; duplicate phone returns 409 with matches', async () => {
    const phone = uniqueMobile();
    const first = await ops.rpc('admin_create_farmer', farmerArgs('IT Farmer A', phone));
    expect(first.error).toBeNull();
    expect((first.data as { supplierCode: string }).supplierCode).toMatch(/^SAM-FRM-\d{6}$/);

    const dup = await ops.rpc('admin_create_farmer', farmerArgs('IT Farmer B', phone));
    expect(dup.status).toBe(409);
    expect(dup.error?.message).toBe('duplicate_phone');
    expect(JSON.parse(dup.error?.details ?? '[]')).toHaveLength(1);
  });

  it('validation failures return 422 with the field name', async () => {
    const created = await ops.rpc('admin_create_farmer', farmerArgs('IT Farmer C', uniqueMobile()));
    const id = (created.data as { id: string }).id;
    const { error, status } = await ops.rpc('admin_set_farmer_status', {
      p_supplier_id: id,
      p_expected_version: 1,
      p_status: 'inactive',
      p_reason: '',
    });
    expect(status).toBe(422);
    expect(error?.details).toBe('reason');
  });
});
