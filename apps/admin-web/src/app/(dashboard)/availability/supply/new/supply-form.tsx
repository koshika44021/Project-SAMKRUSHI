'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { supplyCreateSchema } from '@samkrushi/shared';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { SubmitButton } from '@/components/ui/client';
import { Alert, Field, inputClass } from '@/components/ui/primitives';
import { createSupply } from '../../actions';

type Values = z.input<typeof supplyCreateSchema>;

interface Option {
  id: string;
  label: string;
}

export function SupplyForm({
  today,
  defaultDate,
  defaultSupplierId,
  farmers,
  farmerListTruncated,
  products,
  sources,
  units,
}: {
  today: string;
  defaultDate: string;
  defaultSupplierId: string;
  farmers: Option[];
  farmerListTruncated: boolean;
  products: (Option & { baseUnit: string; precision: number })[];
  sources: { code: string; label: string }[];
  units: { code: string; dimension: string; convertible: boolean }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(supplyCreateSchema),
    defaultValues: {
      supplierId: defaultSupplierId,
      productId: '',
      businessDate: defaultDate,
      quantity: '',
      confirmationSource: '',
      note: '',
    },
  });

  const productId = useWatch({ control, name: 'productId' });
  const product = products.find((p) => p.id === productId);
  const baseUnitInfo = units.find((u) => u.code === product?.baseUnit);
  const entryUnits = product
    ? units.filter(
        (u) =>
          u.code === product.baseUnit ||
          (baseUnitInfo?.convertible && u.convertible && u.dimension === baseUnitInfo.dimension),
      )
    : [];

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const payload = {
        ...values,
        ...(values.entryUnit === product?.baseUnit ? { entryUnit: undefined } : {}),
      };
      const result = await createSupply(payload);
      if (result.ok) {
        router.push(`/availability?date=${values.businessDate}&saved=1` as Route);
        router.refresh();
        return;
      }
      setFormError(result.error.message);
      for (const fe of result.error.fieldErrors ?? [])
        setError(fe.field as keyof Values, { message: fe.message });
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-2xl space-y-4">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Field
        label="Farmer"
        htmlFor="supplierId"
        error={errors.supplierId?.message}
        required
        {...(farmerListTruncated ? { hint: 'Showing the first 100 active farmers.' } : {})}
      >
        <select id="supplierId" className={inputClass} {...register('supplierId')}>
          <option value="">Select an active farmer</option>
          {farmers.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Catalog product" htmlFor="productId" error={errors.productId?.message} required>
        <select id="productId" className={inputClass} {...register('productId')}>
          <option value="">Select a product</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} ({p.baseUnit})
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Business date"
          htmlFor="businessDate"
          error={errors.businessDate?.message}
          required
        >
          <input
            id="businessDate"
            type="date"
            min={today}
            className={inputClass}
            {...register('businessDate')}
          />
        </Field>
        <Field
          label="Quantity"
          htmlFor="quantity"
          error={errors.quantity?.message}
          required
          {...(product
            ? { hint: `Up to ${product.precision} decimal places in ${product.baseUnit}` }
            : {})}
        >
          <input
            id="quantity"
            inputMode="decimal"
            className={inputClass}
            {...register('quantity')}
          />
        </Field>
        <Field label="Unit" htmlFor="entryUnit" error={errors.entryUnit?.message}>
          <select
            id="entryUnit"
            className={inputClass}
            disabled={!product}
            {...register('entryUnit', { setValueAs: (v: string) => v || undefined })}
          >
            {entryUnits.map((u) => (
              <option key={u.code} value={u.code}>
                {u.code}
                {u.code === product?.baseUnit ? ' (base unit)' : ''}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        label="How was this confirmed?"
        htmlFor="confirmationSource"
        error={errors.confirmationSource?.message}
        required
      >
        <select id="confirmationSource" className={inputClass} {...register('confirmationSource')}>
          <option value="">Select a confirmation source</option>
          {sources.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Note" htmlFor="note" error={errors.note?.message}>
        <textarea id="note" rows={2} className={inputClass} {...register('note')} />
      </Field>
      <p className="text-xs text-slate-500">
        You are recorded as the confirming staff member, with the current time.
      </p>
      <SubmitButton pending={pending}>Record supply</SubmitButton>
    </form>
  );
}
