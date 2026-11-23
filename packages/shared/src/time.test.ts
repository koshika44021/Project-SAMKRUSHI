import { describe, expect, it } from 'vitest';
import { addBusinessDays, businessDateSchema, formatBusinessDate, toBusinessDate } from './time.ts';

describe('toBusinessDate (Asia/Kolkata, UTC+05:30, no DST)', () => {
  it('rolls over at IST midnight, not UTC midnight', () => {
    // 18:29:59Z = 23:59:59 IST on the same calendar day
    expect(toBusinessDate(new Date('2026-11-23T18:29:59Z'))).toBe('2026-11-23');
    // 18:30:00Z = 00:00:00 IST the next day
    expect(toBusinessDate(new Date('2026-11-23T18:30:00Z'))).toBe('2026-11-24');
  });

  it('is ahead of UTC in the early UTC morning', () => {
    expect(toBusinessDate(new Date('2026-12-31T20:00:00Z'))).toBe('2027-01-01');
  });

  it('rejects invalid instants', () => {
    expect(() => toBusinessDate(new Date('not a date'))).toThrow(RangeError);
  });
});

describe('addBusinessDays', () => {
  it('handles month, year and leap-day boundaries', () => {
    expect(addBusinessDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addBusinessDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addBusinessDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addBusinessDays('2027-03-01', -1)).toBe('2027-02-28');
  });

  it('rejects invalid dates and fractional days', () => {
    expect(() => addBusinessDays('2026-02-30', 1)).toThrow(RangeError);
    expect(() => addBusinessDays('2026-11-23', 0.5)).toThrow(RangeError);
  });
});

describe('businessDateSchema', () => {
  it('accepts real calendar dates only', () => {
    expect(businessDateSchema.safeParse('2026-11-23').success).toBe(true);
    expect(businessDateSchema.safeParse('2026-13-01').success).toBe(false);
    expect(businessDateSchema.safeParse('2026-11-23T00:00:00Z').success).toBe(false);
    expect(businessDateSchema.safeParse('23-11-2026').success).toBe(false);
  });
});

describe('formatBusinessDate', () => {
  it('formats without shifting the calendar day', () => {
    expect(formatBusinessDate('2026-11-23')).toBe('Mon, 23 Nov 2026');
    expect(formatBusinessDate('2027-01-01')).toBe('Fri, 1 Jan 2027');
  });
});
