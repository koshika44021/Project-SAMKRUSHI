'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/components/ui/primitives';

export function NavLinks({
  items,
  horizontal = false,
}: {
  items: { href: string; label: string }[];
  horizontal?: boolean;
}) {
  const pathname = usePathname();
  return (
    <ul className={cx(horizontal ? 'flex gap-1 overflow-x-auto px-3 py-2' : 'space-y-0.5 px-3')}>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href as Route}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'block rounded-md px-3 py-2 text-sm whitespace-nowrap',
                active
                  ? 'bg-brand-600/10 font-medium text-brand-700'
                  : 'text-slate-700 hover:bg-slate-100',
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
