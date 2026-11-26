import { formatBusinessDate, MOVEMENT_TYPE_LABELS } from '@samkrushi/shared';
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
import { batchDetailSchema } from '@/lib/server/inventory-schemas';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { BatchActions } from '../../../_inventory/action-buttons';
import { BatchStatusBadge, formatUnitCost } from '../../../_inventory/status';

export const metadata: Metadata = { title: 'Batch' };

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium text-slate-500 uppercase">{label}</p>
      <p className="mt-1 text-lg font-semibold" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireCapability('viewInventory');
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_get_batch', { p_batch_id: id });
  if (error?.code === 'PT404' || error?.code === '22P02') notFound();
  const parsed = batchDetailSchema.safeParse(data);
  if (error || !parsed.success) {
    return <Alert tone="danger">The batch could not be loaded. Reload the page.</Alert>;
  }
  const b = parsed.data;

  return (
    <>
      <PageHeader
        title={b.batchCode}
        breadcrumb={[{ label: 'Inventory & batches', href: '/inventory' }, { label: b.batchCode }]}
        description={
          <>
            {b.productName} · {b.supplierName} ({b.supplierCode}) · receipt{' '}
            <Link href={`/receiving/${b.receiptId}` as Route} className="hover:underline">
              {b.receiptNumber}
            </Link>{' '}
            ·{' '}
            <span data-testid="batch-status">
              <BatchStatusBadge status={b.status} />
            </span>
          </>
        }
        actions={
          can(session, 'manageInventory') ? (
            <BatchActions batchId={b.id} version={b.version} status={b.status} unit={b.unit} />
          ) : null
        }
      />
      {b.statusReason && b.status !== 'active' ? (
        <div className="mb-4">
          <Alert tone={b.status === 'recalled' ? 'danger' : 'warning'}>{b.statusReason}</Alert>
        </div>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Initial (accepted)" value={`${b.initialQuantity} ${b.unit}`} />
        <Stat label="On hand" value={`${b.onHand} ${b.unit}`} testId="batch-on-hand" />
        <Stat label="Reserved" value={`${b.reserved} ${b.unit}`} />
        <Stat label="Available" value={`${b.available} ${b.unit}`} testId="batch-available" />
        <Stat label="Agreed cost" value={formatUnitCost(b.unitCostPaise, b.unit)} />
      </div>
      <p className="mb-4 text-xs text-slate-500">
        Received {formatDateTimeIst(b.receivedAt)}
        {b.harvestDate
          ? ` · harvest ${formatBusinessDate(b.harvestDate)} (not an expiry date)`
          : ''}
        . No sell-by policy applies; allocation is first received, first out.
      </p>

      <Card title="Movement ledger (append-only)">
        <Table caption="Stock movements">
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Movement</Th>
              <Th>Quantity</Th>
              <Th>Reason</Th>
              <Th>By</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100" data-testid="movement-ledger">
            {b.movements.map((m) => (
              <tr key={m.id}>
                <Td className="text-xs text-slate-500">{formatDateTimeIst(m.createdAt)}</Td>
                <Td>{MOVEMENT_TYPE_LABELS[m.movementType]}</Td>
                <Td className={m.quantityDelta.startsWith('-') ? 'text-red-700' : 'text-green-800'}>
                  {m.quantityDelta.startsWith('-') ? m.quantityDelta : `+${m.quantityDelta}`}{' '}
                  {b.unit}
                </Td>
                <Td>{m.reason ?? '—'}</Td>
                <Td>{m.createdByName ?? '—'}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {b.recalls.length ? (
        <Card title="Recalls" className="mt-6">
          <ul className="divide-y divide-slate-100 text-sm">
            {b.recalls.map((r) => (
              <li key={r.recallNumber} className="py-2">
                <strong>{r.recallNumber}</strong> · {formatDateTimeIst(r.createdAt)} — {r.reason}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
