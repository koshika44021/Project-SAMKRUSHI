import { formatBusinessDate } from '@samkrushi/shared';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import {
  Alert,
  buttonClass,
  EmptyState,
  formatDateTimeIst,
  PageHeader,
  Pagination,
  Table,
  Td,
  Th,
} from '@/components/ui/primitives';
import { can, requireCapability } from '@/lib/auth/session';
import { exceptionListSchema } from '@/lib/server/inventory-schemas';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ResolveExceptionButton } from '../_inventory/action-buttons';
import { ExceptionTypeBadge } from '../_inventory/status';

export const metadata: Metadata = { title: 'Operations exceptions' };

/** Human summary of the exception details recorded by the database. */
function describe(type: string, details: Record<string, unknown>): string {
  const text = (key: string) => (typeof details[key] === 'string' ? details[key] : undefined);
  const count = (key: string) => (typeof details[key] === 'number' ? details[key] : undefined);
  switch (type) {
    case 'supply_shortfall':
      return `Reservations waiting on farmer supply (${text('poolReserved') ?? '?'}) exceed the remaining open supply (${text('openSupply') ?? '?'}) after receipt ${text('receipt') ?? ''}. The product is not shown to customers while nothing is available.`;
    case 'reservations_returned_to_pool':
      return `${count('reservations') ?? 'Some'} reservation(s) returned to the supply pool (${text('cause') ?? 'batch status change'}).`;
    case 'over_receipt':
      return `Receipt ${text('receipt') ?? ''} exceeded the ordered quantity: ${text('reason') ?? ''}`;
    default:
      return '';
  }
}

export default async function ExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const session = await requireCapability('viewInventory');
  const raw = await searchParams;
  const status = raw.status === 'resolved' ? 'resolved' : 'open';
  const page = Math.max(1, Number.parseInt(raw.page ?? '1', 10) || 1);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_list_exceptions', {
    p_status: status,
    p_page: page,
    p_page_size: 50,
  });
  const parsed = exceptionListSchema.safeParse(data);
  const manage = can(session, 'manageInventory');

  return (
    <>
      <PageHeader
        title="Operations exceptions"
        description="Raised automatically by receiving, holds and recalls. Resolve each with a note once handled."
        actions={
          <>
            <Link
              href={'/exceptions' as Route}
              className={buttonClass(status === 'open' ? 'primary' : 'secondary')}
            >
              Open
            </Link>
            <Link
              href={'/exceptions?status=resolved' as Route}
              className={buttonClass(status === 'resolved' ? 'primary' : 'secondary')}
            >
              Resolved
            </Link>
          </>
        }
      />
      {error || !parsed.success ? (
        <Alert tone="danger">Exceptions could not be loaded. Reload the page.</Alert>
      ) : parsed.data.items.length === 0 ? (
        <EmptyState title={status === 'open' ? 'No open exceptions' : 'No resolved exceptions'} />
      ) : (
        <>
          <Table caption="Operations exceptions">
            <thead>
              <tr>
                <Th>Type</Th>
                <Th>Product / batch</Th>
                <Th>Details</Th>
                <Th>Raised</Th>
                <Th>{status === 'open' ? '' : 'Resolution'}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100" data-testid="exceptions">
              {parsed.data.items.map((e) => (
                <tr key={e.id}>
                  <Td>
                    <ExceptionTypeBadge type={e.type} />
                  </Td>
                  <Td>
                    {e.productName ?? '—'}
                    {e.businessDate ? (
                      <span className="block text-xs text-slate-500">
                        {formatBusinessDate(e.businessDate)}
                      </span>
                    ) : null}
                    {e.batchCode ? (
                      <span className="block text-xs text-slate-500">{e.batchCode}</span>
                    ) : null}
                  </Td>
                  <Td className="max-w-md text-sm">{describe(e.type, e.details)}</Td>
                  <Td className="text-xs text-slate-500">{formatDateTimeIst(e.createdAt)}</Td>
                  <Td>
                    {e.status === 'open' ? (
                      manage ? (
                        <ResolveExceptionButton id={e.id} />
                      ) : null
                    ) : (
                      <span className="text-xs">
                        {e.resolutionNote}
                        <span className="block text-slate-500">
                          {e.resolvedByName ?? '—'} · {formatDateTimeIst(e.resolvedAt)}
                        </span>
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination
            page={parsed.data.pagination.page}
            totalPages={parsed.data.pagination.totalPages}
            totalItems={parsed.data.pagination.totalItems}
            hrefFor={(p) => `/exceptions?status=${status}&page=${p}`}
          />
        </>
      )}
    </>
  );
}
