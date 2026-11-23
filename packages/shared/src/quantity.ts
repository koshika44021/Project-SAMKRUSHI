import { z } from 'zod';

/**
 * Quantities are stored as `NUMERIC` with an explicit unit and cross the API
 * as decimal strings — never JSON floats (ADR-0003). Values have at most
 * {@link QUANTITY_MAX_SCALE} fractional digits.
 */
export type DecimalQuantity = string;

export const QUANTITY_MAX_SCALE = 3;

const DECIMAL_QUANTITY = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/;

/** A non-negative decimal quantity string such as `"0"`, `"2.5"` or `"12.125"`. */
export const decimalQuantitySchema = z
  .string()
  .regex(DECIMAL_QUANTITY, 'Enter a non-negative quantity with at most 3 decimal places');

/** A strictly positive decimal quantity string. */
export const positiveDecimalQuantitySchema = decimalQuantitySchema.refine(
  (value) => /[1-9]/.test(value),
  'Quantity must be greater than zero',
);

/**
 * Converts a decimal quantity string to an exact integer count of
 * thousandths, for comparisons and sums without floating-point error.
 */
export function quantityToThousandths(quantity: DecimalQuantity): bigint {
  if (!DECIMAL_QUANTITY.test(quantity)) {
    throw new RangeError(`Invalid decimal quantity: "${quantity}"`);
  }
  const [whole = '0', fraction = ''] = quantity.split('.');
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(QUANTITY_MAX_SCALE, '0'));
}

/** Formats an exact thousandths count back into a canonical decimal string. */
export function thousandthsToQuantity(thousandths: bigint): DecimalQuantity {
  if (thousandths < 0n) {
    throw new RangeError('Quantities cannot be negative');
  }
  const whole = thousandths / 1000n;
  const fraction = (thousandths % 1000n)
    .toString()
    .padStart(QUANTITY_MAX_SCALE, '0')
    .replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** Compares two decimal quantity strings exactly: -1, 0 or 1. */
export function compareQuantities(a: DecimalQuantity, b: DecimalQuantity): -1 | 0 | 1 {
  const left = quantityToThousandths(a);
  const right = quantityToThousandths(b);
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
