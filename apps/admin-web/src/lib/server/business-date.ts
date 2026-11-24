import 'server-only';
import {
  addBusinessDays,
  type BusinessDate,
  businessDateSchema,
  toBusinessDate,
} from '@samkrushi/shared';

/** Selected business date from a query param, defaulting to the SERVER's current IST date. */
export function resolveBusinessDate(param: string | string[] | undefined): {
  selected: BusinessDate;
  today: BusinessDate;
  isToday: boolean;
} {
  const today = toBusinessDate(new Date());
  const raw = Array.isArray(param) ? param[0] : param;
  const parsed = businessDateSchema.safeParse(raw);
  const selected = parsed.success ? parsed.data : today;
  return { selected, today, isToday: selected === today };
}

export { addBusinessDays };
