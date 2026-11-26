import { formatBusinessDate } from '@samkrushi/shared';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Alert,
  buttonClass,
  Card,
  formatDateTimeIst,
  PageHeader,
  Table,
  Td,
  Th,
} from '@/components/ui/primitives';
import { can, requireCapability } from '@/lib/auth/session';
import { purchaseOrderDetailSchema } from '@/lib/server/inventory-schemas';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PurchaseOrderActions } from '../../_inventory/action-buttons';
import { formatUnitCost, PoStatusBadge, ReceiptStatusBadge } from '../../_inventory/status';

export const metadata: Metadata = { title: 'Purchase order' };

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireCapability('viewInventory');
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_get_purchase_order', { p_po_id: id });
  if (error?.code === 'PT404' || error?.code === '22P02') notFound();
  const parsed = purchaseOrderDetailSchema.safeParse(data);
  if (error || !parsed.success) {
    return (
      <Alert tone="danger" title="The purchase order could not be loaded.">
        Reload the page to try again.
      </Alert>
    );
  }
  const po = parsed.data;
  const manage = can(session, 'manageInventory');
  const receivable = po.status === 'sent' || po.status === 'partially_received';

  return (
    <>
      <PageHeader
        title={po.poNumber}
        breadcrumb={[{ label: 'Procurement', href: '/procurement' }, { label: po.poNumber }]}
        description={
          <>
            {po.supplierName} ({po.supplierCode}) · expected {formatBusinessDate(po.expectedDate)} ·{' '}
            <span data-testid="po-status">
              <PoStatusBadge status={po.status} />
            </span>
          </>
        }
        actions={
          manage ? (
            <>
              {receivable ? (
                <Link href={`/procurement/${po.id}/receive` as Route} className={buttonClass()}>
                  Receive goods
                </Link>
              ) : null}
              <PurchaseOrderActions id={po.id} version={po.version} status={po.status} />
            </>
          ) : null
        }
      />

      {po.status === 'cancelled' ? (
        <div className="mb-4">
          <Alert tone="neutral" title="Cancelled">
            {formatDateTimeIst(po.cancelledAt)} — {po.cancelReason}
          </Alert>
        </div>
      ) : null}
      {po.closeReason ? (
        <div className="mb-4">
          <Alert tone="neutral" title="Closed short">
            {formatDateTimeIst(po.closedAt)} — {po.closeReason}
          </Alert>
        </div>
      ) : null}

      <div className="space-y-6">
        <Table caption="Purchase order lines">
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Product</Th>
              <Th>Ordered</Th>
              <Th>Received</Th>
              <Th>Accepted</Th>
              <Th>Rejected / damaged</Th>
              <Th>Remaining</Th>
              <Th>Agreed cost</Th>
              <Th>Supply link</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {po.lines.map((line) => (
              <tr key={line.id}>
                <Td>{line.lineNumber}</Td>
                <Td>
                  {line.productName}{' '}
                  <span className="text-xs text-slate-500">{line.productCode}</span>
                </Td>
                <Td>
                  {line.orderedQuantity} {line.unit}
                </Td>
                <Td>
                  {line.receivedQuantity} {line.unit}
                </Td>
                <Td>
                  {line.acceptedQuantity} {line.unit}
                </Td>
                <Td>
                  {line.rejectedQuantity} / {line.damagedQuantity} {line.unit}
                </Td>
                <Td>
                  {line.remainingQuantity} {line.unit}
                </Td>
                <Td>{formatUnitCost(line.agreedUnitCostPaise, line.unit)}</Td>
                <Td className="text-xs text-slate-500">
                  {line.supplyBusinessDate
                    ? `Farmer supply for ${formatBusinessDate(line.supplyBusinessDate)}`
                    : '—'}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>

        {po.notes ? (
          <Card title="Notes">
            <p className="text-sm whitespace-pre-wrap">{po.notes}</p>
          </Card>
        ) : null}

        <Card title="Goods receipts">
          {po.receipts.length === 0 ? (
            <p className="text-sm text-slate-600">Nothing has been received yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {po.receipts.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2">
                  <Link
                    href={`/receiving/${r.id}` as Route}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {r.receiptNumber}
                  </Link>
                  <span className="flex items-center gap-2 text-xs text-slate-500">
                    {formatDateTimeIst(r.receivedAt)} <ReceiptStatusBadge status={r.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <p className="text-xs text-slate-500">
          Created {formatDateTimeIst(po.createdAt)} · sent {formatDateTimeIst(po.sentAt)} · last
          change {formatDateTimeIst(po.updatedAt)}
        </p>
      </div>
    </>
  );
}
