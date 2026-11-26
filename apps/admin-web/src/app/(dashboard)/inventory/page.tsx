import { BATCH_STATUS_LABELS, BATCH_STATUSES, batchListQuerySchema } from '@samkrushi/shared';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import {
  Alert,
  buttonClass,
  EmptyState,
  formatDateTimeIst,
  inputClass,
  PageHeader,
  Pagination,
  Table,
  Td,
  Th,
} from '@/components/ui/primitives';
import { requireCapability } from '@/lib/auth/session';
import { batchListSchema, inventorySummarySchema } from '@/lib/server/inventory-schemas';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { BatchStatusBadge } from '../_inventory/status';

export const metadata: Metadata = { title: 'Inventory & batches' };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireCapability('viewInventory');
  const raw = await searchParams;
  const query = batchListQuerySchema.safeParse({
    ...raw,
    status: raw.status || undefined,
    productId: raw.productId || undefined,
  });
  const q = query.success ? query.data : batchListQuerySchema.parse({});

  const supabase = await createSupabaseServerClient();
  const [summary, batches] = await Promise.all([
    supabase.rpc('admin_inventory_summary'),
    supabase.rpc('admin_list_batches', {
      ...(q.productId ? { p_product_id: q.productId } : {}),
      ...(q.status ? { p_status: q.status } : {}),
      p_page: q.page,
      p_page_size: q.pageSize,
    }),
  ]);
  const summaryParsed = inventorySummarySchema.safeParse(summary.data);
  const batchesParsed = batchListSchema.safeParse(batches.data);
  const products = summaryParsed.success ? summaryParsed.data : [];
  const stocked = products.filter(
    (p) => p.batchCount > 0 || p.recalled !== '0' || p.rejectedTotal !== '0',
  );

  return (
    <>
      <PageHeader
        title="Inventory & batches"
        description="Physical stock from posted receipts. On hand is the sum of the append-only movement ledger; held and recalled stock is never available."
      />

      <h2 className="mb-2 text-sm font-semibold text-slate-900">Stock by product (base unit)</h2>
      {!summaryParsed.success ? (
        <Alert tone="danger">The inventory summary could not be loaded.</Alert>
      ) : stocked.length === 0 ? (
        <EmptyState title="No stock yet">
          Post a goods receipt to create the first batch.
        </EmptyState>
      ) : (
        <Table caption="Stock by product">
          <thead>
            <tr>
              <Th>Product</Th>
              <Th>On hand (active)</Th>
              <Th>Reserved on batches</Th>
              <Th>On hold</Th>
              <Th>Recalled</Th>
              <Th>Rejected / damaged (all receipts)</Th>
              <Th>Available today</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100" data-testid="inventory-summary">
            {stocked.map((p) => (
              <tr key={p.productId} data-product={p.productCode}>
                <Td>
                  <Link
                    href={`/inventory?productId=${p.productId}` as Route}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {p.name}
                  </Link>{' '}
                  <span className="text-xs text-slate-500">{p.productCode}</span>
                </Td>
                <Td>
                  {p.onHandActive} {p.baseUnit}
                </Td>
                <Td>
                  {p.reservedOnBatches} {p.baseUnit}
                </Td>
                <Td>
                  {p.onHold} {p.baseUnit}
                </Td>
                <Td>
                  {p.recalled} {p.baseUnit}
                </Td>
                <Td>
                  {p.rejectedTotal} / {p.damagedTotal} {p.baseUnit}
                </Td>
                <Td data-testid={`atp-${p.productCode}`}>
                  {p.atpToday} {p.baseUnit}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="mt-1 mb-6 text-xs text-slate-500">
        Available today = active on hand + open farmer-confirmed supply for today − reservations.
      </p>

      <form
        method="get"
        className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3"
      >
        <div>
          <label htmlFor="productId" className="block text-xs font-medium text-slate-600">
            Product
          </label>
          <select
            id="productId"
            name="productId"
            defaultValue={q.productId ?? ''}
            className={inputClass}
          >
            <option value="">All products</option>
            {stocked.map((p) => (
              <option key={p.productId} value={p.productId}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="status" className="block text-xs font-medium text-slate-600">
            Batch status
          </label>
          <select id="status" name="status" defaultValue={q.status ?? ''} className={inputClass}>
            <option value="">All statuses</option>
            {BATCH_STATUSES.map((status) => (
              <option key={status} value={status}>
                {BATCH_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={buttonClass('secondary')}>
          Filter
        </button>
      </form>

      {batches.error || !batchesParsed.success ? (
        <Alert tone="danger">Batches could not be loaded.</Alert>
      ) : batchesParsed.data.items.length === 0 ? (
        <EmptyState title="No batches match" />
      ) : (
        <>
          <Table caption="Batches (oldest received first — FIFO)">
            <thead>
              <tr>
                <Th>Batch</Th>
                <Th>Product</Th>
                <Th>Farmer / supplier</Th>
                <Th>Received</Th>
                <Th>On hand</Th>
                <Th>Reserved</Th>
                <Th>Available</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batchesParsed.data.items.map((b) => (
                <tr key={b.id}>
                  <Td>
                    <Link
                      href={`/inventory/batches/${b.id}` as Route}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {b.batchCode}
                    </Link>
                  </Td>
                  <Td>{b.productName}</Td>
                  <Td>
                    {b.supplierName}{' '}
                    <span className="text-xs text-slate-500">{b.supplierCode}</span>
                  </Td>
                  <Td className="text-xs text-slate-500">{formatDateTimeIst(b.receivedAt)}</Td>
                  <Td>
                    {b.onHand} {b.unit}
                  </Td>
                  <Td>
                    {b.reserved} {b.unit}
                  </Td>
                  <Td>
                    {b.available} {b.unit}
                  </Td>
                  <Td>
                    <BatchStatusBadge status={b.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination
            page={batchesParsed.data.pagination.page}
            totalPages={batchesParsed.data.pagination.totalPages}
            totalItems={batchesParsed.data.pagination.totalItems}
            hrefFor={(page) => {
              const params = new URLSearchParams();
              for (const [key, value] of Object.entries({ ...raw, page: String(page) }))
                if (value) params.set(key, value);
              return `/inventory?${params.toString()}`;
            }}
          />
        </>
      )}
    </>
  );
}
