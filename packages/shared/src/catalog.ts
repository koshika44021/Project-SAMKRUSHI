import { z } from 'zod';
import { nonNegativePaiseSchema } from './money.ts';
import { decimalQuantitySchema } from './quantity.ts';
import { businessDateSchema } from './time.ts';

/**
 * Customer catalog API contract (`get-catalog`, `get-product-detail`;
 * master §7, ADR-0003). Customers see availability STATUS and server-computed
 * `maxOrderable` packs — never raw farmer-confirmed quantities (dev default,
 * founder may revise). Prices are integer paise; quantities decimal strings.
 */
export const AVAILABILITY_STATUSES = ['available', 'limited', 'unavailable'] as const;
export const availabilityStatusSchema = z.enum(AVAILABILITY_STATUSES);
export type AvailabilityStatus = z.infer<typeof availabilityStatusSchema>;

export const catalogQuerySchema = z.object({
  businessDate: businessDateSchema,
  zoneId: z.uuid().optional(),
  categoryCode: z
    .string()
    .regex(/^[a-z0-9][a-z0-9_-]{1,49}$/)
    .optional(),
  includeUnavailable: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export type CatalogQuery = z.output<typeof catalogQuerySchema>;

export const productDetailQuerySchema = z
  .object({
    businessDate: businessDateSchema,
    zoneId: z.uuid().optional(),
    productId: z.uuid().optional(),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      .max(120)
      .optional(),
  })
  .refine((v) => Boolean(v.productId) !== Boolean(v.slug), {
    message: 'Provide exactly one of productId or slug',
    path: ['productId'],
  });

export const catalogSkuSchema = z.object({
  skuId: z.uuid(),
  skuCode: z.string(),
  label: z.string(),
  packQuantity: decimalQuantitySchema,
  baseUnit: z.string(),
  saleUnit: z.string(),
  pricePaise: nonNegativePaiseSchema,
  minOrderPacks: z.int().min(1),
  orderStepPacks: z.int().min(1),
  maxOrderable: z.int().min(0),
  availabilityStatus: availabilityStatusSchema,
});
export type CatalogSku = z.infer<typeof catalogSkuSchema>;

export const catalogImageSchema = z.object({
  url: z.url(),
  altText: z.string(),
  isPrimary: z.boolean(),
});

export const catalogProductSchema = z.object({
  productId: z.uuid(),
  productCode: z.string(),
  slug: z.string(),
  name: z.string(),
  localName: z.string().nullable(),
  description: z.string().nullable(),
  category: z.object({ code: z.string(), name: z.string() }),
  baseUnit: z.string(),
  availabilityStatus: availabilityStatusSchema,
  images: z.array(catalogImageSchema),
  skus: z.array(catalogSkuSchema),
});
export type CatalogProduct = z.infer<typeof catalogProductSchema>;

export const catalogResponseDataSchema = z.object({
  businessDate: businessDateSchema,
  products: z.array(catalogProductSchema),
});
export type CatalogResponseData = z.infer<typeof catalogResponseDataSchema>;

/** Row shape returned by `public.sku_availability()` (numeric fields arrive as numbers or strings). */
export interface SkuAvailabilityRow {
  sku_id: string;
  product_id: string;
  sku_code: string;
  pack_quantity: number | string;
  price_paise: number;
  is_listable: boolean;
  product_atp: number | string;
  max_orderable: number;
  availability_status: string;
}

const STATUS_RANK: Record<AvailabilityStatus, number> = {
  available: 2,
  limited: 1,
  unavailable: 0,
};

/** A product's status is the best status among its active SKUs. */
export function productAvailabilityStatus(
  skus: readonly { availabilityStatus: AvailabilityStatus }[],
): AvailabilityStatus {
  let best: AvailabilityStatus = 'unavailable';
  for (const sku of skus) {
    if (STATUS_RANK[sku.availabilityStatus] > STATUS_RANK[best]) best = sku.availabilityStatus;
  }
  return best;
}

/** Canonical decimal string for a NUMERIC value delivered as number or string. */
export function toDecimalString(value: number | string): string {
  const text = typeof value === 'number' ? value.toString() : value;
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    throw new RangeError(`Not a plain decimal: ${text}`);
  }
  if (!text.includes('.')) return text;
  const trimmed = text.replace(/0+$/, '').replace(/\.$/, '');
  return trimmed === '-0' ? '0' : trimmed;
}
