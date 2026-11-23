import { describe, expect, it } from 'vitest';
import {
  compareQuantities,
  decimalQuantitySchema,
  positiveDecimalQuantitySchema,
  quantityToThousandths,
  thousandthsToQuantity,
} from './quantity.ts';

describe('decimalQuantitySchema', () => {
  it.each(['0', '1', '2.5', '12.125', '0.001', '999999999999.999'])('accepts %j', (value) => {
    expect(decimalQuantitySchema.safeParse(value).success).toBe(true);
  });

  it.each(['', '-1', '1.2345', '01', '1.', '.5', '1e3', 'abc', '1,000', ' 1'])(
    'rejects %j',
    (value) => {
      expect(decimalQuantitySchema.safeParse(value).success).toBe(false);
    },
  );

  it('rejects JSON numbers — quantities must be strings', () => {
    expect(decimalQuantitySchema.safeParse(2.5).success).toBe(false);
  });
});

describe('positiveDecimalQuantitySchema', () => {
  it('rejects zero in any spelling', () => {
    for (const zero of ['0', '0.0', '0.000']) {
      expect(positiveDecimalQuantitySchema.safeParse(zero).success).toBe(false);
    }
  });

  it('accepts the smallest positive quantity', () => {
    expect(positiveDecimalQuantitySchema.safeParse('0.001').success).toBe(true);
  });
});

describe('exact quantity arithmetic', () => {
  it('converts to thousandths exactly', () => {
    expect(quantityToThousandths('2.5')).toBe(2500n);
    expect(quantityToThousandths('0.001')).toBe(1n);
    expect(quantityToThousandths('12')).toBe(12000n);
  });

  it('sums without floating-point error', () => {
    const total = ['0.1', '0.2'].map(quantityToThousandths).reduce((a, b) => a + b, 0n);
    expect(thousandthsToQuantity(total)).toBe('0.3');
  });

  it('formats canonically', () => {
    expect(thousandthsToQuantity(2500n)).toBe('2.5');
    expect(thousandthsToQuantity(12000n)).toBe('12');
    expect(thousandthsToQuantity(1n)).toBe('0.001');
    expect(thousandthsToQuantity(0n)).toBe('0');
    expect(() => thousandthsToQuantity(-1n)).toThrow(RangeError);
  });

  it('compares exactly', () => {
    expect(compareQuantities('2.50', '2.5')).toBe(0);
    expect(compareQuantities('2.499', '2.5')).toBe(-1);
    expect(compareQuantities('10', '9.999')).toBe(1);
  });

  it('rejects invalid input', () => {
    expect(() => quantityToThousandths('1.2345')).toThrow(RangeError);
  });
});
