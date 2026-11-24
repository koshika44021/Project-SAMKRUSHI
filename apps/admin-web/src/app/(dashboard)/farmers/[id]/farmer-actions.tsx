'use client';

import { PHOTO_UPLOAD_RULES, SUPPLIER_STATUS_LABELS, type SupplierStatus } from '@samkrushi/shared';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ConfirmDialog, SubmitButton } from '@/components/ui/client';
import { Alert, buttonClass, Field, inputClass } from '@/components/ui/primitives';
import { changeFarmerStatus, replaceFarmerPhoto } from '../actions';

const TARGETS: Record<SupplierStatus, SupplierStatus[]> = {
  active: ['inactive', 'suspended'],
  pending_verification: ['active', 'inactive'],
  suspended: ['active', 'inactive'],
  inactive: ['active'],
};

export function FarmerStatusActions({
  id,
  version,
  status,
}: {
  id: string;
  version: number;
  status: SupplierStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  return (
    <div className="flex flex-wrap gap-2">
      {TARGETS[status].map((target) => (
        <ConfirmDialog
          key={target}
          triggerLabel={
            target === 'active' ? 'Activate' : target === 'inactive' ? 'Deactivate' : 'Suspend'
          }
          triggerVariant={target === 'active' ? 'primary' : 'danger'}
          title={`Change status to ${SUPPLIER_STATUS_LABELS[target]}`}
        >
          {(close) => (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                setError(null);
                startTransition(async () => {
                  const result = await changeFarmerStatus({
                    id,
                    expectedVersion: version,
                    status: target,
                    reason,
                  });
                  if (result.ok) {
                    close();
                    setReason('');
                    router.refresh();
                  } else {
                    setError(result.error.fieldErrors?.[0]?.message ?? result.error.message);
                  }
                });
              }}
            >
              {target !== 'active' ? (
                <p className="text-sm text-slate-600">
                  The farmer will be excluded from availability. Existing records and history are
                  kept.
                </p>
              ) : null}
              {error ? <Alert tone="danger">{error}</Alert> : null}
              <Field label="Reason" htmlFor={`reason-${target}`} required>
                <input
                  id={`reason-${target}`}
                  className={inputClass}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <div className="flex justify-end gap-2">
                <button type="button" className={buttonClass('secondary')} onClick={close}>
                  Cancel
                </button>
                <SubmitButton
                  pending={pending}
                  variant={target === 'active' ? 'primary' : 'danger'}
                >
                  Confirm
                </SubmitButton>
              </div>
            </form>
          )}
        </ConfirmDialog>
      ))}
    </div>
  );
}

export function FarmerPhotoUpload({ supplierId }: { supplierId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  return (
    <form
      className="mt-4 space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        formData.set('supplierId', supplierId);
        setMessage(null);
        startTransition(async () => {
          const result = await replaceFarmerPhoto(formData);
          if (result.ok) {
            setMessage({ tone: 'success', text: 'Photo updated.' });
            router.refresh();
          } else {
            setMessage({ tone: 'danger', text: result.error.message });
          }
        });
      }}
    >
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      <label htmlFor="replace-photo" className="block text-xs font-medium text-slate-600">
        Upload new photo (JPEG, PNG or WebP, up to {PHOTO_UPLOAD_RULES.maxBytes / (1024 * 1024)} MB)
      </label>
      <input
        id="replace-photo"
        name="photo"
        type="file"
        accept={PHOTO_UPLOAD_RULES.allowedMimeTypes.join(',')}
        className="block text-sm"
      />
      <SubmitButton pending={pending} variant="secondary">
        Upload photo
      </SubmitButton>
    </form>
  );
}
