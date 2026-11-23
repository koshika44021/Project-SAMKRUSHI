import { describe, expect, it } from 'vitest';
import { formatInr, nonNegativePaiseSchema, paiseSchema, rupeesToPaise } from './money.ts';

describe('rupeesToPaise', () => {
  it.each([
    ['0', 0],
    ['1', 100],
    ['12.5', 1250],
    ['12.50', 1250],
    ['0.01', 1],
    ['1200', 120000],
    [' 99.99 ', 9999],
    ['-5.25', -525],
    ['-0', 0],
  ])('parses %j as %d paise', (input, expected) => {
    expect(rupeesToPaise(input)).toBe(expected);
  });

  it('avoids floating-point drift (0.1 + 0.2 style inputs)', () => {
    expect(rupeesToPaise('0.29')).toBe(29);
    expect(rupeesToPaise('1.15')).toBe(115);
    expect(rupeesToPaise('4.35')).toBe(435);
  });

  it.each(['', 'abc', '1.234', '1,000', '₹10', '.5', '1.', '1e3', '--1'])('rejects %j', (input) => {
    expect(() => rupeesToPaise(input)).toThrow(RangeError);
  });
});

describe('formatInr', () => {
  it.each([
    [0, '₹0.00'],
    [1, '₹0.01'],
    [100, '₹1.00'],
    [123456789, '₹12,34,567.89'],
    [-525, '-₹5.25'],
    [Number.MAX_SAFE_INTEGER, '₹9,00,71,99,25,47,409.91'],
  ])('formats %d paise as %s', (paise, expected) => {
    expect(formatInr(paise)).toBe(expected);
  });

  it('rejects non-integer and unsafe amounts', () => {
    expect(() => formatInr(1.5)).toThrow(RangeError);
    expect(() => formatInr(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
    expect(() => formatInr(Number.NaN)).toThrow(RangeError);
  });

  it('round-trips with rupeesToPaise', () => {
    for (const paise of [0, 1, 99, 100, 101, 999_999, 1_000_000]) {
      const display = formatInr(paise).replace(/[₹,]/g, '');
      expect(rupeesToPaise(display)).toBe(paise);
    }
  });
});

describe('paise schemas', () => {
  it('accepts only integers', () => {
    expect(paiseSchema.safeParse(10).success).toBe(true);
    expect(paiseSchema.safeParse(-10).success).toBe(true);
    expect(paiseSchema.safeParse(10.5).success).toBe(false);
    expect(paiseSchema.safeParse('10').success).toBe(false);
    expect(paiseSchema.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(false);
  });

  it('nonNegativePaiseSchema rejects negatives', () => {
    expect(nonNegativePaiseSchema.safeParse(0).success).toBe(true);
    expect(nonNegativePaiseSchema.safeParse(-1).success).toBe(false);
  });
});
