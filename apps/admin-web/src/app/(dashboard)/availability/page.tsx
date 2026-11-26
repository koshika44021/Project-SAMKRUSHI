import { formatBusinessDate, formatInr } from '@samkrushi/shared';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { BusinessDatePicker } from '@/components/business-date-picker';
import {
  Alert,
  Badge,
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
import { can, requireStaff } from '@/lib/auth/session';
import { resolveBusinessDate } from '@/lib/server/business-date';
import { productAvailabilitySchema, supplyListSchema } from '@/lib/server/rpc-schemas';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SupplyRowActions } from './supply-row-actions';

export const metadata: Metadata = { title: 'Products & Availability' };

const STATUS_TONE = { available: 'success', limited: 'warning', unavailable: 'neutral' } as const;

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    product?: string;
    status?: string;
    page?: string;
    saved?: string;
  }>;
}) {
  const session = await requireStaff();
  const raw = await searchParams;
  const { selected, today } = resolveBusinessDate(raw.date);
  const supabase = await createSupabaseServerClient();
  const viewSupply = can(session, 'viewSupply');
  const manageSupply = can(session, 'manageSupply');

  if (!viewSupply && !can(session, 'viewCatalog')) {
    return <EmptyState title="Products & Availability is not available for your role" />;
  }

  // Catalog-only roles (finance, support) see the seeded catalog without supply data.
  if (!viewSupply) {
    const { data: products } = await supabase
      .from('products')
      .select(
        'id, product_code, name, base_unit, is_active, is_listable, product_skus(id, sku_code, label, pack_quantity, sale_unit, price_paise, is_active)',
      )
      .order('display_order');
    return (
      <>
        <PageHeader
          title="Products"
          description="Predefined catalog. Farmer supply is not visible for your role."
        />
        <Table caption="Catalog">
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Product</Th>
              <Th>Base unit</Th>
              <Th>Packs</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(products ?? []).map((p) => (
              <tr key={p.id}>
                <Td className="font-mono text-xs">{p.product_code}</Td>
                <Td>{p.name}</Td>
                <Td>{p.base_unit}</Td>
                <Td>
                  {p.product_skus.map((k) => `${k.label} · ${formatInr(k.price_paise)}`).join('; ')}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </>
    );
  }

  const page = Math.max(1, Number(raw.page) || 1);
  const [{ data: availability, error: availabilityError }, { data: supply }, { data: products }] =
    await Promise.all([
      supabase.rpc('admin_product_availability', { p_business_date: selected }),
      supabase.rpc('admin_list_supply', {
        p_business_date: selected,
        ...(raw.product ? { p_product_id: raw.product } : {}),
        ...(raw.status === 'active' || raw.status === 'inactive' ? { p_status: raw.status } : {}),
        p_page: page,
        p_page_size: 25,
      }),
      supabase.from('products').select('id, name').eq('is_active', true).order('display_order'),
    ]);
  const avail = productAvailabilitySchema.safeParse(availability);
  const supplyList = supplyListSchema.safeParse(supply);

  return (
    <>
      <PageHeader
        title="Products & Availability"
        description="Farmer-confirmed supply and the resulting sellable quantity per product. Not warehouse stock."
        actions={
          manageSupply ? (
            <Link
              href={`/availability/supply/new?date=${selected}` as Route}
              className={buttonClass('primary')}
            >
              Add farmer-confirmed supply
            </Link>
          ) : null
        }
      />
      <BusinessDatePicker selected={selected} today={today} />
      {raw.saved ? (
        <div className="mb-4">
          <Alert tone="success">Supply recorded.</Alert>
        </div>
      ) : null}

      <Card title={`Available to list — ${formatBusinessDate(selected)}`} className="mb-6">
        {availabilityError || !avail.success ? (
          <Alert tone="danger">Availability could not be loaded.</Alert>
        ) : (
          <Table caption="Availability by product">
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Farmer-confirmed supply</Th>
                <Th>Sellable quantity</Th>
                <Th>Farmers</Th>
                <Th>Packs (max orderable)</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {avail.data.map((p) => (
                <tr key={p.productId} data-testid={`availability-${p.productCode}`}>
                  <Td>
                    {p.name}
                    <span className="block text-xs text-slate-500">
                      {p.categoryName}
                      {p.isListable ? '' : ' · not listable'}
                    </span>
                  </Td>
                  <Td>
                    {p.farmerConfirmedSupply} {p.baseUnit}
                  </Td>
                  <Td>
                    <span data-testid={`sellable-${p.productCode}`}>
                      {p.sellableQuantity} {p.baseUnit}
                    </span>
                    {p.lowSupplyThreshold ? (
                      <span className="block text-xs text-slate-500">
                        low at ≤ {p.lowSupplyThreshold} {p.baseUnit}
                      </span>
                    ) : null}
                  </Td>
                  <Td>{p.contributingFarmers}</Td>
                  <Td>
                    <ul className="space-y-0.5">
                      {p.skus.map((k) => (
                        <li key={k.skuId} className="flex items-center gap-2 text-xs">
                          <span className="font-mono">{k.skuCode}</span>
                          <Badge tone={STATUS_TONE[k.availabilityStatus]}>
                            {k.availabilityStatus} · {k.maxOrderable}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Sellable quantity = active, unexpired farmer-confirmed supply from active farmers for this
          date (MVP rule). Each product keeps its own unit.
        </p>
      </Card>

      <Card title="Farmer-confirmed supply records">
        <form method="get" className="mb-3 flex flex-wrap gap-2">
          <input type="hidden" name="date" value={selected} />
          <select
            name="product"
            defaultValue={raw.product ?? ''}
            aria-label="Product"
            className={`${inputClass} w-auto`}
          >
            <option value="">All products</option>
            {(products ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={raw.status ?? ''}
            aria-label="Status"
            className={`${inputClass} w-auto`}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button type="submit" className={buttonClass('secondary')}>
            Filter
          </button>
        </form>
        {!supplyList.success || supplyList.data.items.length === 0 ? (
          <EmptyState title="No supply records for this date" />
        ) : (
          <>
            <Table caption="Supply records">
              <thead>
                <tr>
                  <Th>Farmer</Th>
                  <Th>Product</Th>
                  <Th>Quantity</Th>
                  <Th>Confirmation</Th>
                  <Th>Status</Th>
                  <Th>Last change</Th>
                  {manageSupply ? <Th>Actions</Th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {supplyList.data.items.map((s) => (
                  <tr key={s.id}>
                    <Td>
                      <Link className="hover:underline" href={`/farmers/${s.supplierId}` as Route}>
                        {s.supplierName}
                      </Link>
                      <span className="block font-mono text-xs text-slate-500">
                        {s.supplierCode}
                      </span>
                    </Td>
                    <Td>{s.productName}</Td>
                    <Td data-testid={`supply-qty-${s.id}`}>
                      {s.quantity} {s.unit}
                    </Td>
                    <Td>
                      {s.confirmationSource} · {s.confirmedByName ?? '—'}
                      <span className="block text-xs text-slate-500">
                        {formatDateTimeIst(s.confirmedAt)}
                      </span>
                      {s.hasEvidence ? (
                        manageSupply ? (
                          <a
                            className="text-xs text-brand-700 hover:underline"
                            href={`/availability/evidence/${s.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid={`evidence-${s.id}`}
                          >
                            View evidence
                          </a>
                        ) : (
                          <span className="block text-xs text-slate-500">Evidence attached</span>
                        )
                      ) : null}
                    </Td>
                    <Td>
                      {s.status === 'inactive' ? (
                        <Badge>Inactive</Badge>
                      ) : s.supplierStatus !== 'active' ? (
                        <Badge tone="warning">Farmer not active</Badge>
                      ) : s.isExpired ? (
                        <Badge tone="warning">Expired</Badge>
                      ) : (
                        <Badge tone="success">Active</Badge>
                      )}
                    </Td>
                    <Td>
                      {s.changeReason ?? '—'}
                      <span className="block text-xs text-slate-500">
                        {formatDateTimeIst(s.updatedAt)}
                      </span>
                    </Td>
                    {manageSupply ? (
                      <Td>
                        <SupplyRowActions
                          id={s.id}
                          version={s.version}
                          status={s.status}
                          quantity={s.quantity}
                          unit={s.unit}
                          expired={s.isExpired}
                        />
                      </Td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={supplyList.data.pagination.page}
              totalPages={supplyList.data.pagination.totalPages}
              totalItems={supplyList.data.pagination.totalItems}
              hrefFor={(p) =>
                `/availability?date=${selected}&page=${p}${raw.product ? `&product=${raw.product}` : ''}${raw.status ? `&status=${raw.status}` : ''}`
              }
            />
          </>
        )}
      </Card>
    </>
  );
}
