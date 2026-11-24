import 'server-only';
import { decimalQuantitySchema, paginationMetaSchema, toDecimalString } from '@samkrushi/shared';
import { z } from 'zod';

/**
 * Runtime validation of jsonb RPC results (generated DB types describe them
 * only as Json). Quantities arrive as decimal strings (ADR-0003).
 */
/** Canonical display form ("4.0" → "4", "0.500" → "0.5"); values stay exact strings. */
const qty = decimalQuantitySchema.transform(toDecimalString);
const nullableQty = qty.nullable();

export const overviewSchema = z.object({
  businessDate: z.string(),
  serverBusinessDate: z.string(),
  supplyWidgets: z.boolean(),
  activeFarmers: z.int().optional(),
  activeProductsWithAvailability: z.int().optional(),
  activeSupplyRecords: z.int().optional(),
  zeroSupplyProducts: z
    .array(
      z.object({
        productId: z.string(),
        productCode: z.string(),
        name: z.string(),
        unit: z.string(),
      }),
    )
    .optional(),
  lowSupplyProducts: z
    .array(
      z.object({
        productId: z.string(),
        productCode: z.string(),
        name: z.string(),
        unit: z.string(),
        sellableQuantity: qty,
        threshold: qty,
      }),
    )
    .optional(),
  recentSupplyUpdates: z
    .array(
      z.object({
        id: z.string(),
        supplierName: z.string(),
        supplierCode: z.string(),
        productName: z.string(),
        businessDate: z.string(),
        quantity: qty,
        unit: z.string(),
        status: z.string(),
        updatedAt: z.string(),
      }),
    )
    .optional(),
  expiredActiveRecords: z.int().optional(),
  inactiveRecordsForDate: z.int().optional(),
  inactiveFarmersWithFutureSupply: z.int().optional(),
});
export type Overview = z.infer<typeof overviewSchema>;

export const farmerListItemSchema = z.object({
  id: z.string(),
  supplierCode: z.string(),
  name: z.string(),
  supplierType: z.string(),
  status: z.enum(['pending_verification', 'active', 'suspended', 'inactive']),
  villageLocality: z.string().nullable(),
  mandal: z.string().nullable(),
  district: z.string().nullable(),
  primaryPhone: z.string().nullable(),
  phoneMasked: z.boolean(),
  productsSupplied: z.array(z.string()),
  verifiedAt: z.string().nullable(),
  lastSupplyUpdateAt: z.string().nullable(),
  updatedAt: z.string(),
  version: z.int(),
});
export const farmerListSchema = z.object({
  items: z.array(farmerListItemSchema),
  pagination: paginationMetaSchema,
});

export const farmerDetailSchema = z.object({
  id: z.string(),
  supplierCode: z.string(),
  name: z.string(),
  supplierType: z.string(),
  status: z.enum(['pending_verification', 'active', 'suspended', 'inactive']),
  addressLine: z.string().nullable(),
  villageLocality: z.string().nullable(),
  mandal: z.string().nullable(),
  district: z.string().nullable(),
  state: z.string().nullable(),
  pinCode: z.string().nullable(),
  notes: z.string().nullable(),
  landAreaValue: z.string().nullable(),
  landAreaUnit: z.enum(['acre', 'hectare']).nullable(),
  hasPhoto: z.boolean(),
  canViewPhoto: z.boolean(),
  verifiedAt: z.string().nullable(),
  verifiedBy: z.string().nullable(),
  deactivatedAt: z.string().nullable(),
  deactivationReason: z.string().nullable(),
  primaryPhone: z.string().nullable(),
  secondaryPhone: z.string().nullable(),
  phoneMasked: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.int(),
});
export type FarmerDetail = z.infer<typeof farmerDetailSchema>;

export const supplyListItemSchema = z.object({
  id: z.string(),
  supplierId: z.string(),
  supplierCode: z.string(),
  supplierName: z.string(),
  supplierStatus: z.string(),
  productId: z.string(),
  productCode: z.string(),
  productName: z.string(),
  businessDate: z.string(),
  quantity: qty,
  unit: z.string(),
  confirmationSource: z.string(),
  confirmedBy: z.string(),
  confirmedByName: z.string().nullable(),
  confirmedAt: z.string(),
  note: z.string().nullable(),
  hasEvidence: z.boolean(),
  status: z.enum(['active', 'inactive']),
  isExpired: z.boolean(),
  changeReason: z.string().nullable(),
  updatedAt: z.string(),
  version: z.int(),
});
export type SupplyListItem = z.infer<typeof supplyListItemSchema>;
export const supplyListSchema = z.object({
  items: z.array(supplyListItemSchema),
  pagination: paginationMetaSchema,
});

export const productAvailabilitySchema = z.array(
  z.object({
    productId: z.string(),
    productCode: z.string(),
    name: z.string(),
    categoryName: z.string(),
    baseUnit: z.string(),
    farmerConfirmedSupply: qty,
    sellableQuantity: qty,
    contributingFarmers: z.int(),
    lowSupplyThreshold: nullableQty,
    isListable: z.boolean(),
    skus: z.array(
      z.object({
        skuId: z.string(),
        skuCode: z.string(),
        packQuantity: qty,
        pricePaise: z.int(),
        maxOrderable: z.int(),
        availabilityStatus: z.enum(['available', 'limited', 'unavailable']),
      }),
    ),
  }),
);

export const staffListSchema = z.array(
  z.object({
    userId: z.string(),
    fullName: z.string(),
    email: z.string().nullable(),
    isActive: z.boolean(),
    lastLoginAt: z.string().nullable(),
    deactivatedAt: z.string().nullable(),
    deactivationReason: z.string().nullable(),
    roles: z.array(z.string()),
    createdAt: z.string(),
  }),
);
export type StaffListItem = z.infer<typeof staffListSchema>[number];
