'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ConfirmDialog, SubmitButton } from '@/components/ui/client';
import { Alert, buttonClass, Field, inputClass } from '@/components/ui/primitives';
import { changeSupplyStatus, updateSupply } from './actions';

/** Edit quantity / deactivate / reactivate one supply record (reason + version). */
export function SupplyRowActions({
  id,
  version,
  status,
  quantity,
  unit,
  expired,
}: {
  id: string;
  version: number;
  status: 'active' | 'inactive';
  quantity: string;
  unit: string;
  expired: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newQuantity, setNewQuantity] = useState(quantity);
  const [reason, setReason] = useState('');

  const run = (
    fn: () => Promise<{
      ok: boolean;
      error?: { message: string; fieldErrors?: { message: string }[] };
    }>,
    close: () => void,
  ) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        close();
        setReason('');
        router.refresh();
      } else {
        setError(
          result.error?.fieldErrors?.[0]?.message ?? result.error?.message ?? 'Could not save.',
        );
      }
    });
  };

  return (
    <div className="flex flex-wrap gap-1">
      {status === 'active' && !expired ? (
        <ConfirmDialog triggerLabel="Edit" title="Update farmer-confirmed quantity">
          {(close) => (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                run(
                  () =>
                    updateSupply({
                      id,
                      expectedVersion: version,
                      quantity: newQuantity.trim(),
                      reason,
                    }),
                  close,
                );
              }}
            >
              {error ? <Alert tone="danger">{error}</Alert> : null}
              <Field
                label={`Quantity (${unit})`}
                htmlFor={`qty-${id}`}
                required
                hint="Zero is allowed with a reason."
              >
                <input
                  id={`qty-${id}`}
                  inputMode="decimal"
                  className={inputClass}
                  value={newQuantity}
                  onChange={(e) => setNewQuantity(e.target.value)}
                />
              </Field>
              <Field label="Reason for change" htmlFor={`reason-edit-${id}`} required>
                <input
                  id={`reason-edit-${id}`}
                  className={inputClass}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <div className="flex justify-end gap-2">
                <button type="button" className={buttonClass('secondary')} onClick={close}>
                  Cancel
                </button>
                <SubmitButton pending={pending}>Save</SubmitButton>
              </div>
            </form>
          )}
        </ConfirmDialog>
      ) : null}
      <ConfirmDialog
        triggerLabel={status === 'active' ? 'Deactivate' : 'Reactivate'}
        triggerVariant={status === 'active' ? 'danger' : 'secondary'}
        title={status === 'active' ? 'Deactivate supply record' : 'Reactivate supply record'}
      >
        {(close) => (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () =>
                  changeSupplyStatus({
                    id,
                    expectedVersion: version,
                    status: status === 'active' ? 'inactive' : 'active',
                    reason,
                  }),
                close,
              );
            }}
          >
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Field label="Reason" htmlFor={`reason-status-${id}`} required>
              <input
                id={`reason-status-${id}`}
                className={inputClass}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" className={buttonClass('secondary')} onClick={close}>
                Cancel
              </button>
              <SubmitButton pending={pending} variant={status === 'active' ? 'danger' : 'primary'}>
                Confirm
              </SubmitButton>
            </div>
          </form>
        )}
      </ConfirmDialog>
    </div>
  );
}
