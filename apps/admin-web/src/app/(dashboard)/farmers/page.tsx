import {
  farmerListQuerySchema,
  SUPPLIER_STATUS_LABELS,
  SUPPLIER_STATUSES,
} from '@samkrushi/shared';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import {
  Alert,
  Badge,
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
import { can, requireCapability } from '@/lib/auth/session';
import { farmerListSchema } from '@/lib/server/rpc-schemas';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { statusTone } from './status';

export const metadata: Metadata = { title: 'Farmers' };

type Search = Record<string, string | undefined>;

export default async function FarmersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireCapability('viewFarmers');
  const raw = await searchParams;
  const query = farmerListQuerySchema.parse({
    ...raw,
    status: raw.status || undefined,
    search: raw.search || undefined,
    district: raw.district || undefined,
    locality: raw.locality || undefined,
  });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_list_farmers', {
    p_search: query.search,
    p_status: query.status,
    p_district: query.district,
    p_locality: query.locality,
    p_sort: query.sort,
    p_page: query.page,
    p_page_size: query.pageSize,
  });
  const parsed = farmerListSchema.safeParse(data);

  const hrefFor = (page: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...raw, page: String(page) }))
      if (value) params.set(key, value);
    return `/farmers?${params.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Farmers"
        description="Registered farmers. Deactivated farmers keep their history."
        actions={
          can(session, 'manageFarmers') ? (
            <Link href="/farmers/new" className={buttonClass('primary')}>
              Register farmer
            </Link>
          ) : null
        }
      />

      <form
        method="get"
        className="mb-4 grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-6"
      >
        <input
          name="search"
          defaultValue={query.search}
          placeholder={can(session, 'viewFarmerPhotos') ? 'Name, code or phone' : 'Name or code'}
          aria-label="Search farmers"
          className={`${inputClass} sm:col-span-2`}
        />
        <select
          name="status"
          defaultValue={query.status ?? ''}
          aria-label="Status"
          className={inputClass}
        >
          <option value="">All statuses</option>
          {SUPPLIER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {SUPPLIER_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <input
          name="district"
          defaultValue={query.district}
          placeholder="District"
          aria-label="District"
          className={inputClass}
        />
        <input
          name="locality"
          defaultValue={query.locality}
          placeholder="Village / mandal"
          aria-label="Locality"
          className={inputClass}
        />
        <div className="flex gap-2">
          <select name="sort" defaultValue={query.sort} aria-label="Sort" className={inputClass}>
            <option value="name">Name</option>
            <option value="code">Code</option>
            <option value="recent">Recently updated</option>
            <option value="last_supply">Last supply update</option>
          </select>
          <button type="submit" className={buttonClass('secondary')}>
            Apply
          </button>
        </div>
      </form>

      {error || !parsed.success ? (
        <Alert tone="danger" title="Farmers could not be loaded.">
          Reload the page to try again.
        </Alert>
      ) : parsed.data.items.length === 0 ? (
        <EmptyState title="No farmers found">
          {query.search || query.status
            ? 'Try different filters.'
            : 'Register the first farmer to get started.'}
        </EmptyState>
      ) : (
        <>
          <Table caption="Farmers">
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>Primary contact</Th>
                <Th>Location</Th>
                <Th>Products (current/future supply)</Th>
                <Th>Status</Th>
                <Th>Verified</Th>
                <Th>Last supply update</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {parsed.data.items.map((f) => (
                <tr key={f.id}>
                  <Td>
                    <Link
                      className="font-mono text-xs text-brand-700 hover:underline"
                      href={`/farmers/${f.id}` as Route}
                    >
                      {f.supplierCode}
                    </Link>
                  </Td>
                  <Td>
                    <Link className="hover:underline" href={`/farmers/${f.id}` as Route}>
                      {f.name}
                    </Link>
                  </Td>
                  <Td className="font-mono text-xs">{f.primaryPhone ?? '—'}</Td>
                  <Td>
                    {[f.villageLocality, f.mandal, f.district].filter(Boolean).join(', ') || '—'}
                  </Td>
                  <Td>{f.productsSupplied.length ? f.productsSupplied.join(', ') : '—'}</Td>
                  <Td>
                    <Badge tone={statusTone(f.status)}>{SUPPLIER_STATUS_LABELS[f.status]}</Badge>
                  </Td>
                  <Td>{f.verifiedAt ? formatDateTimeIst(f.verifiedAt) : 'Not verified'}</Td>
                  <Td>{formatDateTimeIst(f.lastSupplyUpdateAt)}</Td>
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
