import { GOODS_RECEIPT_STATUS_LABELS, GOODS_RECEIPT_STATUSES } from '@samkrushi/shared';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { z } from 'zod';
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
import { goodsReceiptListSchema } from '@/lib/server/inventory-schemas';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ReceiptStatusBadge } from '../_inventory/status';

export const metadata: Metadata = { title: 'Goods receiving' };

const querySchema = z.object({
  status: z.enum(GOODS_RECEIPT_STATUSES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
});

export default async function ReceivingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireCapability('viewInventory');
  const raw = await searchParams;
  const query = querySchema.parse({ status: raw.status || undefined, page: raw.page ?? 1 });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_list_goods_receipts', {
    ...(query.status ? { p_status: query.status } : {}),
    p_page: query.page,
    p_page_size: 25,
  });
  const parsed = goodsReceiptListSchema.safeParse(data);

  return (
    <>
      <PageHeader
        title="Goods receiving & quality"
        description="Receipts against purchase orders. Draft receipts do not affect stock; posting creates batches from accepted quantities only."
      />
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
            {GOODS_RECEIPT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {GOODS_RECEIPT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={buttonClass('secondary')}>
          Filter
        </button>
      </form>
      {error || !parsed.success ? (
        <Alert tone="danger" title="Receipts could not be loaded.">
          Reload the page to try again.
        </Alert>
      ) : parsed.data.items.length === 0 ? (
        <EmptyState title="No goods receipts">
          Receive goods from a sent purchase order in Procurement.
        </EmptyState>
      ) : (
        <>
          <Table caption="Goods receipts">
            <thead>
              <tr>
                <Th>Receipt</Th>
                <Th>Purchase order</Th>
                <Th>Farmer / supplier</Th>
                <Th>Lines</Th>
                <Th>Received</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {parsed.data.items.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <Link
                      href={`/receiving/${r.id}` as Route}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {r.receiptNumber}
                    </Link>
                  </Td>
                  <Td>
                    <Link href={`/procurement/${r.poId}` as Route} className="hover:underline">
                      {r.poNumber}
                    </Link>
                  </Td>
                  <Td>
                    {r.supplierName}{' '}
                    <span className="text-xs text-slate-500">{r.supplierCode}</span>
                  </Td>
                  <Td>{r.lineCount}</Td>
                  <Td className="text-xs text-slate-500">{formatDateTimeIst(r.receivedAt)}</Td>
                  <Td>
                    <ReceiptStatusBadge status={r.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination
            page={parsed.data.pagination.page}
            totalPages={parsed.data.pagination.totalPages}
            totalItems={parsed.data.pagination.totalItems}
            hrefFor={(page) =>
              `/receiving?${new URLSearchParams({ ...(query.status ? { status: query.status } : {}), page: String(page) }).toString()}`
            }
          />
        </>
      )}
    </>
  );
}
