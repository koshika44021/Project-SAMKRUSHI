import { z } from 'zod';

/**
 * Money is always INR integer paise (database `BIGINT`). Never use floating
 * point for money: amounts cross the API as JSON integers and are formatted
 * with integer arithmetic only.
 */
export type Paise = number;

export const CURRENCY = 'INR' as const;

/** Any safe-integer paise amount (may be negative, e.g. adjustments). */
export const paiseSchema = z.int();

/** A non-negative paise amount (prices, totals, captured amounts). */
export const nonNegativePaiseSchema = z.int().nonnegative();

const RUPEE_INPUT = /^(-)?(\d{1,13})(?:\.(\d{1,2}))?$/;

/**
 * Parses a rupee amount typed by staff (e.g. `"12.5"`, `"1200"`) into paise
 * without floating-point arithmetic. Rejects more than two fractional digits.
 */
export function rupeesToPaise(input: string): Paise {
  const match = RUPEE_INPUT.exec(input.trim());
  if (!match) {
    throw new RangeError(`Invalid rupee amount: "${input}"`);
  }
  const [, sign, whole = '0', fraction = ''] = match;
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return sign && paise !== 0 ? -paise : paise;
}

/**
 * Indian digit grouping (last three digits, then pairs: 12,34,567) without
 * `Intl`, so web, Hermes and Deno format identically regardless of ICU data.
 */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, -3);
  const tail = digits.slice(-3);
  return `${head.replace(/\B(?=(\d{2})+$)/g, ',')},${tail}`;
}

/** Formats paise as an Indian-grouped rupee string, e.g. `123456789` → `₹12,34,567.89`. */
export function formatInr(paise: Paise): string {
  if (!Number.isSafeInteger(paise)) {
    throw new RangeError(`Paise must be a safe integer, received ${paise}`);
  }
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const fraction = abs % 100;
  const rupees = (abs - fraction) / 100;
  return `${negative ? '-' : ''}₹${groupIndian(String(rupees))}.${String(fraction).padStart(2, '0')}`;
}
