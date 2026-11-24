'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  FARMER_FIELD_RULES,
  farmerCreateSchema,
  farmerUpdateSchema,
  PHOTO_UPLOAD_RULES,
} from '@samkrushi/shared';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { type FieldValues, type Path, type Resolver, useForm } from 'react-hook-form';
import { SubmitButton } from '@/components/ui/client';
import { Alert, Field, inputClass } from '@/components/ui/primitives';
import { createFarmer, updateFarmer } from './actions';

export interface FarmerFormDefaults {
  id?: string;
  expectedVersion?: number;
  name: string;
  addressLine: string;
  villageLocality: string;
  mandal: string;
  district: string;
  state: string;
  pinCode: string;
  primaryPhone: string;
  secondaryPhone: string;
  landAreaValue: string;
  landAreaUnit: '' | 'acre' | 'hectare';
  notes: string;
}

type DuplicateMatch = { supplierCode: string; name: string; phone: string };

export function FarmerForm({
  mode,
  defaults,
}: {
  mode: 'create' | 'edit';
  defaults: FarmerFormDefaults;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[] | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // One form for two schemas: the resolver is chosen per mode (values are validated again on the server).
  const resolver = (mode === 'create'
    ? zodResolver(farmerCreateSchema)
    : zodResolver(farmerUpdateSchema)) as unknown as Resolver<FieldValues>;

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FieldValues>({
    resolver,
    defaultValues: {
      ...defaults,
      landAreaUnit: defaults.landAreaUnit || null,
      reason: '',
      duplicatePhoneReason: '',
      status: FARMER_FIELD_RULES.defaultStatusOnCreate,
    },
  });

  const fieldError = (name: string): string | undefined => {
    const err = errors[name];
    return typeof err?.message === 'string' ? err.message : undefined;
  };

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    setPhotoError(null);
    const formData = new FormData();
    const payload: Record<string, unknown> = { ...values };
    if (mode === 'create') {
      delete payload.id;
      delete payload.expectedVersion;
      delete payload.reason;
    }
    formData.set('payload', JSON.stringify(payload));
    const photoInput = document.getElementById('photo') as HTMLInputElement | null;
    const file = photoInput?.files?.[0];
    if (file) formData.set('photo', file);

    startTransition(async () => {
      const result =
        mode === 'create' ? await createFarmer(formData) : await updateFarmer(formData);
      if (result.ok) {
        const id = mode === 'create' ? (result.data as { id: string }).id : (defaults.id ?? '');
        router.push(`/farmers/${id}?saved=1` as Route);
        router.refresh();
        return;
      }
      const { error } = result;
      const dupDetails = Array.isArray(error.details) ? (error.details as DuplicateMatch[]) : null;
      if (error.code === 'CONFLICT' && dupDetails) {
        setDuplicates(dupDetails);
        setFormError(null);
        return;
      }
      const createdId = (error.details as { createdId?: string } | undefined)?.createdId;
      if (createdId) {
        router.push(`/farmers/${createdId}?photo_failed=1` as Route);
        return;
      }
      setFormError(error.message);
      for (const fe of error.fieldErrors ?? []) {
        if (fe.field === 'photo') setPhotoError(fe.message);
        else setError(fe.field as Path<FieldValues>, { message: fe.message });
      }
    });
  });

  const text = (
    name: string,
    label: string,
    options: { required?: boolean; type?: string; autoComplete?: string; hint?: string } = {},
  ) => (
    <Field
      label={label}
      htmlFor={name}
      error={fieldError(name)}
      required={options.required ?? true}
      {...(options.hint ? { hint: options.hint } : {})}
    >
      <input
        id={name}
        type={options.type ?? 'text'}
        autoComplete={options.autoComplete ?? 'off'}
        className={inputClass}
        aria-invalid={Boolean(errors[name])}
        {...register(name)}
      />
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-3xl space-y-6">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-900">Farmer</legend>
        {text('name', 'Farmer name')}
        {text('primaryPhone', 'Primary contact', {
          type: 'tel',
          hint: '10-digit Indian mobile number',
        })}
        {text('secondaryPhone', 'Secondary contact', {
          type: 'tel',
          required: FARMER_FIELD_RULES.secondaryPhoneRequired,
        })}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-900">Location</legend>
        <div className="sm:col-span-2">{text('addressLine', 'Address')}</div>
        {text('villageLocality', 'Village / locality')}
        {text('mandal', 'Mandal')}
        {text('district', 'District')}
        {text('state', 'State')}
        {text('pinCode', 'PIN code', { hint: 'Six digits' })}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-900">Land</legend>
        {text('landAreaValue', 'Land area', {
          required: FARMER_FIELD_RULES.landAreaRequired,
          hint: 'Up to 2 decimal places',
        })}
        <Field
          label="Land area unit"
          htmlFor="landAreaUnit"
          error={fieldError('landAreaUnit')}
          required={FARMER_FIELD_RULES.landAreaRequired}
        >
          <select
            id="landAreaUnit"
            className={inputClass}
            {...register('landAreaUnit', { setValueAs: (v: string) => v || null })}
          >
            <option value="">Select unit</option>
            <option value="acre">Acres</option>
            <option value="hectare">Hectares</option>
          </select>
        </Field>
      </fieldset>

      {mode === 'create' ? (
        <fieldset className="space-y-4">
          <legend className="mb-2 text-sm font-semibold text-slate-900">Photo and status</legend>
          <Field
            label="Farmer photo"
            htmlFor="photo"
            error={photoError ?? undefined}
            required={FARMER_FIELD_RULES.photoRequired}
            hint={`JPEG, PNG or WebP, up to ${PHOTO_UPLOAD_RULES.maxBytes / (1024 * 1024)} MB. Stored privately; location metadata is removed.`}
          >
            <input
              id="photo"
              name="photo"
              type="file"
              accept={PHOTO_UPLOAD_RULES.allowedMimeTypes.join(',')}
              className="block text-sm"
            />
          </Field>
          <Field label="Initial status" htmlFor="status" error={fieldError('status')}>
            <select id="status" className={inputClass} {...register('status')}>
              <option value="active">Active</option>
              <option value="pending_verification">Pending verification</option>
            </select>
          </Field>
        </fieldset>
      ) : null}

      <Field label="Notes" htmlFor="notes" error={fieldError('notes')}>
        <textarea id="notes" rows={3} className={inputClass} {...register('notes')} />
      </Field>

      {mode === 'edit' ? (
        <Field
          label="Reason for change"
          htmlFor="reason"
          error={fieldError('reason')}
          required
          hint="Recorded in the audit history."
        >
          <input id="reason" className={inputClass} {...register('reason')} />
        </Field>
      ) : null}

      {duplicates ? (
        <Alert tone="warning" title="This phone number is already used by another farmer">
          <ul className="mt-1 list-disc pl-5">
            {duplicates.map((d) => (
              <li key={d.supplierCode}>
                {d.supplierCode} · {d.name} · {d.phone}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            Records are never merged. If the shared number is legitimate, give a reason to continue.
          </p>
          <div className="mt-2">
            <Field
              label="Reason for shared phone"
              htmlFor="duplicatePhoneReason"
              error={fieldError('duplicatePhoneReason')}
              required
            >
              <input
                id="duplicatePhoneReason"
                className={inputClass}
                {...register('duplicatePhoneReason')}
              />
            </Field>
          </div>
        </Alert>
      ) : null}

      <div className="flex gap-2">
        <SubmitButton pending={pending}>
          {mode === 'create' ? 'Register farmer' : 'Save changes'}
        </SubmitButton>
      </div>
    </form>
  );
}
