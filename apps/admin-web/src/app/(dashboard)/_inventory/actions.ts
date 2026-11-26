'use server';

import {
  batchStatusChangeSchema,
  exceptionResolveSchema,
  goodsReceiptCancelSchema,
  goodsReceiptCreateSchema,
  goodsReceiptPostSchema,
  purchaseOrderCreateSchema,
  purchaseOrderFromSupplySchema,
  purchaseOrderStatusActionSchema,
  recallCreateSchema,
  stockAdjustmentSchema,
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
 * Procurement / receiving / inventory mutations (ADR-0012). Every action
 * re-validates with the shared contracts and calls one SECURITY DEFINER RPC,
 * which re-checks roles, versions, precision and stock rules. Quantities stay
 * decimal strings end to end.
 */
const EVIDENCE_BUCKET = 'supply-evidence';

function refreshInventoryPages() {
  for (const path of ['/procurement', '/receiving', '/inventory', '/exceptions', '/overview'])
    revalidatePath(path, 'layout');
}

export async function createPurchaseOrder(
  input: unknown,
): Promise<ActionResult<{ id: string; poNumber: string }>> {
  await requireCapability('manageInventory');
  const parsed = purchaseOrderCreateSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const v = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_create_purchase_order', {
    p_supplier_id: v.supplierId,
    p_expected_date: v.expectedDate,
    p_lines: v.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      ...(line.unitCostPaise !== null && line.unitCostPaise !== undefined
        ? { unitCostPaise: line.unitCostPaise }
        : {}),
      ...(line.supplyConfirmationId ? { supplyConfirmationId: line.supplyConfirmationId } : {}),
      ...(line.notes ? { notes: line.notes } : {}),
    })),
    ...(v.notes ? { p_notes: v.notes } : {}),
    p_request_id: await currentRequestId(),
  });
  if (error) return rpcFailure(error);
  refreshInventoryPages();
  return {
    ok: true,
    data: data as { id: string; poNumber: string },
    message: 'Purchase order created.',
  };
}

export async function createPurchaseOrderFromSupply(
  input: unknown,
): Promise<ActionResult<{ id: string; poNumber: string }>> {
  await requireCapability('manageInventory');
  const parsed = purchaseOrderFromSupplySchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const v = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_create_po_from_supply', {
    p_supplier_id: v.supplierId,
    p_business_date: v.businessDate,
    ...(v.expectedDate ? { p_expected_date: v.expectedDate } : {}),
    p_request_id: await currentRequestId(),
  });
  if (error) return rpcFailure(error);
  refreshInventoryPages();
  return {
    ok: true,
    data: data as { id: string; poNumber: string },
    message: 'Draft purchase order created from farmer-confirmed supply.',
  };
}

export async function changePurchaseOrderStatus(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  await requireCapability('manageInventory');
  const parsed = purchaseOrderStatusActionSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const v = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_set_purchase_order_status', {
    p_po_id: v.id,
    p_expected_version: v.expectedVersion,
    p_action: v.action,
    ...('reason' in v ? { p_reason: v.reason } : {}),
    p_request_id: await currentRequestId(),
  });
  if (error) return rpcFailure(error, 'reason' in v ? 'reason' : undefined);
  refreshInventoryPages();
  return { ok: true, data: data as { version: number }, message: 'Purchase order updated.' };
}

/**
 * Records a DRAFT goods receipt. FormData: JSON `payload` plus optional
 * evidence images named `evidence-<poLineId>` (sniffed, re-encoded, private).
 * Uploaded objects are removed again if the RPC fails.
 */
export async function createGoodsReceipt(
  formData: FormData,
): Promise<ActionResult<{ id: string; receiptNumber: string; overReceipt: boolean }>> {
  await requireCapability('manageInventory');
  let input: unknown = {};
  const raw = formData.get('payload');
  if (typeof raw === 'string') {
    try {
      input = JSON.parse(raw) as unknown;
    } catch {
      input = {};
    }
  }
  const parsed = goodsReceiptCreateSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const v = parsed.data;

  const admin = createSupabaseAdminClient();
  const uploaded: string[] = [];
  const evidenceByLine = new Map<string, string>();
  for (const line of v.lines) {
    const file = formData.get(`evidence-${line.poLineId}`);
    if (!(file instanceof File) || file.size === 0) continue;
    const processed = await processPrivateImage(file);
    if (!processed.ok) {
      if (uploaded.length) await admin.storage.from(EVIDENCE_BUCKET).remove(uploaded);
      return failure('VALIDATION_ERROR', processed.message, {
        fieldErrors: [{ field: `evidence-${line.poLineId}`, message: processed.message }],
      });
    }
    const key = randomObjectKey('receipts');
    const { error: uploadError } = await admin.storage
      .from(EVIDENCE_BUCKET)
      .upload(key, processed.webp, { contentType: 'image/webp', upsert: false });
    if (uploadError) {
      if (uploaded.length) await admin.storage.from(EVIDENCE_BUCKET).remove(uploaded);
      return failure('SERVICE_UNAVAILABLE', 'The evidence could not be stored. Please try again.');
    }
    uploaded.push(key);
    evidenceByLine.set(line.poLineId, key);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_create_goods_receipt', {
    p_po_id: v.purchaseOrderId,
    p_lines: v.lines.map((line) => ({
      poLineId: line.poLineId,
      received: line.received,
      accepted: line.accepted,
      rejected: line.rejected,
      damaged: line.damaged,
      ...(line.qualityGrade ? { qualityGrade: line.qualityGrade } : {}),
      ...(line.qualityNotes ? { qualityNotes: line.qualityNotes } : {}),
      ...(line.lotCode ? { lotCode: line.lotCode } : {}),
      ...(line.harvestDate ? { harvestDate: line.harvestDate } : {}),
      ...(evidenceByLine.has(line.poLineId)
        ? { evidenceKey: evidenceByLine.get(line.poLineId) }
        : {}),
    })),
    ...(v.receivedAt ? { p_received_at: v.receivedAt } : {}),
    ...(v.notes ? { p_notes: v.notes } : {}),
    ...(v.overReceiptReason ? { p_over_receipt_reason: v.overReceiptReason } : {}),
    p_request_id: await currentRequestId(),
  });
  if (error) {
    if (uploaded.length) await admin.storage.from(EVIDENCE_BUCKET).remove(uploaded);
    if (error.message === 'over_receipt') {
      return failure(
        'CONFLICT',
        'More than the ordered quantity is being received. Give a reason to accept the over-receipt.',
        { fieldErrors: [{ field: 'overReceiptReason', message: 'Reason required' }] },
      );
    }
    return rpcFailure(error);
  }
  refreshInventoryPages();
  return {
    ok: true,
    data: data as { id: string; receiptNumber: string; overReceipt: boolean },
    message: 'Draft receipt recorded. Post it to create stock.',
  };
}

export async function postGoodsReceipt(
  input: unknown,
): Promise<ActionResult<{ batches: number; reservationsMoved: number }>> {
  await requireCapability('manageInventory');
  const parsed = goodsReceiptPostSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_post_goods_receipt', {
    p_receipt_id: parsed.data.id,
    p_expected_version: parsed.data.expectedVersion,
    p_request_id: await currentRequestId(),
  });
  if (error) {
    if (error.message === 'over_receipt') {
      return failure(
        'CONFLICT',
        'Another receipt was posted meanwhile and this one now exceeds the ordered quantity. Cancel it and record it again with a reason.',
      );
    }
    return rpcFailure(error);
  }
  refreshInventoryPages();
  return {
    ok: true,
    data: data as { batches: number; reservationsMoved: number },
    message: 'Receipt posted. Accepted quantities are now stock.',
  };
}

export async function cancelGoodsReceipt(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  await requireCapability('manageInventory');
  const parsed = goodsReceiptCancelSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_cancel_goods_receipt', {
    p_receipt_id: parsed.data.id,
    p_expected_version: parsed.data.expectedVersion,
    p_reason: parsed.data.reason,
    p_request_id: await currentRequestId(),
  });
  if (error) return rpcFailure(error, 'reason');
  refreshInventoryPages();
  return { ok: true, data: data as { version: number }, message: 'Receipt cancelled.' };
}

export async function adjustStock(input: unknown): Promise<ActionResult<{ onHand: string }>> {
  await requireCapability('manageInventory');
  const parsed = stockAdjustmentSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const v = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_adjust_stock', {
    p_batch_id: v.batchId,
    p_movement_type: v.movementType,
    p_quantity: v.quantity,
    p_reason: v.reason,
    p_request_id: await currentRequestId(),
  });
  if (error) return rpcFailure(error);
  refreshInventoryPages();
  return { ok: true, data: data as { onHand: string }, message: 'Stock movement recorded.' };
}

export async function changeBatchStatus(
  input: unknown,
): Promise<ActionResult<{ version: number; reservationsReturned: number }>> {
  await requireCapability('manageInventory');
  const parsed = batchStatusChangeSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const v = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_set_batch_status', {
    p_batch_id: v.batchId,
    p_expected_version: v.expectedVersion,
    p_status: v.status,
    p_reason: v.reason,
    p_request_id: await currentRequestId(),
  });
  if (error) return rpcFailure(error, 'reason');
  refreshInventoryPages();
  return {
    ok: true,
    data: data as { version: number; reservationsReturned: number },
    message: v.status === 'on_hold' ? 'Batch put on hold.' : 'Batch released.',
  };
}

export async function createRecall(
  input: unknown,
): Promise<ActionResult<{ recallNumber: string; reservationsReturned: number }>> {
  await requireCapability('manageInventory');
  const parsed = recallCreateSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_create_recall', {
    p_reason: parsed.data.reason,
    p_batch_ids: parsed.data.batchIds,
    p_request_id: await currentRequestId(),
  });
  if (error) return rpcFailure(error, 'reason');
  refreshInventoryPages();
  return {
    ok: true,
    data: data as { recallNumber: string; reservationsReturned: number },
    message: 'Recall recorded. The batch is no longer available.',
  };
}

export async function resolveException(input: unknown): Promise<ActionResult<{ id: string }>> {
  await requireCapability('manageInventory');
  const parsed = exceptionResolveSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_resolve_exception', {
    p_exception_id: parsed.data.id,
    p_note: parsed.data.note,
    p_request_id: await currentRequestId(),
  });
  if (error) return rpcFailure(error, 'note');
  refreshInventoryPages();
  return { ok: true, data: data as { id: string }, message: 'Exception resolved.' };
}
