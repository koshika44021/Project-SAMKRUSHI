import Link from 'next/link';
import { buttonClass } from '@/components/ui/primitives';

export default function ForbiddenPage() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold">You do not have access to this page</h1>
      <p className="mt-2 text-slate-600">
        Your role does not include this area. Ask a super admin if you need access.
      </p>
      <Link href="/overview" className={buttonClass('secondary', 'mt-6')}>
        Back to overview
      </Link>
    </main>
  );
}
