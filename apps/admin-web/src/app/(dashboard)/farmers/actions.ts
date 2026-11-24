'use server';

import {
  FARMER_FIELD_RULES,
  farmerCreateSchema,
  farmerStatusChangeSchema,
  farmerUpdateSchema,
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

const PHOTO_BUCKET = 'farmer-photos';

function readPayload(formData: FormData): unknown {
  const raw = formData.get('payload');
  if (typeof raw !== 'string') return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}

function readFile(formData: FormData, name: string): File | null {
  const value = formData.get(name);
  return value instanceof File && value.size > 0 ? value : null;
}

/**
 * Uploads a processed photo and points the farmer at it via the audited RPC
 * (with the staff member's JWT). The replaced object is deleted afterwards;
 * if the RPC fails the new object is removed so nothing is orphaned.
 */
async function attachPhoto(supplierId: string, file: File): Promise<ActionResult<never> | null> {
  const processed = await processPrivateImage(file);
  if (!processed.ok) {
    return failure('VALIDATION_ERROR', processed.message, {
      fieldErrors: [{ field: 'photo', message: processed.message }],
    });
  }
  const admin = createSupabaseAdminClient();
  const key = randomObjectKey(`farmers/${supplierId}`);
  const { error: uploadError } = await admin.storage
    .from(PHOTO_BUCKET)
    .upload(key, processed.webp, { contentType: 'image/webp', upsert: false });
  if (uploadError) {
    return failure('SERVICE_UNAVAILABLE', 'The photo could not be stored. Please try again.');
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_set_farmer_photo', {
    p_supplier_id: supplierId,
    p_storage_key: key,
    p_request_id: await currentRequestId(),
  });
  if (error) {
    await admin.storage.from(PHOTO_BUCKET).remove([key]);
    return rpcFailure(error, 'photo');
  }
  const previous = (data as { previousKey?: string | null } | null)?.previousKey;
  if (previous) await admin.storage.from(PHOTO_BUCKET).remove([previous]);
  return null;
}

export async function createFarmer(
  formData: FormData,
): Promise<ActionResult<{ id: string; supplierCode: string }>> {
  await requireCapability('manageFarmers');
  const parsed = farmerCreateSchema.safeParse(readPayload(formData));
  if (!parsed.success) return validationFailure(parsed.error);
  const photo = readFile(formData, 'photo');
  if (FARMER_FIELD_RULES.photoRequired && !photo) {
    return failure('VALIDATION_ERROR', 'Please correct the highlighted fields.', {
      fieldErrors: [{ field: 'photo', message: 'Farmer photo is required' }],
    });
  }
  if (photo) {
    // Validate before creating the farmer so a bad file never leaves a half-done record.
    const check = await processPrivateImage(photo);
    if (!check.ok) {
      return failure('VALIDATION_ERROR', check.message, {
        fieldErrors: [{ field: 'photo', message: check.message }],
      });
    }
  }

  const v = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_create_farmer', {
    p_name: v.name,
    p_address_line: v.addressLine,
    p_village_locality: v.villageLocality,
    p_mandal: v.mandal,
    p_district: v.district,
    p_state: v.state,
    p_pin_code: v.pinCode,
    p_primary_phone: v.primaryPhone,
    p_secondary_phone: v.secondaryPhone ?? undefined,
    p_land_area_value: v.landAreaValue ? Number(v.landAreaValue) : undefined,
    p_land_area_unit: v.landAreaUnit ?? undefined,
    p_notes: v.notes ?? undefined,
    p_status: v.status,
    p_duplicate_phone_reason: v.duplicatePhoneReason ?? undefined,
    p_request_id: await currentRequestId(),
  });
  if (error) return rpcFailure(error);
  const created = data as { id: string; supplierCode: string };

  if (photo) {
    const photoError = await attachPhoto(created.id, photo);
    if (photoError) {
      revalidatePath('/farmers');
      return failure(
        photoError.ok ? 'INTERNAL_ERROR' : photoError.error.code,
        `Farmer ${created.supplierCode} was saved, but the photo was not: ${photoError.ok ? '' : photoError.error.message} Add it from the farmer page.`,
        {
          details: { createdId: created.id },
        },
      );
    }
  }
  revalidatePath('/farmers');
  return { ok: true, data: created, message: `Farmer ${created.supplierCode} registered.` };
}

export async function updateFarmer(
  formData: FormData,
): Promise<ActionResult<{ id: string; version: number }>> {
  await requireCapability('manageFarmers');
  const parsed = farmerUpdateSchema.safeParse(readPayload(formData));
  if (!parsed.success) return validationFailure(parsed.error);
  const v = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_update_farmer', {
    p_supplier_id: v.id,
    p_expected_version: v.expectedVersion,
    p_name: v.name,
    p_address_line: v.addressLine,
    p_village_locality: v.villageLocality,
    p_mandal: v.mandal,
    p_district: v.district,
    p_state: v.state,
    p_pin_code: v.pinCode,
    p_primary_phone: v.primaryPhone,
    p_secondary_phone: v.secondaryPhone ?? undefined,
    p_land_area_value: v.landAreaValue ? Number(v.landAreaValue) : undefined,
    p_land_area_unit: v.landAreaUnit ?? undefined,
    p_notes: v.notes ?? undefined,
    p_reason: v.reason,
    p_duplicate_phone_reason: v.duplicatePhoneReason ?? undefined,
    p_request_id: await currentRequestId(),
  });
  if (error) return rpcFailure(error);
  revalidatePath(`/farmers/${v.id}`);
  revalidatePath('/farmers');
  return { ok: true, data: data as { id: string; version: number }, message: 'Farmer updated.' };
}

export async function changeFarmerStatus(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  await requireCapability('manageFarmers');
  const parsed = farmerStatusChangeSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_set_farmer_status', {
    p_supplier_id: parsed.data.id,
    p_expected_version: parsed.data.expectedVersion,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason,
    p_request_id: await currentRequestId(),
  });
  if (error) return rpcFailure(error);
  revalidatePath(`/farmers/${parsed.data.id}`);
  revalidatePath('/farmers');
  return { ok: true, data: data as { version: number }, message: 'Farmer status updated.' };
}

export async function replaceFarmerPhoto(
  formData: FormData,
): Promise<ActionResult<never> | { ok: true; data: undefined }> {
  await requireCapability('manageFarmers');
  const supplierId = formData.get('supplierId');
  const photo = readFile(formData, 'photo');
  if (typeof supplierId !== 'string' || !/^[0-9a-f-]{36}$/.test(supplierId)) {
    return failure('VALIDATION_ERROR', 'Unknown farmer.');
  }
  if (!photo) {
    return failure('VALIDATION_ERROR', 'Choose a photo to upload.', {
      fieldErrors: [{ field: 'photo', message: 'Choose a photo' }],
    });
  }
  const result = await attachPhoto(supplierId, photo);
  if (result) return result;
  revalidatePath(`/farmers/${supplierId}`);
  return { ok: true, data: undefined };
}

/** Pre-submit duplicate-phone warning (never merges records). */
export async function checkDuplicatePhones(
  phones: string[],
  excludeSupplierId?: string,
): Promise<{ supplierCode: string; name: string; phone: string }[]> {
  await requireCapability('manageFarmers');
  const valid = phones.filter((p) => /^\+[1-9]\d{7,14}$/.test(p));
  if (!valid.length) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc('admin_check_duplicate_phones', {
    p_phones: valid,
    ...(excludeSupplierId ? { p_exclude_supplier: excludeSupplierId } : {}),
  });
  return Array.isArray(data)
    ? (data as { supplierCode: string; name: string; phone: string }[])
    : [];
}
