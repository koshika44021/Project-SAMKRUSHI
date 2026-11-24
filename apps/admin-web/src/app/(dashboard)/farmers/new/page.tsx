import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/primitives';
import { requireCapability } from '@/lib/auth/session';
import { FarmerForm } from '../farmer-form';

export const metadata: Metadata = { title: 'Register farmer' };

export default async function NewFarmerPage() {
  await requireCapability('manageFarmers');
  return (
    <>
      <PageHeader
        title="Register farmer"
        breadcrumb={[{ label: 'Farmers', href: '/farmers' }, { label: 'Register' }]}
        description="A unique farmer code is generated automatically."
      />
      <FarmerForm
        mode="create"
        defaults={{
          name: '',
          addressLine: '',
          villageLocality: '',
          mandal: '',
          district: '',
          state: '',
          pinCode: '',
          primaryPhone: '',
          secondaryPhone: '',
          landAreaValue: '',
          landAreaUnit: '',
          notes: '',
        }}
      />
    </>
  );
}
