import { z } from 'zod';
import { reasonSchema } from './farmer.ts';
import {
  decimalQuantitySchema,
  positiveDecimalQuantitySchema,
  quantityToThousandths,
} from './quantity.ts';
import { businessDateSchema } from './time.ts';

/**
 * Procurement, receiving and inventory contracts (ADR-0012, master §4.4–§4.5).
 * Quantities are decimal strings in the product BASE unit; money is integer
 * paise. Validation here is for forms only — the database RPCs re-check
 * everything (precision, over-receipt, reserved stock, roles).
 */

export const PURCHASE_ORDER_STATUSES = [
  'draft',
  'sent',
  'partially_received',
  'received',
  'cancelled',
] as const;
export const purchaseOrderStatusSchema = z.enum(PURCHASE_ORDER_STATUSES);
export type PurchaseOrderStatus = z.infer<typeof purchaseOrderStatusSchema>;
export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partially_received: 'Partially received',
  received: 'Received',
  cancelled: 'Cancelled',
};

export const GOODS_RECEIPT_STATUSES = ['draft', 'posted', 'cancelled'] as const;
export const goodsReceiptStatusSchema = z.enum(GOODS_RECEIPT_STATUSES);
export type GoodsReceiptStatus = z.infer<typeof goodsReceiptStatusSchema>;
export const GOODS_RECEIPT_STATUS_LABELS: Record<GoodsReceiptStatus, string> = {
  draft: 'Draft',
  posted: 'Posted',
  cancelled: 'Cancelled',
};

export const BATCH_STATUSES = ['active', 'on_hold', 'recalled', 'depleted'] as const;
export const batchStatusSchema = z.enum(BATCH_STATUSES);
export type BatchStatus = z.infer<typeof batchStatusSchema>;
export const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  active: 'Active',
  on_hold: 'On hold',
  recalled: 'Recalled',
  depleted: 'Depleted',
};

export const MOVEMENT_TYPES = [
  'receipt',
  'adjustment_increase',
  'return_to_stock',
  'wastage',
  'damage',
  'sample',
  'adjustment_decrease',
  'sale',
] as const;
export const movementTypeSchema = z.enum(MOVEMENT_TYPES);
export type MovementType = z.infer<typeof movementTypeSchema>;
export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  receipt: 'Goods receipt',
  adjustment_increase: 'Adjustment (increase)',
  return_to_stock: 'Return to stock',
  wastage: 'Wastage',
  damage: 'Damage',
  sample: 'Sample',
  adjustment_decrease: 'Adjustment (decrease)',
  sale: 'Sale',
};
/** Movements staff may record by hand (receipts and sales come from their workflows). */
export const MANUAL_MOVEMENT_TYPES = [
  'adjustment_increase',
  'return_to_stock',
  'wastage',
  'damage',
  'sample',
  'adjustment_decrease',
] as const satisfies readonly MovementType[];
export const manualMovementTypeSchema = z.enum(MANUAL_MOVEMENT_TYPES);
export type ManualMovementType = z.infer<typeof manualMovementTypeSchema>;
export const INCREASING_MOVEMENT_TYPES: readonly MovementType[] = [
  'receipt',
  'adjustment_increase',
  'return_to_stock',
];

export const EXCEPTION_TYPES = [
  'supply_shortfall',
  'reservations_returned_to_pool',
  'over_receipt',
] as const;
export const exceptionTypeSchema = z.enum(EXCEPTION_TYPES);
export type ExceptionType = z.infer<typeof exceptionTypeSchema>;
export const EXCEPTION_TYPE_LABELS: Record<ExceptionType, string> = {
  supply_shortfall: 'Supply shortfall',
  reservations_returned_to_pool: 'Reservations returned to pool',
  over_receipt: 'Over-receipt',
};
export const EXCEPTION_STATUSES = ['open', 'resolved'] as const;
export const exceptionStatusSchema = z.enum(EXCEPTION_STATUSES);
export type ExceptionStatus = z.infer<typeof exceptionStatusSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

const optionalDecimal = decimalQuantitySchema.or(z.literal('').transform(() => '0')).default('0');

const expectedVersionSchema = z.coerce.number().int().min(1);

// ----------------------------------------------------------- purchase orders
export const purchaseOrderLineInputSchema = z.object({
  productId: z.uuid('Choose a catalog product'),
  quantity: positiveDecimalQuantitySchema,
  /** Agreed cost per base unit in paise; optional (no standard rates). */
  unitCostPaise: z.int().nonnegative().nullable().optional(),
  supplyConfirmationId: z.uuid().nullable().optional(),
  notes: optionalText(500),
});
export type PurchaseOrderLineInput = z.input<typeof purchaseOrderLineInputSchema>;

const purchaseOrderLinesSchema = z
  .array(purchaseOrderLineInputSchema)
  .min(1, 'Add at least one line')
  .max(100)
  .refine(
    (lines) => {
      const links = lines.map((line) => line.supplyConfirmationId).filter(Boolean);
      return new Set(links).size === links.length;
    },
    { message: 'A supply record can appear on one line only' },
  );

export const purchaseOrderCreateSchema = z.object({
  supplierId: z.uuid('Choose a farmer'),
  expectedDate: businessDateSchema,
  notes: optionalText(2000),
  lines: purchaseOrderLinesSchema,
});
export type PurchaseOrderCreateInput = z.input<typeof purchaseOrderCreateSchema>;
export type PurchaseOrderCreate = z.output<typeof purchaseOrderCreateSchema>;

export const purchaseOrderFromSupplySchema = z.object({
  supplierId: z.uuid('Choose a farmer'),
  businessDate: businessDateSchema,
  expectedDate: businessDateSchema.optional(),
});
export type PurchaseOrderFromSupply = z.output<typeof purchaseOrderFromSupplySchema>;

export const purchaseOrderUpdateSchema = z.object({
  id: z.uuid(),
  expectedVersion: expectedVersionSchema,
  expectedDate: businessDateSchema,
  notes: optionalText(2000),
  lines: purchaseOrderLinesSchema,
});
export type PurchaseOrderUpdate = z.output<typeof purchaseOrderUpdateSchema>;

export const PURCHASE_ORDER_ACTIONS = ['send', 'cancel', 'close'] as const;
export const purchaseOrderStatusActionSchema = z.discriminatedUnion('action', [
  z.object({ id: z.uuid(), expectedVersion: expectedVersionSchema, action: z.literal('send') }),
  z.object({
    id: z.uuid(),
    expectedVersion: expectedVersionSchema,
    action: z.literal('cancel'),
    reason: reasonSchema,
  }),
  z.object({
    id: z.uuid(),
    expectedVersion: expectedVersionSchema,
    action: z.literal('close'),
    reason: reasonSchema,
  }),
]);
export type PurchaseOrderStatusAction = z.output<typeof purchaseOrderStatusActionSchema>;

export const purchaseOrderListQuerySchema = z.object({
  status: purchaseOrderStatusSchema.optional(),
  supplierId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PurchaseOrderListQuery = z.output<typeof purchaseOrderListQuerySchema>;

// ---------------------------------------------------------------- receiving
export const goodsReceiptLineInputSchema = z
  .object({
    poLineId: z.uuid(),
    received: positiveDecimalQuantitySchema,
    accepted: optionalDecimal,
    rejected: optionalDecimal,
    damaged: optionalDecimal,
    qualityGrade: optionalText(40),
    qualityNotes: optionalText(1000),
    lotCode: optionalText(60),
    harvestDate: businessDateSchema.or(z.literal('').transform(() => undefined)).optional(),
  })
  .refine(
    (line) =>
      quantityToThousandths(line.received) ===
      quantityToThousandths(line.accepted) +
        quantityToThousandths(line.rejected) +
        quantityToThousandths(line.damaged),
    { message: 'Accepted + rejected + damaged must equal received', path: ['accepted'] },
  );
export type GoodsReceiptLineInput = z.input<typeof goodsReceiptLineInputSchema>;
export type GoodsReceiptLine = z.output<typeof goodsReceiptLineInputSchema>;

export const goodsReceiptCreateSchema = z.object({
  purchaseOrderId: z.uuid(),
  receivedAt: z.iso.datetime({ offset: true }).optional(),
  notes: optionalText(2000),
  /** Required by the server when anything exceeds the ordered remainder. */
  overReceiptReason: optionalText(500),
  lines: z
    .array(goodsReceiptLineInputSchema)
    .min(1, 'Record at least one received line')
    .max(100)
    .refine((lines) => new Set(lines.map((line) => line.poLineId)).size === lines.length, {
      message: 'Each PO line can appear once per receipt',
    }),
});
export type GoodsReceiptCreateInput = z.input<typeof goodsReceiptCreateSchema>;
export type GoodsReceiptCreate = z.output<typeof goodsReceiptCreateSchema>;

export const goodsReceiptPostSchema = z.object({
  id: z.uuid(),
  expectedVersion: expectedVersionSchema,
});
export const goodsReceiptCancelSchema = z.object({
  id: z.uuid(),
  expectedVersion: expectedVersionSchema,
  reason: reasonSchema,
});

// ---------------------------------------------------------------- inventory
export const stockAdjustmentSchema = z.object({
  batchId: z.uuid(),
  movementType: manualMovementTypeSchema,
  quantity: positiveDecimalQuantitySchema,
  reason: reasonSchema,
});
export type StockAdjustment = z.output<typeof stockAdjustmentSchema>;

export const batchStatusChangeSchema = z.object({
  batchId: z.uuid(),
  expectedVersion: expectedVersionSchema,
  /** Hold or release only; recalls go through {@link recallCreateSchema}. */
  status: z.enum(['on_hold', 'active']),
  reason: reasonSchema,
});
export type BatchStatusChange = z.output<typeof batchStatusChangeSchema>;

export const recallCreateSchema = z.object({
  reason: reasonSchema,
  batchIds: z.array(z.uuid()).min(1, 'Choose at least one batch').max(200),
});
export type RecallCreate = z.output<typeof recallCreateSchema>;

export const exceptionResolveSchema = z.object({
  id: z.uuid(),
  note: reasonSchema,
});
export type ExceptionResolve = z.output<typeof exceptionResolveSchema>;

export const batchListQuerySchema = z.object({
  productId: z.uuid().optional(),
  status: batchStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type BatchListQuery = z.output<typeof batchListQuerySchema>;
