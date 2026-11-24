import { formatBusinessDate } from '@samkrushi/shared';
import { Alert, buttonClass, inputClass } from '@/components/ui/primitives';

/**
 * GET form for choosing the business/procurement date. Warns when the
 * selected date differs from the server's current business date (master §13.12).
 */
export function BusinessDatePicker({
  selected,
  today,
  extraParams = {},
}: {
  selected: string;
  today: string;
  extraParams?: Record<string, string | undefined>;
}) {
  return (
    <div className="mb-4 space-y-2">
      <form method="get" className="flex flex-wrap items-end gap-2">
        {Object.entries(extraParams).map(([key, value]) =>
          value ? <input key={key} type="hidden" name={key} value={value} /> : null,
        )}
        <div>
          <label htmlFor="date" className="block text-xs font-medium text-slate-600">
            Business date
          </label>
          <input id="date" name="date" type="date" defaultValue={selected} className={inputClass} />
        </div>
        <button type="submit" className={buttonClass('secondary')}>
          Show
        </button>
      </form>
      {selected !== today ? (
        <Alert tone="warning">
          Showing <strong>{formatBusinessDate(selected)}</strong>. Today&apos;s business date is{' '}
          {formatBusinessDate(today)}.
        </Alert>
      ) : null}
    </div>
  );
}
