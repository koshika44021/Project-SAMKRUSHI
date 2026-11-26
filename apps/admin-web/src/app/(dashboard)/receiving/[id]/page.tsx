import { formatBusinessDate } from '@samkrushi/shared';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Alert,
  Card,
  formatDateTimeIst,
  PageHeader,
  Table,
  Td,
  Th,
} from '@/components/ui/primitives';
import { can, requireCapability } from '@/lib/auth/session';
import { goodsReceiptDetailSchema } from '@/lib/server/inventory-schemas';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ReceiptActions } from '../../_inventory/action-buttons';
import { ReceiptStatusBadge } from '../../_inventory/status';

export const metadata: Metadata = { title: 'Goods receipt' };

export default async function GoodsReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireCapability('viewInventory');
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_get_goods_receipt', { p_receipt_id: id });
  if (error?.code === 'PT404' || error?.code === '22P02') notFound();
  const parsed = goodsReceiptDetailSchema.safeParse(data);
  if (error || !parsed.success) {
    return <Alert tone="danger">The receipt could not be loaded. Reload the page.</Alert>;
  }
  const r = parsed.data;
  const manage = can(session, 'manageInventory');

  return (
    <>
      <PageHeader
        title={r.receiptNumber}
        breadcrumb={[{ label: 'Goods receiving', href: '/receiving' }, { label: r.receiptNumber }]}
        description={
          <>
            <Link href={`/procurement/${r.poId}` as Route} className="hover:underline">
              {r.poNumber}
            </Link>{' '}
            · {r.supplierName} ({r.supplierCode}) · received {formatDateTimeIst(r.receivedAt)} by{' '}
            {r.receivedByName ?? '—'} ·{' '}
            <span data-testid="receipt-status">
              <ReceiptStatusBadge status={r.status} />
            </span>
          </>
        }
        actions={
          manage && r.status === 'draft' ? <ReceiptActions id={r.id} version={r.version} /> : null
        }
      />
      {r.status === 'draft' ? (
        <div className="mb-4">
          <Alert tone="warning" title="Draft — not yet stock">
            Post the receipt to create batches from the accepted quantities.
          </Alert>
        </div>
      ) : null}
      {r.status === 'cancelled' ? (
        <div className="mb-4">
          <Alert tone="neutral" title="Cancelled">
            {formatDateTimeIst(r.cancelledAt)} — {r.cancelReason}
          </Alert>
        </div>
      ) : null}
      {r.overReceiptReason ? (
        <div className="mb-4">
          <Alert tone="info" title="Over-receipt accepted">
            {r.overReceiptReason}
          </Alert>
        </div>
      ) : null}

      <Table caption="Receipt lines">
        <thead>
          <tr>
            <Th>Product</Th>
            <Th>Received</Th>
            <Th>Accepted</Th>
            <Th>Rejected</Th>
            <Th>Damaged</Th>
            <Th>Quality</Th>
            <Th>Lot / harvest</Th>
            <Th>Evidence</Th>
            <Th>Batch</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {r.lines.map((line) => (
            <tr key={line.id}>
              <Td>{line.productName}</Td>
              <Td>
                {line.receivedQuantity} {line.unit}
              </Td>
              <Td>
                {line.acceptedQuantity} {line.unit}
              </Td>
              <Td>
                {line.rejectedQuantity} {line.unit}
              </Td>
              <Td>
                {line.damagedQuantity} {line.unit}
              </Td>
              <Td>
                {line.qualityGrade ?? '—'}
                {line.qualityNotes ? (
                  <span className="block text-xs text-slate-500">{line.qualityNotes}</span>
                ) : null}
              </Td>
              <Td className="text-xs">
                {line.lotCode ?? '—'}
                {line.harvestDate ? (
                  <span className="block text-slate-500">
                    harvest {formatBusinessDate(line.harvestDate)}
                  </span>
                ) : null}
              </Td>
              <Td className="text-xs">
                {line.hasEvidence ? (
                  manage ? (
                    <a
                      href={`/receiving/evidence/${line.id}`}
                      target="_blank"
                      rel="noopener"
                      className="text-brand-700 hover:underline"
                    >
                      View evidence
                    </a>
                  ) : (
                    'Evidence attached'
                  )
                ) : (
                  '—'
                )}
              </Td>
              <Td>
                {line.batchId ? (
                  <Link
                    href={`/inventory/batches/${line.batchId}` as Route}
                    className="text-brand-700 hover:underline"
                  >
                    {line.batchCode}
                  </Link>
                ) : (
                  <span className="text-xs text-slate-500">
                    {r.status === 'posted' ? 'No accepted stock' : '—'}
                  </span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {r.notes ? (
        <Card title="Notes" className="mt-6">
          <p className="text-sm whitespace-pre-wrap">{r.notes}</p>
        </Card>
      ) : null}
    </>
  );
}
