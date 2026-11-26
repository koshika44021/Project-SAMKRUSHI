import 'server-only';
import {
  BATCH_STATUSES,
  decimalQuantitySchema,
  EXCEPTION_STATUSES,
  EXCEPTION_TYPES,
  GOODS_RECEIPT_STATUSES,
  MOVEMENT_TYPES,
  paginationMetaSchema,
  PURCHASE_ORDER_STATUSES,
  toDecimalString,
} from '@samkrushi/shared';
import { z } from 'zod';

/**
 * Runtime validation of the Phase 4 jsonb read RPCs (ADR-0012). Quantities
 * arrive as exact decimal strings; signed movement deltas keep their sign.
 */
const qty = decimalQuantitySchema.transform(toDecimalString);
const signedQty = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,3})?$/);
const nullableString = z.string().nullable();

export const purchaseOrderListSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      poNumber: z.string(),
      status: z.enum(PURCHASE_ORDER_STATUSES),
      expectedDate: z.string(),
      supplierId: z.string(),
      supplierName: z.string(),
      supplierCode: z.string(),
      lineCount: z.int(),
      createdAt: z.string(),
      version: z.int(),
    }),
  ),
  pagination: paginationMetaSchema,
});

export const purchaseOrderDetailSchema = z.object({
  id: z.string(),
  poNumber: z.string(),
  status: z.enum(PURCHASE_ORDER_STATUSES),
  expectedDate: z.string(),
  notes: nullableString,
  supplierId: z.string(),
  supplierName: z.string(),
  supplierCode: z.string(),
  sentAt: nullableString,
  closedAt: nullableString,
  closeReason: nullableString,
  cancelledAt: nullableString,
  cancelReason: nullableString,
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.int(),
  lines: z.array(
    z.object({
      id: z.string(),
      lineNumber: z.int(),
      productId: z.string(),
      productName: z.string(),
      productCode: z.string(),
      unit: z.string(),
      quantityPrecision: z.int(),
      orderedQuantity: qty,
      agreedUnitCostPaise: z.int().nullable(),
      notes: nullableString,
      supplyConfirmationId: nullableString,
      supplyBusinessDate: nullableString,
      receivedQuantity: qty,
      acceptedQuantity: qty,
      rejectedQuantity: qty,
      damagedQuantity: qty,
      remainingQuantity: qty,
    }),
  ),
  receipts: z.array(
    z.object({
      id: z.string(),
      receiptNumber: z.string(),
      status: z.enum(GOODS_RECEIPT_STATUSES),
      receivedAt: z.string(),
      postedAt: nullableString,
    }),
  ),
});
export type PurchaseOrderDetail = z.infer<typeof purchaseOrderDetailSchema>;

export const goodsReceiptListSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      receiptNumber: z.string(),
      status: z.enum(GOODS_RECEIPT_STATUSES),
      receivedAt: z.string(),
      postedAt: nullableString,
      poId: z.string(),
      poNumber: z.string(),
      supplierName: z.string(),
      supplierCode: z.string(),
      lineCount: z.int(),
      version: z.int(),
    }),
  ),
  pagination: paginationMetaSchema,
});

export const goodsReceiptDetailSchema = z.object({
  id: z.string(),
  receiptNumber: z.string(),
  status: z.enum(GOODS_RECEIPT_STATUSES),
  receivedAt: z.string(),
  receivedByName: nullableString,
  notes: nullableString,
  overReceiptReason: nullableString,
  postedAt: nullableString,
  cancelledAt: nullableString,
  cancelReason: nullableString,
  version: z.int(),
  poId: z.string(),
  poNumber: z.string(),
  supplierName: z.string(),
  supplierCode: z.string(),
  lines: z.array(
    z.object({
      id: z.string(),
      poLineId: z.string(),
      productName: z.string(),
      unit: z.string(),
      receivedQuantity: qty,
      acceptedQuantity: qty,
      rejectedQuantity: qty,
      damagedQuantity: qty,
      qualityGrade: nullableString,
      qualityNotes: nullableString,
      lotCode: nullableString,
      harvestDate: nullableString,
      hasEvidence: z.boolean(),
      batchId: nullableString,
      batchCode: nullableString,
    }),
  ),
});
export type GoodsReceiptDetail = z.infer<typeof goodsReceiptDetailSchema>;

export const inventorySummarySchema = z.array(
  z.object({
    productId: z.string(),
    productCode: z.string(),
    name: z.string(),
    baseUnit: z.string(),
    onHandActive: qty,
    onHold: qty,
    recalled: qty,
    reservedOnBatches: qty,
    rejectedTotal: qty,
    damagedTotal: qty,
    atpToday: qty,
    batchCount: z.int(),
  }),
);

const batchCore = {
  id: z.string(),
  batchCode: z.string(),
  productId: z.string(),
  productName: z.string(),
  unit: z.string(),
  supplierName: z.string(),
  supplierCode: z.string(),
  receivedAt: z.string(),
  harvestDate: nullableString,
  status: z.enum(BATCH_STATUSES),
  statusReason: nullableString,
  initialQuantity: qty,
  onHand: qty,
  reserved: qty,
  available: qty,
  version: z.int(),
};

export const batchListSchema = z.object({
  items: z.array(z.object(batchCore)),
  pagination: paginationMetaSchema,
});

export const batchDetailSchema = z.object({
  ...batchCore,
  quantityPrecision: z.int(),
  unitCostPaise: z.int().nullable(),
  receiptId: z.string(),
  receiptNumber: z.string(),
  movements: z.array(
    z.object({
      id: z.string(),
      movementType: z.enum(MOVEMENT_TYPES),
      quantityDelta: signedQty,
      reason: nullableString,
      createdAt: z.string(),
      createdByName: nullableString,
    }),
  ),
  recalls: z.array(
    z.object({ recallNumber: z.string(), reason: z.string(), createdAt: z.string() }),
  ),
});
export type BatchDetail = z.infer<typeof batchDetailSchema>;

export const exceptionListSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      type: z.enum(EXCEPTION_TYPES),
      status: z.enum(EXCEPTION_STATUSES),
      productName: nullableString,
      businessDate: nullableString,
      batchCode: nullableString,
      details: z.record(z.string(), z.unknown()),
      createdAt: z.string(),
      resolvedAt: nullableString,
      resolutionNote: nullableString,
      resolvedByName: nullableString,
    }),
  ),
  pagination: paginationMetaSchema,
});

export const supplyAwaitingPoSchema = z.array(
  z.object({
    supplierId: z.string(),
    supplierName: z.string(),
    supplierCode: z.string(),
    records: z.int(),
  }),
);

export const procurementWidgetsSchema = z.union([
  z.object({ inventoryWidgets: z.literal(false) }),
  z.object({
    inventoryWidgets: z.literal(true),
    posAwaitingReceipt: z.int(),
    draftReceipts: z.int(),
    heldBatches: z.int(),
    recalledBatches: z.int(),
    openExceptions: z.int(),
  }),
]);
