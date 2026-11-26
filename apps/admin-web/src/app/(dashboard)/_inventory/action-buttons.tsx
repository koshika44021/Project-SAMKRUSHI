'use client';

import { MANUAL_MOVEMENT_TYPES, MOVEMENT_TYPE_LABELS } from '@samkrushi/shared';
import { useRouter } from 'next/navigation';
import { type ReactNode, useState, useTransition } from 'react';
import { ConfirmDialog, SubmitButton } from '@/components/ui/client';
import { Alert, buttonClass, Field, inputClass } from '@/components/ui/primitives';
import {
  adjustStock,
  cancelGoodsReceipt,
  changeBatchStatus,
  changePurchaseOrderStatus,
  createRecall,
  postGoodsReceipt,
  resolveException,
} from './actions';

type Result = {
  ok: boolean;
  message?: string;
  error?: { message: string; fieldErrors?: { message: string }[] };
};

/** Runs a server action, shows its error, refreshes server data on success. */
function useRunner() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<Result>, onDone: () => void) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        onDone();
        router.refresh();
      } else {
        setError(
          result.error?.fieldErrors?.[0]?.message ?? result.error?.message ?? 'Could not save.',
        );
      }
    });
  };
  return { pending, error, run };
}

/** Confirmation dialog with an optional mandatory reason (WEB_ADMIN §4). */
function ReasonDialog({
  id,
  triggerLabel,
  title,
  variant = 'secondary',
  reasonLabel = 'Reason',
  needsReason = true,
  confirmLabel = 'Confirm',
  description,
  submit,
}: {
  id: string;
  triggerLabel: string;
  title: string;
  variant?: 'primary' | 'secondary' | 'danger';
  reasonLabel?: string;
  needsReason?: boolean;
  confirmLabel?: string;
  description?: ReactNode;
  submit: (reason: string) => Promise<Result>;
}) {
  const { pending, error, run } = useRunner();
  const [reason, setReason] = useState('');
  return (
    <ConfirmDialog triggerLabel={triggerLabel} triggerVariant={variant} title={title}>
      {(close) => (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            run(
              () => submit(reason),
              () => {
                setReason('');
                close();
              },
            );
          }}
        >
          {description ? <div className="text-sm text-slate-700">{description}</div> : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {needsReason ? (
            <Field label={reasonLabel} htmlFor={`${id}-reason`} required>
              <input
                id={`${id}-reason`}
                className={inputClass}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          ) : null}
          <div className="flex justify-end gap-2">
            <button type="button" className={buttonClass('secondary')} onClick={close}>
              Back
            </button>
            <SubmitButton pending={pending} variant={variant === 'danger' ? 'danger' : 'primary'}>
              {confirmLabel}
            </SubmitButton>
          </div>
        </form>
      )}
    </ConfirmDialog>
  );
}

export function PurchaseOrderActions({
  id,
  version,
  status,
}: {
  id: string;
  version: number;
  status: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {status === 'draft' ? (
        <ReasonDialog
          id={`po-send-${id}`}
          triggerLabel="Mark as sent"
          title="Mark purchase order as sent"
          variant="primary"
          needsReason={false}
          description="Goods can be received only after the order is sent. Sending does not change stock."
          submit={() => changePurchaseOrderStatus({ id, expectedVersion: version, action: 'send' })}
        />
      ) : null}
      {status === 'partially_received' ? (
        <ReasonDialog
          id={`po-close-${id}`}
          triggerLabel="Close short"
          title="Close purchase order short"
          description="The remaining quantity will not be received. Open farmer supply for these lines stays as recorded."
          submit={(reason) =>
            changePurchaseOrderStatus({ id, expectedVersion: version, action: 'close', reason })
          }
        />
      ) : null}
      {status === 'draft' || status === 'sent' ? (
        <ReasonDialog
          id={`po-cancel-${id}`}
          triggerLabel="Cancel order"
          title="Cancel purchase order"
          variant="danger"
          submit={(reason) =>
            changePurchaseOrderStatus({ id, expectedVersion: version, action: 'cancel', reason })
          }
        />
      ) : null}
    </div>
  );
}

export function ReceiptActions({ id, version }: { id: string; version: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ReasonDialog
        id={`grn-post-${id}`}
        triggerLabel="Post receipt"
        title="Post goods receipt"
        variant="primary"
        needsReason={false}
        confirmLabel="Post"
        description="Posting creates a batch for each accepted quantity and converts farmer-confirmed supply into stock. It cannot be undone; later corrections are stock movements."
        submit={() => postGoodsReceipt({ id, expectedVersion: version })}
      />
      <ReasonDialog
        id={`grn-cancel-${id}`}
        triggerLabel="Cancel receipt"
        title="Cancel draft receipt"
        variant="danger"
        submit={(reason) => cancelGoodsReceipt({ id, expectedVersion: version, reason })}
      />
    </div>
  );
}

export function BatchActions({
  batchId,
  version,
  status,
  unit,
}: {
  batchId: string;
  version: number;
  status: string;
  unit: string;
}) {
  const { pending, error, run } = useRunner();
  const [movementType, setMovementType] =
    useState<(typeof MANUAL_MOVEMENT_TYPES)[number]>('wastage');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');

  return (
    <div className="flex flex-wrap gap-2">
      {status !== 'recalled' ? (
        <ConfirmDialog triggerLabel="Record movement" title="Record a stock movement">
          {(close) => (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                run(
                  () => adjustStock({ batchId, movementType, quantity: quantity.trim(), reason }),
                  () => {
                    setQuantity('');
                    setReason('');
                    close();
                  },
                );
              }}
            >
              {error ? <Alert tone="danger">{error}</Alert> : null}
              <Field label="Movement" htmlFor={`mv-type-${batchId}`} required>
                <select
                  id={`mv-type-${batchId}`}
                  className={inputClass}
                  value={movementType}
                  onChange={(event) =>
                    setMovementType(event.target.value as (typeof MANUAL_MOVEMENT_TYPES)[number])
                  }
                >
                  {MANUAL_MOVEMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {MOVEMENT_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={`Quantity (${unit})`}
                htmlFor={`mv-qty-${batchId}`}
                required
                hint="Decreases can never remove reserved stock."
              >
                <input
                  id={`mv-qty-${batchId}`}
                  inputMode="decimal"
                  className={inputClass}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </Field>
              <Field label="Reason" htmlFor={`mv-reason-${batchId}`} required>
                <input
                  id={`mv-reason-${batchId}`}
                  className={inputClass}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
              <div className="flex justify-end gap-2">
                <button type="button" className={buttonClass('secondary')} onClick={close}>
                  Back
                </button>
                <SubmitButton pending={pending}>Record</SubmitButton>
              </div>
            </form>
          )}
        </ConfirmDialog>
      ) : null}
      {status === 'active' ? (
        <ReasonDialog
          id={`hold-${batchId}`}
          triggerLabel="Put on hold"
          title="Put batch on hold"
          description="Held stock stops counting as available at once. Its reservations return to the supply pool and an operations exception is raised."
          submit={(reason) =>
            changeBatchStatus({ batchId, expectedVersion: version, status: 'on_hold', reason })
          }
        />
      ) : null}
      {status === 'on_hold' ? (
        <ReasonDialog
          id={`release-${batchId}`}
          triggerLabel="Release hold"
          title="Release batch"
          variant="primary"
          submit={(reason) =>
            changeBatchStatus({ batchId, expectedVersion: version, status: 'active', reason })
          }
        />
      ) : null}
      {status !== 'recalled' ? (
        <ReasonDialog
          id={`recall-${batchId}`}
          triggerLabel="Recall batch"
          title="Recall batch"
          variant="danger"
          description="A recall is permanent. The batch leaves availability, its reservations return to the supply pool, and the recall is kept for traceability."
          submit={(reason) => createRecall({ reason, batchIds: [batchId] })}
        />
      ) : null}
    </div>
  );
}

export function ResolveExceptionButton({ id }: { id: string }) {
  return (
    <ReasonDialog
      id={`exc-${id}`}
      triggerLabel="Resolve"
      title="Resolve operations exception"
      reasonLabel="Resolution note"
      confirmLabel="Resolve"
      submit={(note) => resolveException({ id, note })}
    />
  );
}
