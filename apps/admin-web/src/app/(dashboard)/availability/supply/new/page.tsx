import type { Metadata } from 'next';
import { Alert, PageHeader } from '@/components/ui/primitives';
import { requireCapability } from '@/lib/auth/session';
import { resolveBusinessDate } from '@/lib/server/business-date';
import { farmerListSchema } from '@/lib/server/rpc-schemas';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SupplyForm } from './supply-form';

export const metadata: Metadata = { title: 'Add farmer-confirmed supply' };

export default async function NewSupplyPage({
  searchParams,
}: {
  searchParams: Promise<{ supplierId?: string; date?: string }>;
}) {
  await requireCapability('manageSupply');
  const { supplierId, date } = await searchParams;
  const { selected, today } = resolveBusinessDate(date);
  const supabase = await createSupabaseServerClient();

  const [{ data: farmers }, { data: products }, { data: sources }, { data: units }] =
    await Promise.all([
      supabase.rpc('admin_list_farmers', { p_status: 'active', p_page_size: 100, p_sort: 'name' }),
      supabase
        .from('products')
        .select('id, name, product_code, base_unit, quantity_precision')
        .eq('is_active', true)
        .order('display_order'),
      supabase
        .from('supply_confirmation_sources')
        .select('code, label')
        .eq('is_active', true)
        .order('display_order'),
      supabase.from('units').select('code, dimension, to_canonical_factor').eq('is_active', true),
    ]);
  const farmerList = farmerListSchema.safeParse(farmers);

  return (
    <>
      <PageHeader
        title="Add farmer-confirmed supply"
        breadcrumb={[
          { label: 'Products & Availability', href: '/availability' },
          { label: 'Add supply' },
        ]}
        description="Only active farmers and predefined catalog products can be selected. Quantities never carry forward to another date."
      />
      {!sources?.length ? (
        <Alert tone="warning" title="No confirmation sources are configured">
          Ask a super admin to configure the approved list of supply confirmation sources.
        </Alert>
      ) : (
        <SupplyForm
          today={today}
          defaultDate={selected < today ? today : selected}
          defaultSupplierId={supplierId ?? ''}
          farmers={(farmerList.success ? farmerList.data.items : []).map((f) => ({
            id: f.id,
            label: `${f.name} (${f.supplierCode})`,
          }))}
          farmerListTruncated={
            farmerList.success &&
            farmerList.data.pagination.totalItems > farmerList.data.items.length
          }
          products={(products ?? []).map((p) => ({
            id: p.id,
            label: p.name,
            baseUnit: p.base_unit,
            precision: p.quantity_precision,
          }))}
          sources={(sources ?? []).map((s) => ({ code: s.code, label: s.label }))}
          units={(units ?? []).map((u) => ({
            code: u.code,
            dimension: u.dimension,
            convertible: u.to_canonical_factor !== null,
          }))}
        />
      )}
    </>
  );
}
