import { capabilities, formatBusinessDate, ROLE_LABELS, toBusinessDate } from '@samkrushi/shared';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { buttonClass } from '@/components/ui/primitives';
import { requireStaff } from '@/lib/auth/session';
import { signOut } from '../(auth)/login/actions';
import { NavLinks } from './nav-links';

/**
 * Dashboard shell (WEB_ADMIN §2, §4): role-aware navigation, the current
 * Asia/Kolkata business date from SERVER time, staff name/role and logout.
 * Navigation visibility is convenience only — every query/RPC re-checks roles.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireStaff();
  const businessDate = toBusinessDate(new Date());

  const nav = [
    { href: '/overview', label: 'Overview', visible: capabilities.useDashboard(session.roles) },
    { href: '/farmers', label: 'Farmers', visible: capabilities.viewFarmers(session.roles) },
    {
      href: '/availability',
      label: 'Products & Availability',
      visible: capabilities.viewSupply(session.roles) || capabilities.viewCatalog(session.roles),
    },
    {
      href: '/procurement',
      label: 'Procurement',
      visible: capabilities.viewInventory(session.roles),
    },
    {
      href: '/receiving',
      label: 'Goods Receiving & Quality',
      visible: capabilities.viewInventory(session.roles),
    },
    {
      href: '/inventory',
      label: 'Inventory & Batches',
      visible: capabilities.viewInventory(session.roles),
    },
    {
      href: '/exceptions',
      label: 'Exceptions',
      visible: capabilities.viewInventory(session.roles),
    },
    { href: '/staff', label: 'Staff / Users', visible: capabilities.manageStaff(session.roles) },
    { href: '/audit', label: 'Audit History', visible: capabilities.viewAudit(session.roles) },
  ].filter((item) => item.visible);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white md:block">
        <div className="px-5 py-4">
          <Link
            href="/overview"
            className="text-sm font-bold tracking-wide text-brand-700 uppercase"
          >
            SAMKRUSHI
          </Link>
          <p className="text-xs text-slate-500">Operations dashboard</p>
        </div>
        <NavLinks items={nav.map(({ href, label }) => ({ href, label }))} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
          <div className="text-sm">
            <span className="text-slate-500">Business date (Asia/Kolkata): </span>
            <time
              dateTime={businessDate}
              data-testid="header-business-date"
              className="font-medium"
            >
              {formatBusinessDate(businessDate)}
            </time>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-right">
              <span className="block font-medium" data-testid="staff-name">
                {session.fullName}
              </span>
              <span className="block text-xs text-slate-500">
                {session.roles.map((role) => ROLE_LABELS[role]).join(', ')}
              </span>
            </span>
            <form action={signOut}>
              <button type="submit" className={buttonClass('secondary')}>
                Sign out
              </button>
            </form>
          </div>
        </header>
        <nav className="border-b border-slate-200 bg-white md:hidden" aria-label="Main (mobile)">
          <NavLinks items={nav.map(({ href, label }) => ({ href, label }))} horizontal />
        </nav>
        <main className="flex-1 px-5 py-6">{children}</main>
      </div>
    </div>
  );
}
