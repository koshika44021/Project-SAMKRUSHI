import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Alert } from '@/components/ui/primitives';
import { getStaffSession } from '@/lib/auth/session';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

const REASONS: Record<string, string> = {
  signed_out: 'You have been signed out.',
  password_changed: 'Password changed. Please sign in with your new password.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const { next, reason } = await searchParams;
  if (await getStaffSession()) redirect('/overview');

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium tracking-wide text-brand-700 uppercase">SAMKRUSHI</p>
        <h1 className="mt-1 mb-5 text-xl font-semibold">Staff sign in</h1>
        {reason && REASONS[reason] ? (
          <div className="mb-4">
            <Alert tone="info">{REASONS[reason]}</Alert>
          </div>
        ) : null}
        <LoginForm {...(next ? { next } : {})} />
        <p className="mt-5 text-xs text-slate-500">
          Staff accounts are created by an administrator. Forgot your password? Ask a super admin to
          reset it.
        </p>
      </div>
    </main>
  );
}
