import { z } from 'zod';
import { indianMobileSchema } from './phone.ts';

/**
 * Farmer registration rules. Required-field choices are FOUNDER DECISIONS
 * still open (docs/business-decisions.md); these are the ADMIN_DASHBOARD §16
 * development defaults. Change them here (and add DB NOT NULLs by migration)
 * once founders confirm.
 */
export const FARMER_FIELD_RULES = {
  secondaryPhoneRequired: true,
  landAreaRequired: true,
  photoRequired: true,
  /** Dev default: new farmers are active on creation (pending founder confirmation). */
  defaultStatusOnCreate: 'active',
} as const;

export const SUPPLIER_STATUSES = [
  'pending_verification',
  'active',
  'suspended',
  'inactive',
] as const;
export const supplierStatusSchema = z.enum(SUPPLIER_STATUSES);
export type SupplierStatus = z.infer<typeof supplierStatusSchema>;

export const SUPPLIER_STATUS_LABELS: Record<SupplierStatus, string> = {
  pending_verification: 'Pending verification',
  active: 'Active',
  suspended: 'Suspended',
  inactive: 'Inactive',
};

export const LAND_AREA_UNITS = ['acre', 'hectare'] as const;
export const landAreaUnitSchema = z.enum(LAND_AREA_UNITS);

const requiredText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

/** Positive decimal with up to 2 places (land area), as a string. */
const landAreaValueSchema = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/, 'Enter a number with at most 2 decimal places')
  .refine((value) => /[1-9]/.test(value), 'Land area must be greater than zero');

const optionalPhone = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional()
  .pipe(indianMobileSchema.nullable().optional());

export const reasonSchema = z
  .string()
  .trim()
  .min(3, 'Give a reason (at least 3 characters)')
  .max(500, 'Reason must be at most 500 characters');

const farmerFields = {
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  addressLine: requiredText('Address', 300),
  villageLocality: requiredText('Village/locality', 120),
  mandal: requiredText('Mandal', 120),
  district: requiredText('District', 120),
  state: requiredText('State', 120),
  pinCode: z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/, 'Enter a valid six-digit PIN code'),
  primaryPhone: indianMobileSchema,
  secondaryPhone: optionalPhone,
  landAreaValue: landAreaValueSchema.nullable().optional(),
  landAreaUnit: landAreaUnitSchema.nullable().optional(),
  notes: optionalText(2000),
  duplicatePhoneReason: optionalText(400),
};

type FarmerFieldsInput = {
  primaryPhone: string;
  secondaryPhone?: string | null | undefined;
  landAreaValue?: string | null | undefined;
  landAreaUnit?: string | null | undefined;
};

function applyFarmerRules(value: FarmerFieldsInput, ctx: z.RefinementCtx): void {
  if (FARMER_FIELD_RULES.secondaryPhoneRequired && !value.secondaryPhone) {
    ctx.addIssue({
      code: 'custom',
      path: ['secondaryPhone'],
      message: 'Secondary contact is required',
    });
  }
  if (value.secondaryPhone && value.secondaryPhone === value.primaryPhone) {
    ctx.addIssue({
      code: 'custom',
      path: ['secondaryPhone'],
      message: 'Secondary contact must differ from the primary contact',
    });
  }
  const hasValue = Boolean(value.landAreaValue);
  const hasUnit = Boolean(value.landAreaUnit);
  if (FARMER_FIELD_RULES.landAreaRequired && !hasValue) {
    ctx.addIssue({ code: 'custom', path: ['landAreaValue'], message: 'Land area is required' });
  }
  if (hasValue !== hasUnit) {
    ctx.addIssue({
      code: 'custom',
      path: [hasValue ? 'landAreaUnit' : 'landAreaValue'],
      message: 'Enter land area and its unit together',
    });
  }
}

export const farmerCreateSchema = z
  .object({
    ...farmerFields,
    status: z
      .enum(['active', 'pending_verification'])
      .default(FARMER_FIELD_RULES.defaultStatusOnCreate),
  })
  .superRefine(applyFarmerRules);
export type FarmerCreateInput = z.input<typeof farmerCreateSchema>;
export type FarmerCreate = z.output<typeof farmerCreateSchema>;

export const farmerUpdateSchema = z
  .object({
    ...farmerFields,
    id: z.uuid(),
    expectedVersion: z.coerce.number().int().min(1),
    reason: reasonSchema,
  })
  .superRefine(applyFarmerRules);
export type FarmerUpdateInput = z.input<typeof farmerUpdateSchema>;
export type FarmerUpdate = z.output<typeof farmerUpdateSchema>;

export const farmerStatusChangeSchema = z.object({
  id: z.uuid(),
  expectedVersion: z.coerce.number().int().min(1),
  status: supplierStatusSchema,
  reason: reasonSchema,
});
export type FarmerStatusChange = z.output<typeof farmerStatusChangeSchema>;

export const FARMER_SORTS = ['name', 'code', 'recent', 'last_supply'] as const;

export const farmerListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: supplierStatusSchema.optional(),
  district: z.string().trim().max(120).optional(),
  locality: z.string().trim().max(120).optional(),
  productId: z.uuid().optional(),
  sort: z.enum(FARMER_SORTS).default('name'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type FarmerListQuery = z.output<typeof farmerListQuerySchema>;

/** Photo upload constraints (dev defaults pending founder decision, master §13.9). */
export const PHOTO_UPLOAD_RULES = {
  maxBytes: 5 * 1024 * 1024,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] as const,
} as const;
