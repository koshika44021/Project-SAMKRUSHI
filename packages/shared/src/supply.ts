import { z } from 'zod';
import { reasonSchema } from './farmer.ts';
import { decimalQuantitySchema, positiveDecimalQuantitySchema } from './quantity.ts';
import { businessDateSchema } from './time.ts';

/** Farmer-confirmed supply (master §4.2, WEB_ADMIN §8). Quantities are decimal strings. */
export const SUPPLY_STATUSES = ['active', 'inactive'] as const;
export const supplyStatusSchema = z.enum(SUPPLY_STATUSES);

const confirmationSourceSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{1,39}$/, 'Choose how the farmer confirmed');

export const supplyCreateSchema = z.object({
  supplierId: z.uuid('Choose a farmer'),
  productId: z.uuid('Choose a catalog product'),
  businessDate: businessDateSchema,
  quantity: positiveDecimalQuantitySchema,
  /** Optional alternative entry unit; the server converts exactly to the base unit. */
  entryUnit: z
    .string()
    .regex(/^[a-z][a-z_]{0,15}$/)
    .optional(),
  confirmationSource: confirmationSourceSchema,
  confirmedAt: z.iso.datetime({ offset: true }).optional(),
  note: z
    .string()
    .trim()
    .max(1000)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional(),
});
export type SupplyCreateInput = z.input<typeof supplyCreateSchema>;
export type SupplyCreate = z.output<typeof supplyCreateSchema>;

export const supplyUpdateSchema = z.object({
  id: z.uuid(),
  expectedVersion: z.coerce.number().int().min(1),
  /** Zero is allowed on update (with a reason); create requires > 0. */
  quantity: decimalQuantitySchema,
  reason: reasonSchema,
  note: z
    .string()
    .trim()
    .max(1000)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional(),
});
export type SupplyUpdate = z.output<typeof supplyUpdateSchema>;

export const supplyStatusChangeSchema = z.object({
  id: z.uuid(),
  expectedVersion: z.coerce.number().int().min(1),
  status: supplyStatusSchema,
  reason: reasonSchema,
});
export type SupplyStatusChange = z.output<typeof supplyStatusChangeSchema>;

export const supplyListQuerySchema = z.object({
  businessDate: businessDateSchema.optional(),
  supplierId: z.uuid().optional(),
  productId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  status: supplyStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type SupplyListQuery = z.output<typeof supplyListQuerySchema>;
