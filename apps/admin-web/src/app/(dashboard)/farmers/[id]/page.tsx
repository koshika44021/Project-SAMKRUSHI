import { formatBusinessDate, SUPPLIER_STATUS_LABELS } from '@samkrushi/shared';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Alert,
  Badge,
  buttonClass,
  Card,
  formatDateTimeIst,
  PageHeader,
  Table,
  Td,
  Th,
} from '@/components/ui/primitives';
import { can, requireCapability } from '@/lib/auth/session';
import { farmerDetailSchema, supplyListSchema } from '@/lib/server/rpc-schemas';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { statusTone } from '../status';
import { FarmerPhotoUpload, FarmerStatusActions } from './farmer-actions';

export const metadata: Metadata = { title: 'Farmer' };

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{value || '—'}</dd>
    </div>
  );
}

export default async function FarmerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; photo_failed?: string }>;
}) {
  const session = await requireCapability('viewFarmers');
  const { id } = await params;
  const { saved, photo_failed: photoFailed } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('admin_get_farmer', { p_supplier_id: id });
  const parsed = farmerDetailSchema.safeParse(data);
  if (error || !parsed.success) notFound();
  const f = parsed.data;

  // Photo: only roles allowed to see photos get a short-lived signed URL.
  let photoUrl: string | null = null;
  if (f.hasPhoto && f.canViewPhoto) {
    const { data: key } = await supabase.rpc('admin_farmer_photo_key', { p_supplier_id: f.id });
    if (typeof key === 'string') {
      const { data: signed } = await createSupabaseAdminClient()
        .storage.from('farmer-photos')
        .createSignedUrl(key, 60);
      photoUrl = signed?.signedUrl ?? null;
    }
  }

  const supply = can(session, 'viewSupply')
    ? supplyListSchema.safeParse(
        (await supabase.rpc('admin_list_supply', { p_supplier_id: f.id, p_page_size: 50 })).data,
      )
    : null;
  const manage = can(session, 'manageFarmers');

  return (
    <>
      <PageHeader
        title={f.name}
        breadcrumb={[{ label: 'Farmers', href: '/farmers' }, { label: f.supplierCode }]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs" data-testid="farmer-code">
              {f.supplierCode}
            </span>
            <Badge tone={statusTone(f.status)}>{SUPPLIER_STATUS_LABELS[f.status]}</Badge>
          </span>
        }
        actions={
          manage ? (
            <>
              <Link href={`/farmers/${f.id}/edit` as Route} className={buttonClass('secondary')}>
                Edit
              </Link>
              {f.status === 'active' && can(session, 'manageSupply') ? (
                <Link
                  href={`/availability/supply/new?supplierId=${f.id}` as Route}
                  className={buttonClass('primary')}
                >
                  Add supply
                </Link>
              ) : null}
            </>
          ) : null
        }
      />
      <div className="space-y-6">
        {saved ? <Alert tone="success">Saved.</Alert> : null}
        {photoFailed ? (
          <Alert tone="warning">The farmer was saved but the photo was not. Upload it below.</Alert>
        ) : null}
        {f.status === 'inactive' ? (
          <Alert tone="warning" title="This farmer is inactive">
            Deactivated {formatDateTimeIst(f.deactivatedAt)}: {f.deactivationReason}. New supply
            cannot be recorded; history is kept.
          </Alert>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Profile" className="lg:col-span-2">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label="Primary contact" value={f.primaryPhone} />
              <Detail label="Secondary contact" value={f.secondaryPhone} />
              <Detail label="Address" value={f.addressLine} />
              <Detail label="Village / locality" value={f.villageLocality} />
              <Detail label="Mandal" value={f.mandal} />
              <Detail label="District" value={f.district} />
              <Detail label="State" value={f.state} />
              <Detail label="PIN code" value={f.pinCode} />
              <Detail
                label="Land area"
                value={f.landAreaValue ? `${f.landAreaValue} ${f.landAreaUnit ?? ''}s` : null}
              />
              <Detail
                label="Verified"
                value={f.verifiedAt ? formatDateTimeIst(f.verifiedAt) : 'Not verified'}
              />
              <Detail label="Registered" value={formatDateTimeIst(f.createdAt)} />
              <Detail label="Last updated" value={formatDateTimeIst(f.updatedAt)} />
            </dl>
            {f.notes ? (
              <p className="mt-4 text-sm whitespace-pre-line text-slate-700">{f.notes}</p>
            ) : null}
            {f.phoneMasked ? (
              <p className="mt-4 text-xs text-slate-500">Phone numbers are masked for your role.</p>
            ) : null}
          </Card>
          <Card title="Photo">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimisable
              <img
                src={photoUrl}
                alt={`Photo of ${f.name}`}
                className="w-full rounded-md object-cover"
                data-testid="farmer-photo"
              />
            ) : (
              <p className="text-sm text-slate-600">
                {f.hasPhoto
                  ? f.canViewPhoto
                    ? 'Photo unavailable.'
                    : 'Photos are hidden for your role.'
                  : 'No photo uploaded.'}
              </p>
            )}
            {manage ? <FarmerPhotoUpload supplierId={f.id} /> : null}
          </Card>
        </div>

        {manage ? (
          <Card title="Status">
            <FarmerStatusActions id={f.id} version={f.version} status={f.status} />
          </Card>
        ) : null}

        {supply ? (
          <Card title="Farmer-confirmed supply">
            {supply.success && supply.data.items.length ? (
              <Table caption="Supply records for this farmer">
                <thead>
                  <tr>
                    <Th>Business date</Th>
                    <Th>Product</Th>
                    <Th>Quantity</Th>
                    <Th>Source</Th>
                    <Th>Confirmed by / at</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {supply.data.items.map((s) => (
                    <tr key={s.id}>
                      <Td>{formatBusinessDate(s.businessDate)}</Td>
                      <Td>{s.productName}</Td>
                      <Td>
                        {s.quantity} {s.unit}
                      </Td>
                      <Td>{s.confirmationSource}</Td>
                      <Td>
                        {s.confirmedByName ?? '—'}
                        <span className="block text-xs text-slate-500">
                          {formatDateTimeIst(s.confirmedAt)}
                        </span>
                      </Td>
                      <Td>
                        {s.status === 'inactive' ? (
                          <Badge>Inactive</Badge>
                        ) : s.isExpired ? (
                          <Badge tone="warning">Expired</Badge>
                        ) : (
                          <Badge tone="success">Active</Badge>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="text-sm text-slate-600">No supply recorded for this farmer.</p>
            )}
          </Card>
        ) : null}
      </div>
    </>
  );
}
