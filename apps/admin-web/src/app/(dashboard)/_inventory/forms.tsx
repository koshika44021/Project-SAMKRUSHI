'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { SubmitButton } from '@/components/ui/client';
import { Alert, Button, Field, inputClass } from '@/components/ui/primitives';
import { createGoodsReceipt, createPurchaseOrder, createPurchaseOrderFromSupply } from './actions';

type FieldErrors = { field: string; message: string }[] | undefined;
const fieldError = (errors: FieldErrors, field: string) =>
  errors?.find((error) => error.field === field || error.field.startsWith(`${field}.`))?.message;

// ------------------------------------------------------------ manual PO form
type ProductOption = { id: string; name: string; productCode: string; baseUnit: string };
type SupplierOption = { id: string; name: string; supplierCode: string };
type LineDraft = { key: number; productId: string; quantity: string; unitCostPaise: string };

export function PurchaseOrderForm({
  suppliers,
  products,
  defaultExpectedDate,
}: {
  suppliers: SupplierOption[];
  products: ProductOption[];
  defaultExpectedDate: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();
  const [supplierId, setSupplierId] = useState('');
  const [expectedDate, setExpectedDate] = useState(defaultExpectedDate);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([
    { key: 1, productId: '', quantity: '', unitCostPaise: '' },
  ]);
  const unitOf = (productId: string) => products.find((p) => p.id === productId)?.baseUnit ?? '';

  const update = (key: number, patch: Partial<LineDraft>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setFieldErrors(undefined);
        startTransition(async () => {
          const result = await createPurchaseOrder({
            supplierId,
            expectedDate,
            notes,
            lines: lines.map((line) => ({
              productId: line.productId,
              quantity: line.quantity.trim(),
              unitCostPaise: line.unitCostPaise.trim() === '' ? null : Number(line.unitCostPaise),
            })),
          });
          if (result.ok) {
            router.push(`/procurement/${result.data.id}` as Route);
          } else {
            setError(result.error.message);
            setFieldErrors(result.error.fieldErrors);
          }
        });
      }}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Farmer / supplier"
          htmlFor="po-supplier"
          required
          error={fieldError(fieldErrors, 'supplierId')}
        >
          <select
            id="po-supplier"
            className={inputClass}
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
          >
            <option value="">Choose…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.supplierCode})
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Expected date"
          htmlFor="po-expected"
          required
          error={fieldError(fieldErrors, 'expectedDate')}
        >
          <input
            id="po-expected"
            type="date"
            className={inputClass}
            value={expectedDate}
            onChange={(event) => setExpectedDate(event.target.value)}
          />
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">Lines (product base unit)</legend>
        {lines.map((line, index) => (
          <div key={line.key} className="grid items-end gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <Field label={`Product ${index + 1}`} htmlFor={`po-line-${line.key}-product`} required>
              <select
                id={`po-line-${line.key}-product`}
                className={inputClass}
                value={line.productId}
                onChange={(event) => update(line.key, { productId: event.target.value })}
              >
                <option value="">Choose…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.productCode}, {p.baseUnit})
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={`Quantity${line.productId ? ` (${unitOf(line.productId)})` : ''}`}
              htmlFor={`po-line-${line.key}-qty`}
              required
            >
              <input
                id={`po-line-${line.key}-qty`}
                inputMode="decimal"
                className={inputClass}
                value={line.quantity}
                onChange={(event) => update(line.key, { quantity: event.target.value })}
              />
            </Field>
            <Field
              label="Agreed cost (paise / unit)"
              htmlFor={`po-line-${line.key}-cost`}
              hint="Optional"
            >
              <input
                id={`po-line-${line.key}-cost`}
                inputMode="numeric"
                className={inputClass}
                value={line.unitCostPaise}
                onChange={(event) => update(line.key, { unitCostPaise: event.target.value })}
              />
            </Field>
            <Button
              variant="ghost"
              disabled={lines.length === 1}
              onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
            >
              Remove
            </Button>
          </div>
        ))}
        {fieldError(fieldErrors, 'lines') ? (
          <p role="alert" className="text-xs text-red-700">
            {fieldError(fieldErrors, 'lines')}
          </p>
        ) : null}
        <Button
          variant="secondary"
          onClick={() =>
            setLines((current) => [
              ...current,
              {
                key: Math.max(...current.map((l) => l.key)) + 1,
                productId: '',
                quantity: '',
                unitCostPaise: '',
              },
            ])
          }
        >
          Add line
        </Button>
      </fieldset>

      <Field label="Notes" htmlFor="po-notes">
        <textarea
          id="po-notes"
          className={inputClass}
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
      <SubmitButton pending={pending}>Create draft PO</SubmitButton>
    </form>
  );
}

// ------------------------------------------------------- PO from supply form
export function PurchaseOrderFromSupplyButton({
  supplierId,
  businessDate,
  label,
}: {
  supplierId: string;
  businessDate: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        disabled={pending}
        aria-busy={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await createPurchaseOrderFromSupply({ supplierId, businessDate });
            if (result.ok) router.push(`/procurement/${result.data.id}` as Route);
            else setError(result.error.message);
          });
        }}
      >
        {pending ? 'Creating…' : label}
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      ) : null}
    </span>
  );
}

// ------------------------------------------------------------ receiving form
type ReceiptLineSource = {
  poLineId: string;
  productName: string;
  unit: string;
  orderedQuantity: string;
  remainingQuantity: string;
};
type ReceiptLineDraft = {
  include: boolean;
  received: string;
  accepted: string;
  rejected: string;
  damaged: string;
  qualityGrade: string;
  qualityNotes: string;
  lotCode: string;
  harvestDate: string;
};

export function GoodsReceiptForm({
  purchaseOrderId,
  lines,
}: {
  purchaseOrderId: string;
  lines: ReceiptLineSource[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();
  const [notes, setNotes] = useState('');
  const [overReceiptReason, setOverReceiptReason] = useState('');
  const [needsOverReason, setNeedsOverReason] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, ReceiptLineDraft>>(() =>
    Object.fromEntries(
      lines.map((line) => [
        line.poLineId,
        {
          include: line.remainingQuantity !== '0',
          received: '',
          accepted: '',
          rejected: '',
          damaged: '',
          qualityGrade: '',
          qualityNotes: '',
          lotCode: '',
          harvestDate: '',
        },
      ]),
    ),
  );
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const update = (poLineId: string, patch: Partial<ReceiptLineDraft>) =>
    setDrafts((current) => {
      const existing = current[poLineId];
      return existing ? { ...current, [poLineId]: { ...existing, ...patch } } : current;
    });

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setFieldErrors(undefined);
        const included = lines.filter((line) => drafts[line.poLineId]?.include);
        const formData = new FormData();
        formData.set(
          'payload',
          JSON.stringify({
            purchaseOrderId,
            notes,
            overReceiptReason,
            lines: included.map((line) => {
              const d = drafts[line.poLineId];
              return {
                poLineId: line.poLineId,
                received: d?.received.trim() ?? '',
                accepted: d?.accepted.trim() ?? '',
                rejected: d?.rejected.trim() ?? '',
                damaged: d?.damaged.trim() ?? '',
                qualityGrade: d?.qualityGrade ?? '',
                qualityNotes: d?.qualityNotes ?? '',
                lotCode: d?.lotCode ?? '',
                harvestDate: d?.harvestDate ?? '',
              };
            }),
          }),
        );
        for (const line of included) {
          const file = files[line.poLineId];
          if (file) formData.set(`evidence-${line.poLineId}`, file);
        }
        startTransition(async () => {
          const result = await createGoodsReceipt(formData);
          if (result.ok) {
            router.push(`/receiving/${result.data.id}` as Route);
          } else {
            setError(result.error.message);
            setFieldErrors(result.error.fieldErrors);
            if (result.error.fieldErrors?.some((f) => f.field === 'overReceiptReason'))
              setNeedsOverReason(true);
          }
        });
      }}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <p className="text-sm text-slate-600">
        Record what physically arrived. Accepted + rejected + damaged must equal received. Only
        accepted quantity becomes stock, and only when the receipt is posted.
      </p>
      {lines.map((line) => {
        const d = drafts[line.poLineId];
        if (!d) return null;
        const id = (suffix: string) => `grn-${line.poLineId}-${suffix}`;
        return (
          <fieldset key={line.poLineId} className="rounded-md border border-slate-200 p-3">
            <legend className="px-1 text-sm font-medium text-slate-800">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={d.include}
                  onChange={(event) => update(line.poLineId, { include: event.target.checked })}
                />
                {line.productName}{' '}
                <span className="text-xs font-normal text-slate-500">
                  ordered {line.orderedQuantity} {line.unit} · remaining {line.remainingQuantity}{' '}
                  {line.unit}
                </span>
              </label>
            </legend>
            {d.include ? (
              <div className="grid gap-2 sm:grid-cols-4">
                {(['received', 'accepted', 'rejected', 'damaged'] as const).map((key) => (
                  <Field
                    key={key}
                    label={`${key[0]?.toUpperCase()}${key.slice(1)} (${line.unit})`}
                    htmlFor={id(key)}
                    required={key === 'received'}
                  >
                    <input
                      id={id(key)}
                      inputMode="decimal"
                      className={inputClass}
                      value={d[key]}
                      onChange={(event) => update(line.poLineId, { [key]: event.target.value })}
                    />
                  </Field>
                ))}
                <Field label="Quality grade" htmlFor={id('grade')}>
                  <input
                    id={id('grade')}
                    className={inputClass}
                    value={d.qualityGrade}
                    onChange={(event) =>
                      update(line.poLineId, { qualityGrade: event.target.value })
                    }
                  />
                </Field>
                <Field label="Lot code" htmlFor={id('lot')}>
                  <input
                    id={id('lot')}
                    className={inputClass}
                    value={d.lotCode}
                    onChange={(event) => update(line.poLineId, { lotCode: event.target.value })}
                  />
                </Field>
                <Field label="Harvest date" htmlFor={id('harvest')} hint="Not an expiry date">
                  <input
                    id={id('harvest')}
                    type="date"
                    className={inputClass}
                    value={d.harvestDate}
                    onChange={(event) => update(line.poLineId, { harvestDate: event.target.value })}
                  />
                </Field>
                <Field
                  label="Evidence photo"
                  htmlFor={id('evidence')}
                  error={fieldError(fieldErrors, `evidence-${line.poLineId}`)}
                >
                  <input
                    id={id('evidence')}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="block w-full text-sm"
                    onChange={(event) =>
                      setFiles((current) => ({
                        ...current,
                        [line.poLineId]: event.target.files?.[0] ?? null,
                      }))
                    }
                  />
                </Field>
                <div className="sm:col-span-4">
                  <Field label="Quality notes" htmlFor={id('notes')}>
                    <input
                      id={id('notes')}
                      className={inputClass}
                      value={d.qualityNotes}
                      onChange={(event) =>
                        update(line.poLineId, { qualityNotes: event.target.value })
                      }
                    />
                  </Field>
                </div>
              </div>
            ) : null}
          </fieldset>
        );
      })}
      {fieldError(fieldErrors, 'lines') ? (
        <p role="alert" className="text-xs text-red-700">
          {fieldError(fieldErrors, 'lines')}
        </p>
      ) : null}
      {needsOverReason || overReceiptReason ? (
        <Field
          label="Over-receipt reason"
          htmlFor="grn-over-reason"
          required
          error={fieldError(fieldErrors, 'overReceiptReason')}
          hint="Required when more than the ordered quantity arrived."
        >
          <input
            id="grn-over-reason"
            className={inputClass}
            value={overReceiptReason}
            onChange={(event) => setOverReceiptReason(event.target.value)}
          />
        </Field>
      ) : null}
      <Field label="Receipt notes" htmlFor="grn-notes">
        <textarea
          id="grn-notes"
          rows={2}
          className={inputClass}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
      <SubmitButton pending={pending}>Save draft receipt</SubmitButton>
    </form>
  );
}
