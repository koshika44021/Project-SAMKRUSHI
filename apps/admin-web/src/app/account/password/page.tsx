import type { Metadata } from 'next';
import { Alert } from '@/components/ui/primitives';
import { requireStaff } from '@/lib/auth/session';
import { PasswordForm } from './password-form';

export const metadata: Metadata = { title: 'Change password' };

export default async function ChangePasswordPage() {
  const session = await requireStaff({ allowPasswordChange: true });
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-xl font-semibold">Change your password</h1>
        {session.passwordChangeRequired ? (
          <div className="mb-4">
            <Alert tone="warning">
              An administrator set a temporary password. Choose your own password to continue.
            </Alert>
          </div>
        ) : null}
        <PasswordForm />
      </div>
    </main>
  );
}
