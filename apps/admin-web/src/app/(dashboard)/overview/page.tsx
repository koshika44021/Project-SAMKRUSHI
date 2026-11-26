import { formatBusinessDate } from '@samkrushi/shared';
import type { Metadata } from 'next';
import { BusinessDatePicker } from '@/components/business-date-picker';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  formatDateTimeIst,
  PageHeader,
} from '@/components/ui/primitives';
import { requireStaff } from '@/lib/auth/session';
import { resolveBusinessDate } from '@/lib/server/business-date';
import { procurementWidgetsSchema } from '@/lib/server/inventory-schemas';
import { overviewSchema } from '@/lib/server/rpc-schemas';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Overview' };

function Kpi({
  label,
  value,
  definition,
  testId,
}: {
  label: string;
  value: number | string;
  definition: string;
  testId: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold" data-testid={testId}>
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{definition}</p>
    </div>
  );
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireStaff();
  const { date } = await searchParams;
  const { selected, today } = resolveBusinessDate(date);

  const supabase = await createSupabaseServerClient();
  const [{ data, error }, widgets] = await Promise.all([
    supabase.rpc('dashboard_overview', { p_business_date: selected }),
    supabase.rpc('dashboard_procurement_widgets'),
  ]);
  const parsed = overviewSchema.safeParse(data);
  const inventory = procurementWidgetsSchema.safeParse(widgets.data);

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Farmer-confirmed supply for ${formatBusinessDate(selected)}.`}
      />
      {inventory.success && inventory.data.inventoryWidgets ? (
        <div
          className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
          data-testid="inventory-widgets"
        >
          <Kpi
            testId="kpi-pos-awaiting"
            label="POs awaiting receipt"
            value={inventory.data.posAwaitingReceipt}
            definition="Purchase orders sent or partially received."
          />
          <Kpi
            testId="kpi-draft-receipts"
            label="Draft receipts"
            value={inventory.data.draftReceipts}
            definition="Recorded but not posted; not yet stock."
          />
          <Kpi
            testId="kpi-held-batches"
            label="Batches on hold"
            value={inventory.data.heldBatches}
            definition="Held stock is never available."
          />
          <Kpi
            testId="kpi-recalled-batches"
            label="Recalled batches"
            value={inventory.data.recalledBatches}
            definition="Kept for traceability; never available."
          />
          <Kpi
            testId="kpi-open-exceptions"
            label="Open exceptions"
            value={inventory.data.openExceptions}
            definition="Shortfalls, returned reservations and over-receipts to resolve."
          />
        </div>
      ) : null}
      <BusinessDatePicker selected={selected} today={today} />
      {error || !parsed.success ? (
        <Alert tone="danger" title="The overview could not be loaded.">
          Reload the page to try again.
        </Alert>
      ) : !parsed.data.supplyWidgets ? (
        <EmptyState title="No supply widgets for your role">
          Your role does not include farmer supply. Use the navigation to reach your areas.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              testId="kpi-active-farmers"
              label="Active farmers"
              value={parsed.data.activeFarmers ?? 0}
              definition="Farmers with status Active (any date)."
            />
            <Kpi
              testId="kpi-available-products"
              label="Products available to list"
              value={parsed.data.activeProductsWithAvailability ?? 0}
              definition="Active products whose sellable quantity for this date is above zero."
            />
            <Kpi
              testId="kpi-active-supply"
              label="Active supply records"
              value={parsed.data.activeSupplyRecords ?? 0}
              definition="Active farmer-confirmed records for this date with quantity above zero."
            />
            <Kpi
              testId="kpi-expired"
              label="Expired, still active"
              value={parsed.data.expiredActiveRecords ?? 0}
              definition="Active records from the last 7 days whose date has passed (need reconfirmation; never carried forward)."
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Low-supply products">
              {parsed.data.lowSupplyProducts?.length ? (
                <ul className="divide-y divide-slate-100 text-sm">
                  {parsed.data.lowSupplyProducts.map((p) => (
                    <li key={p.productId} className="flex justify-between py-2">
                      <span>{p.name}</span>
                      <span>
                        <Badge tone="warning">
                          {p.sellableQuantity} {p.unit}
                        </Badge>{' '}
                        <span className="text-xs text-slate-500">
                          threshold {p.threshold} {p.unit}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-600">
                  No product is at or below its configured low-supply threshold.
                </p>
              )}
            </Card>
            <Card title="Zero-supply products">
              {parsed.data.zeroSupplyProducts?.length ? (
                <ul className="divide-y divide-slate-100 text-sm" data-testid="zero-supply-list">
                  {parsed.data.zeroSupplyProducts.map((p) => (
                    <li key={p.productId} className="py-2">
                      {p.name} <span className="text-xs text-slate-500">({p.unit})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-600">
                  Every active product has farmer-confirmed supply for this date.
                </p>
              )}
            </Card>
          </div>

          <Card title="Alerts">
            <ul className="space-y-1 text-sm">
              <li>
                Inactive supply records for this date:{' '}
                <strong>{parsed.data.inactiveRecordsForDate ?? 0}</strong>
              </li>
              <li>
                Farmers no longer active but with current/future supply records:{' '}
                <strong>{parsed.data.inactiveFarmersWithFutureSupply ?? 0}</strong> (excluded from
                availability)
              </li>
            </ul>
          </Card>

          <Card title="Recent supply updates">
            {parsed.data.recentSupplyUpdates?.length ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {parsed.data.recentSupplyUpdates.map((u) => (
                  <li key={u.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      {u.supplierName}{' '}
                      <span className="text-xs text-slate-500">{u.supplierCode}</span> ·{' '}
                      {u.productName} · {u.quantity} {u.unit} for{' '}
                      {formatBusinessDate(u.businessDate)}{' '}
                      {u.status === 'inactive' ? <Badge>inactive</Badge> : null}
                    </span>
                    <span className="text-xs text-slate-500">{formatDateTimeIst(u.updatedAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">No supply has been recorded yet.</p>
            )}
          </Card>
          <p className="text-xs text-slate-500">
            Sellable quantity = active stock on hand + open farmer-confirmed supply − reservations
            (no double counting once supply is received). Units are never combined across products.
          </p>
        </div>
      )}
    </>
  );
}
