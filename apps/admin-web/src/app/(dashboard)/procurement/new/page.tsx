import type { Metadata } from 'next';
import { Alert, Card, PageHeader } from '@/components/ui/primitives';
import { requireCapability } from '@/lib/auth/session';
import { resolveBusinessDate } from '@/lib/server/business-date';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PurchaseOrderForm } from '../../_inventory/forms';

export const metadata: Metadata = { title: 'New purchase order' };

export default async function NewPurchaseOrderPage() {
  await requireCapability('manageInventory');
  const { today } = resolveBusinessDate(undefined);
  const supabase = await createSupabaseServerClient();
  const [suppliers, products] = await Promise.all([
    supabase
      .from('suppliers')
      .select('id, name, supplier_code')
      .eq('status', 'active')
      .order('name')
      .limit(500),
    supabase
      .from('products')
      .select('id, name, product_code, base_unit')
      .eq('is_active', true)
      .order('display_order')
      .order('name')
      .limit(500),
  ]);

  return (
    <>
      <PageHeader
        title="New purchase order"
        breadcrumb={[{ label: 'Procurement', href: '/procurement' }, { label: 'New' }]}
        description="Quantities are in each product's base unit. Agreed costs are optional and recorded per order."
      />
      <Card>
        {suppliers.error || products.error ? (
          <Alert tone="danger">Farmers or products could not be loaded. Reload the page.</Alert>
        ) : (
          <PurchaseOrderForm
            defaultExpectedDate={today}
            suppliers={(suppliers.data ?? []).map((s) => ({
              id: s.id,
              name: s.name,
              supplierCode: s.supplier_code,
            }))}
            products={(products.data ?? []).map((p) => ({
              id: p.id,
              name: p.name,
              productCode: p.product_code,
              baseUnit: p.base_unit,
            }))}
          />
        )}
      </Card>
    </>
  );
}
