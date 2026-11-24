import { z } from 'zod';
import { staffRoleSchema } from './access.ts';
import { reasonSchema } from './farmer.ts';

/**
 * Staff administration (ADR-0005). Login is email-only; password reset is
 * admin-assisted (dev default, founder decision): a super_admin sets a
 * temporary password and the staff member must change it at next sign-in.
 */

/** Mirrors the local Auth policy (supabase/config.toml): ≥12 chars, lower+upper+digit. */
export const STAFF_PASSWORD_RULES = { minLength: 12 } as const;

export const staffPasswordSchema = z
  .string()
  .min(STAFF_PASSWORD_RULES.minLength, `Use at least ${STAFF_PASSWORD_RULES.minLength} characters`)
  .max(128)
  .refine(
    (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v),
    'Use upper and lower case letters and a digit',
  );

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'));

export const staffLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(128),
});

export const staffCreateSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  roles: z.array(staffRoleSchema).min(1, 'Choose at least one role'),
  temporaryPassword: staffPasswordSchema,
});
export type StaffCreate = z.output<typeof staffCreateSchema>;

export const staffRolesChangeSchema = z.object({
  userId: z.uuid(),
  roles: z.array(staffRoleSchema).min(1, 'Choose at least one role'),
  reason: reasonSchema,
});

export const staffStatusChangeSchema = z.object({
  userId: z.uuid(),
  isActive: z.coerce.boolean(),
  reason: reasonSchema,
});

export const staffPasswordResetSchema = z.object({
  userId: z.uuid(),
  temporaryPassword: staffPasswordSchema,
  reason: reasonSchema,
});

export const ownPasswordChangeSchema = z
  .object({
    newPassword: staffPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
