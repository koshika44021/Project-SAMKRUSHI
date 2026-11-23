import { BUSINESS_TIME_ZONE, formatBusinessDate, toBusinessDate } from '@samkrushi/shared';
import { connection } from 'next/server';

/**
 * Phase 1 placeholder. Staff authentication, navigation and the Overview
 * dashboard arrive in Phase 3 (see docs/specs/SAMKRUSHI_WEB_ADMIN_SPEC.md).
 */
export default async function HomePage() {
  // Render per request so the business date reflects server time, never build time.
  await connection();
  const businessDate = toBusinessDate(new Date());

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6">
      <p className="text-sm font-medium tracking-wide text-brand-700 uppercase">SAMKRUSHI</p>
      <h1 className="text-3xl font-semibold">Admin dashboard</h1>
      <p className="text-slate-600">
        Foundation build. Staff sign-in and operations modules are not available yet.
      </p>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-slate-500">Business date</dt>
        <dd data-testid="business-date">
          <time dateTime={businessDate}>{formatBusinessDate(businessDate)}</time>
        </dd>
        <dt className="text-slate-500">Time zone</dt>
        <dd>{BUSINESS_TIME_ZONE}</dd>
      </dl>
    </main>
  );
}
