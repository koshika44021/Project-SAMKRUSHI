'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ownPasswordChangeSchema, STAFF_PASSWORD_RULES } from '@samkrushi/shared';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { SubmitButton } from '@/components/ui/client';
import { Alert, Field, inputClass } from '@/components/ui/primitives';
import { changeOwnPassword } from './actions';

type Values = z.input<typeof ownPasswordChangeSchema>;

export function PasswordForm() {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(ownPasswordChangeSchema) });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await changeOwnPassword(values);
      if (result && !result.ok) {
        setFormError(result.error.message);
        for (const fe of result.error.fieldErrors ?? []) {
          setError(fe.field as keyof Values, { message: fe.message });
        }
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Field
        label="New password"
        htmlFor="newPassword"
        error={errors.newPassword?.message}
        hint={`At least ${STAFF_PASSWORD_RULES.minLength} characters with upper and lower case letters and a digit.`}
        required
      >
        <input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          className={inputClass}
          {...register('newPassword')}
        />
      </Field>
      <Field
        label="Confirm new password"
        htmlFor="confirmPassword"
        error={errors.confirmPassword?.message}
        required
      >
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          className={inputClass}
          {...register('confirmPassword')}
        />
      </Field>
      <SubmitButton pending={pending}>Change password</SubmitButton>
    </form>
  );
}
