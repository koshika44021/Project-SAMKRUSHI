'use server';

import {
  supplyCreateSchema,
  supplyStatusChangeSchema,
  supplyUpdateSchema,
} from '@samkrushi/shared';
import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth/session';
import {
  type ActionResult,
  currentRequestId,
  rpcFailure,
  validationFailure,
} from '@/lib/server/actions';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Farmer-confirmed supply mutations. Quantities stay decimal strings until the
 * RPC call; PostgREST passes them to NUMERIC exactly (no float arithmetic here).
 */
export async function createSupply(input: unknown): Promise<ActionResult<{ id: string }>> {
  await requireCapability('manageSupply');
  const parsed = supplyCreateSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const v = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_create_supply', {
    p_supplier_id: v.supplierId,
    p_product_id: v.productId,
    p_business_date: v.businessDate,
    // NUMERIC accepts a JSON string verbatim, keeping exact decimal precision.
    p_quantity: v.quantity as unknown as number,
    p_confirmation_source: v.confirmationSource,
    ...(v.entryUnit ? { p_entry_unit: v.entryUnit } : {}),
    ...(v.confirmedAt ? { p_confirmed_at: v.confirmedAt } : {}),
    ...(v.note ? { p_note: v.note } : {}),
    p_request_id: await currentRequestId(),
  });
  if (error) return rpcFailure(error);
  revalidatePath('/availability');
  return { ok: true, data: data as { id: string }, message: 'Supply recorded.' };
}

export async function updateSupply(input: unknown): Promise<ActionResult<{ version: number }>> {
  await requireCapability('manageSupply');
  const parsed = supplyUpdateSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const v = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_update_supply', {
    p_supply_id: v.id,
    p_expected_version: v.expectedVersion,
    p_quantity: v.quantity as unknown as number,
    p_reason: v.reason,
    ...(v.note ? { p_note: v.note } : {}),
    p_request_id: await currentRequestId(),
  });
  if (error) return rpcFailure(error, 'quantity');
  revalidatePath('/availability');
  return { ok: true, data: data as { version: number }, message: 'Supply updated.' };
}

export async function changeSupplyStatus(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  await requireCapability('manageSupply');
  const parsed = supplyStatusChangeSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const v = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_set_supply_status', {
    p_supply_id: v.id,
    p_expected_version: v.expectedVersion,
    p_status: v.status,
    p_reason: v.reason,
    p_request_id: await currentRequestId(),
  });
  if (error) return rpcFailure(error);
  revalidatePath('/availability');
  return { ok: true, data: data as { version: number }, message: 'Supply status updated.' };
}
