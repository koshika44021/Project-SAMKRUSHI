import type { Metadata, Route } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/primitives';
import { requireCapability } from '@/lib/auth/session';
import { farmerDetailSchema } from '@/lib/server/rpc-schemas';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { FarmerForm } from '../../farmer-form';

export const metadata: Metadata = { title: 'Edit farmer' };

export default async function EditFarmerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability('manageFarmers');
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_get_farmer', { p_supplier_id: id });
  const parsed = farmerDetailSchema.safeParse(data);
  if (error || !parsed.success) notFound();
  const f = parsed.data;

  return (
    <>
      <PageHeader
        title={`Edit ${f.name}`}
        breadcrumb={[
          { label: 'Farmers', href: '/farmers' },
          { label: f.supplierCode, href: `/farmers/${f.id}` as Route },
          { label: 'Edit' },
        ]}
      />
      <FarmerForm
        mode="edit"
        defaults={{
          id: f.id,
          expectedVersion: f.version,
          name: f.name,
          addressLine: f.addressLine ?? '',
          villageLocality: f.villageLocality ?? '',
          mandal: f.mandal ?? '',
          district: f.district ?? '',
          state: f.state ?? '',
          pinCode: f.pinCode ?? '',
          primaryPhone: f.primaryPhone ?? '',
          secondaryPhone: f.secondaryPhone ?? '',
          landAreaValue: f.landAreaValue ?? '',
          landAreaUnit: f.landAreaUnit ?? '',
          notes: f.notes ?? '',
        }}
      />
    </>
  );
}
