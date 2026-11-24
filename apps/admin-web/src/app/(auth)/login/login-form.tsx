'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { staffLoginSchema } from '@samkrushi/shared';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { SubmitButton } from '@/components/ui/client';
import { Alert, Field, inputClass } from '@/components/ui/primitives';
import { signIn } from './actions';

type LoginValues = z.input<typeof staffLoginSchema>;

export function LoginForm({ next }: { next?: string }) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(staffLoginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await signIn(values, next);
      // A successful sign-in redirects; anything returned is an error.
      if (result && !result.ok) setFormError(result.error.message);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Field label="Email" htmlFor="email" error={errors.email?.message} required>
        <input
          id="email"
          type="email"
          autoComplete="username"
          className={inputClass}
          aria-invalid={Boolean(errors.email)}
          {...register('email')}
        />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password?.message} required>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className={inputClass}
          aria-invalid={Boolean(errors.password)}
          {...register('password')}
        />
      </Field>
      <SubmitButton pending={pending}>Sign in</SubmitButton>
    </form>
  );
}
