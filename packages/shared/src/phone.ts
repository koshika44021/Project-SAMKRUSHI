import { z } from 'zod';

/**
 * Indian mobile numbers normalised to E.164 (`+91XXXXXXXXXX`). Accepts common
 * input forms: `98765 43210`, `098765-43210`, `919876543210`, `+91 98765 43210`.
 * Indian mobile numbers have 10 digits starting with 6–9.
 */
const INDIAN_MOBILE = /^[6-9]\d{9}$/;

export function normalizeIndianMobile(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) {
    if (!digits.startsWith('+91')) return null;
    digits = digits.slice(3);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return INDIAN_MOBILE.test(digits) ? `+91${digits}` : null;
}

/** Validates and normalises an Indian mobile number to E.164. */
export const indianMobileSchema = z
  .string()
  .trim()
  .min(1, 'Enter a phone number')
  .transform((value, ctx) => {
    const normalized = normalizeIndianMobile(value);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid Indian mobile number' });
      return z.NEVER;
    }
    return normalized;
  });

/** E.164 string as stored by the database. */
export const e164Schema = z.string().regex(/^\+[1-9]\d{7,14}$/);
