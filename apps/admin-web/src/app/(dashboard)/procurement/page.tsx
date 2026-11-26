import {
  formatBusinessDate,
  PURCHASE_ORDER_STATUS_LABELS,
  PURCHASE_ORDER_STATUSES,
  purchaseOrderListQuerySchema,
} from '@samkrushi/shared';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { BusinessDatePicker } from '@/components/business-date-picker';
import {
  Alert,
  buttonClass,
  Card,
  EmptyState,
  formatDateTimeIst,
  inputClass,
  PageHeader,
  Pagination,
  Table,
  Td,
  Th,
} from '@/components/ui/primitives';
import { can, requireCapability } from '@/lib/auth/session';
import { resolveBusinessDate } from '@/lib/server/business-date';
import { purchaseOrderListSchema, supplyAwaitingPoSchema } from '@/lib/server/inventory-schemas';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PurchaseOrderFromSupplyButton } from '../_inventory/forms';
import { PoStatusBadge } from '../_inventory/status';

export const metadata: Metadata = { title: 'Procurement' };

type Search = Record<string, string | undefined>;

export default async function ProcurementPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireCapability('viewInventory');
  const raw = await searchParams;
  const query = purchaseOrderListQuerySchema.parse({
    ...raw,
    status: raw.status || undefined,
    supplierId: raw.supplierId || undefined,
  });
  const { selected, today } = resolveBusinessDate(raw.date);
  const manage = can(session, 'manageInventory');

  const supabase = await createSupabaseServerClient();
  const [list, awaiting] = await Promise.all([
    supabase.rpc('admin_list_purchase_orders', {
      ...(query.status ? { p_status: query.status } : {}),
      ...(query.supplierId ? { p_supplier_id: query.supplierId } : {}),
      p_page: query.page,
      p_page_size: query.pageSize,
    }),
    supabase.rpc('admin_supply_awaiting_po', { p_business_date: selected }),
  ]);
  const parsed = purchaseOrderListSchema.safeParse(list.data);
  const awaitingParsed = supplyAwaitingPoSchema.safeParse(awaiting.data);

  const hrefFor = (page: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...raw, page: String(page) }))
      if (value) params.set(key, value);
    return `/procurement?${params.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Procurement"
        description="Purchase orders to farmers. A purchase order never changes stock or availability; only posted goods receipts do."
        actions={
          manage ? (
            <Link href="/procurement/new" className={buttonClass('primary')}>
              New purchase order
            </Link>
          ) : null
        }
      />

      <Card title="Farmer-confirmed supply awaiting a purchase order" className="mb-6">
        <BusinessDatePicker
          selected={selected}
          today={today}
          extraParams={{ status: raw.status }}
        />
        {!awaitingParsed.success ? (
          <Alert tone="danger">Supply awaiting a purchase order could not be loaded.</Alert>
        ) : awaitingParsed.data.length === 0 ? (
          <p className="text-sm text-slate-600">
            No active farmer-confirmed supply for {formatBusinessDate(selected)} is waiting for a
            purchase order.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm" data-testid="supply-awaiting-po">
            {awaitingParsed.data.map((row) => (
              <li key={row.supplierId} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {row.supplierName}{' '}
                  <span className="text-xs text-slate-500">{row.supplierCode}</span> · {row.records}{' '}
                  supply record{row.records === 1 ? '' : 's'}
                </span>
                {manage ? (
                  <PurchaseOrderFromSupplyButton
                    supplierId={row.supplierId}
                    businessDate={selected}
                    label="Create PO from supply"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <form
        method="get"
        className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3"
      >
        <div>
          <label htmlFor="status" className="block text-xs font-medium text-slate-600">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={query.status ?? ''}
            className={inputClass}
          >
            <option value="">All statuses</option>
            {PURCHASE_ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PURCHASE_ORDER_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <input type="hidden" name="date" value={selected} />
        <button type="submit" className={buttonClass('secondary')}>
          Filter
        </button>
      </form>

      {list.error || !parsed.success ? (
        <Alert tone="danger" title="Purchase orders could not be loaded.">
          Reload the page to try again.
        </Alert>
      ) : parsed.data.items.length === 0 ? (
        <EmptyState title="No purchase orders yet">
          Create one from farmer-confirmed supply above, or start a new purchase order.
        </EmptyState>
      ) : (
        <>
          <Table caption="Purchase orders">
            <thead>
              <tr>
                <Th>PO</Th>
                <Th>Farmer / supplier</Th>
                <Th>Expected</Th>
                <Th>Lines</Th>
                <Th>Status</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {parsed.data.items.map((po) => (
                <tr key={po.id}>
                  <Td>
                    <Link
                      href={`/procurement/${po.id}` as Route}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {po.poNumber}
                    </Link>
                  </Td>
                  <Td>
                    {po.supplierName}{' '}
                    <span className="text-xs text-slate-500">{po.supplierCode}</span>
                  </Td>
                  <Td>{formatBusinessDate(po.expectedDate)}</Td>
                  <Td>{po.lineCount}</Td>
                  <Td>
                    <PoStatusBadge status={po.status} />
                  </Td>
                  <Td className="text-xs text-slate-500">{formatDateTimeIst(po.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination
            page={parsed.data.pagination.page}
            totalPages={parsed.data.pagination.totalPages}
            totalItems={parsed.data.pagination.totalItems}
            hrefFor={hrefFor}
          />
        </>
      )}
    </>
  );
}
