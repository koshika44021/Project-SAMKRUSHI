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
  failure,
  rpcFailure,
  validationFailure,
} from '@/lib/server/actions';
import { processPrivateImage, randomObjectKey } from '@/lib/server/images';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Farmer-confirmed supply mutations. Quantities stay decimal strings until the
 * RPC call; PostgREST passes them to NUMERIC exactly (no float arithmetic here).
 */
const EVIDENCE_BUCKET = 'supply-evidence';

/**
 * Records farmer-confirmed supply. Accepts FormData with a JSON `payload` and
 * an optional `evidence` image (processed like farmer photos, master §13.9).
 */
export async function createSupply(formData: FormData): Promise<ActionResult<{ id: string }>> {
  await requireCapability('manageSupply');
  let input: unknown = {};
  const raw = formData.get('payload');
  if (typeof raw === 'string') {
    try {
      input = JSON.parse(raw) as unknown;
    } catch {
      input = {};
    }
  }
  const parsed = supplyCreateSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const v = parsed.data;

  // Optional evidence: validate and upload BEFORE the record so a bad file
  // never leaves a half-done entry; removed again if the RPC fails.
  const file = formData.get('evidence');
  let evidenceKey: string | undefined;
  const admin = createSupabaseAdminClient();
  if (file instanceof File && file.size > 0) {
    const processed = await processPrivateImage(file);
    if (!processed.ok) {
      return failure('VALIDATION_ERROR', processed.message, {
        fieldErrors: [{ field: 'evidence', message: processed.message }],
      });
    }
    evidenceKey = randomObjectKey('supply');
    const { error: uploadError } = await admin.storage
      .from(EVIDENCE_BUCKET)
      .upload(evidenceKey, processed.webp, { contentType: 'image/webp', upsert: false });
    if (uploadError) {
      return failure('SERVICE_UNAVAILABLE', 'The evidence could not be stored. Please try again.');
    }
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_create_supply', {
    ...(evidenceKey ? { p_evidence_storage_key: evidenceKey } : {}),
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
  if (error) {
    if (evidenceKey) await admin.storage.from(EVIDENCE_BUCKET).remove([evidenceKey]);
    return rpcFailure(error);
  }
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
