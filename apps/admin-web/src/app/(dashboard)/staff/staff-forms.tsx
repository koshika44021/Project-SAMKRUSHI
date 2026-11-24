'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ROLE_LABELS,
  STAFF_PASSWORD_RULES,
  STAFF_ROLES,
  type StaffRole,
  staffCreateSchema,
} from '@samkrushi/shared';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { ConfirmDialog, SubmitButton } from '@/components/ui/client';
import { Alert, buttonClass, Field, inputClass } from '@/components/ui/primitives';
import { changeStaffRoles, changeStaffStatus, createStaff, resetStaffPassword } from './actions';

/** Riders use the rider route (Phase 7); every other staff role can be assigned now. */
const ASSIGNABLE_ROLES = STAFF_ROLES;

type CreateValues = z.input<typeof staffCreateSchema>;

export function CreateStaffForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CreateValues>({
    resolver: zodResolver(staffCreateSchema),
    defaultValues: { email: '', fullName: '', roles: [], temporaryPassword: '' },
  });

  const onSubmit = handleSubmit((values) => {
    setMessage(null);
    startTransition(async () => {
      const result = await createStaff(values);
      if (result.ok) {
        setMessage({ tone: 'success', text: result.message ?? 'Created.' });
        reset();
        router.refresh();
        return;
      }
      setMessage({ tone: 'danger', text: result.error.message });
      for (const fe of result.error.fieldErrors ?? [])
        setError(fe.field as keyof CreateValues, { message: fe.message });
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
      {message ? (
        <div className="sm:col-span-2">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      ) : null}
      <Field label="Full name" htmlFor="fullName" error={errors.fullName?.message} required>
        <input id="fullName" className={inputClass} {...register('fullName')} />
      </Field>
      <Field label="Email (sign-in)" htmlFor="staffEmail" error={errors.email?.message} required>
        <input
          id="staffEmail"
          type="email"
          autoComplete="off"
          className={inputClass}
          {...register('email')}
        />
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="text-sm font-medium text-slate-700">
          Roles <span className="text-red-600">*</span>
        </legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {ASSIGNABLE_ROLES.map((role) => (
            <label key={role} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" value={role} {...register('roles')} />
              {ROLE_LABELS[role]}
            </label>
          ))}
        </div>
        {errors.roles?.message ? (
          <p className="mt-1 text-xs text-red-700">{errors.roles.message}</p>
        ) : null}
      </fieldset>
      <Field
        label="Temporary password"
        htmlFor="temporaryPassword"
        error={errors.temporaryPassword?.message}
        required
        hint={`At least ${STAFF_PASSWORD_RULES.minLength} characters with upper and lower case letters and a digit. Must be changed at first sign-in.`}
      >
        <input
          id="temporaryPassword"
          type="password"
          autoComplete="new-password"
          className={inputClass}
          {...register('temporaryPassword')}
        />
      </Field>
      <div className="flex items-end">
        <SubmitButton pending={pending}>Create staff account</SubmitButton>
      </div>
    </form>
  );
}

export function StaffRowActions({
  userId,
  isActive,
  roles,
}: {
  userId: string;
  isActive: boolean;
  roles: StaffRole[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<StaffRole[]>(roles);
  const [tempPassword, setTempPassword] = useState('');

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
        setTempPassword('');
        router.refresh();
      } else {
        setError(
          result.error?.fieldErrors?.[0]?.message ?? result.error?.message ?? 'Could not save.',
        );
      }
    });
  };

  const reasonField = (id: string) => (
    <Field label="Reason" htmlFor={id} required>
      <input
        id={id}
        className={inputClass}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
    </Field>
  );
  const footer = (close: () => void, label: string, variant: 'primary' | 'danger' = 'primary') => (
    <div className="flex justify-end gap-2">
      <button type="button" className={buttonClass('secondary')} onClick={close}>
        Cancel
      </button>
      <SubmitButton pending={pending} variant={variant}>
        {label}
      </SubmitButton>
    </div>
  );

  return (
    <div className="flex flex-wrap gap-1">
      <ConfirmDialog triggerLabel="Roles" title="Change roles">
        {(close) => (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => changeStaffRoles({ userId, roles: selectedRoles, reason }), close);
            }}
          >
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <div className="flex flex-wrap gap-3">
              {ASSIGNABLE_ROLES.map((role) => (
                <label key={role} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes(role)}
                    onChange={(e) =>
                      setSelectedRoles((prev) =>
                        e.target.checked ? [...prev, role] : prev.filter((r) => r !== role),
                      )
                    }
                  />
                  {ROLE_LABELS[role]}
                </label>
              ))}
            </div>
            {reasonField(`roles-reason-${userId}`)}
            {footer(close, 'Save roles')}
          </form>
        )}
      </ConfirmDialog>
      <ConfirmDialog triggerLabel="Reset password" title="Set a temporary password">
        {(close) => (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () => resetStaffPassword({ userId, temporaryPassword: tempPassword, reason }),
                close,
              );
            }}
          >
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Field
              label="Temporary password"
              htmlFor={`temp-${userId}`}
              required
              hint="Share it securely. It must be changed at next sign-in."
            >
              <input
                id={`temp-${userId}`}
                type="password"
                autoComplete="new-password"
                className={inputClass}
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
              />
            </Field>
            {reasonField(`reset-reason-${userId}`)}
            {footer(close, 'Set password')}
          </form>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        triggerLabel={isActive ? 'Deactivate' : 'Reactivate'}
        triggerVariant={isActive ? 'danger' : 'secondary'}
        title={isActive ? 'Deactivate staff member' : 'Reactivate staff member'}
      >
        {(close) => (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => changeStaffStatus({ userId, isActive: !isActive, reason }), close);
            }}
          >
            {isActive ? (
              <p className="text-sm text-slate-600">
                They lose access immediately and cannot sign in.
              </p>
            ) : null}
            {error ? <Alert tone="danger">{error}</Alert> : null}
            {reasonField(`status-reason-${userId}`)}
            {footer(close, isActive ? 'Deactivate' : 'Reactivate', isActive ? 'danger' : 'primary')}
          </form>
        )}
      </ConfirmDialog>
    </div>
  );
}
