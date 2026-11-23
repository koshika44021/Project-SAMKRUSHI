import { z } from 'zod';

/**
 * Timestamps are stored in UTC (`TIMESTAMPTZ`). Business dates, cutoffs and
 * delivery slots use Asia/Kolkata. Cutoffs are always validated with server
 * time; device time is display-only.
 */
export const BUSINESS_TIME_ZONE = 'Asia/Kolkata' as const;

/** A calendar date in `YYYY-MM-DD` form, interpreted in {@link BUSINESS_TIME_ZONE}. */
export type BusinessDate = string;

export const businessDateSchema = z.iso.date();

const businessDateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Returns the Asia/Kolkata calendar date of an instant. */
export function toBusinessDate(instant: Date): BusinessDate {
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError('Invalid instant');
  }
  const parts = businessDateParts.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function parseBusinessDate(date: BusinessDate): Date {
  if (!businessDateSchema.safeParse(date).success) {
    throw new RangeError(`Invalid business date: "${date}"`);
  }
  return new Date(`${date}T00:00:00Z`);
}

/** Adds whole calendar days to a business date. */
export function addBusinessDays(date: BusinessDate, days: number): BusinessDate {
  if (!Number.isInteger(days)) {
    throw new RangeError('days must be an integer');
  }
  const base = parseBusinessDate(date);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * Human-readable business date, e.g. `Mon, 23 Nov 2026`. Built without
 * `Intl` so web (V8), mobile (Hermes) and Edge Functions (Deno) render the
 * same string regardless of ICU data.
 */
export function formatBusinessDate(date: BusinessDate): string {
  const parsed = parseBusinessDate(date);
  const weekday = WEEKDAYS[parsed.getUTCDay()] ?? '';
  const month = MONTHS[parsed.getUTCMonth()] ?? '';
  return `${weekday}, ${parsed.getUTCDate()} ${month} ${parsed.getUTCFullYear()}`;
}
