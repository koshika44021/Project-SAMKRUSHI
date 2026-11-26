import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Alert, Card, PageHeader } from '@/components/ui/primitives';
import { requireCapability } from '@/lib/auth/session';
import { purchaseOrderDetailSchema } from '@/lib/server/inventory-schemas';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { GoodsReceiptForm } from '../../../_inventory/forms';

export const metadata: Metadata = { title: 'Receive goods' };

export default async function ReceiveGoodsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability('manageInventory');
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_get_purchase_order', { p_po_id: id });
  if (error?.code === 'PT404' || error?.code === '22P02') notFound();
  const parsed = purchaseOrderDetailSchema.safeParse(data);
  if (error || !parsed.success) {
    return <Alert tone="danger">The purchase order could not be loaded. Reload the page.</Alert>;
  }
  const po = parsed.data;
  const receivable = po.status === 'sent' || po.status === 'partially_received';

  return (
    <>
      <PageHeader
        title={`Receive goods — ${po.poNumber}`}
        breadcrumb={[
          { label: 'Procurement', href: '/procurement' },
          { label: po.poNumber, href: `/procurement/${po.id}` },
          { label: 'Receive' },
        ]}
        description={`${po.supplierName} (${po.supplierCode})`}
      />
      <Card>
        {receivable ? (
          <GoodsReceiptForm
            purchaseOrderId={po.id}
            lines={po.lines.map((line) => ({
              poLineId: line.id,
              productName: line.productName,
              unit: line.unit,
              orderedQuantity: line.orderedQuantity,
              remainingQuantity: line.remainingQuantity,
            }))}
          />
        ) : (
          <Alert tone="warning">
            Goods can be received only against a sent or partially received purchase order.
          </Alert>
        )}
      </Card>
    </>
  );
}
