'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Locale } from '@savora/shared';
import { cx } from '@/lib/cx';

export type NavLink = { key: string; href: string; label: string; badge?: string };

/** The workspace links. The sidebar lives in the shared layout and stays put between pages, so the
 *  current page is read from the address rather than passed down by each page. */
export function AppNav({ links, locale, active }: { links: NavLink[]; locale: Locale; active?: string }) {
  const pathname = usePathname();
  const home = `/${locale}/app`;
  // The longest matching link wins, so /app/menu lights "Menu editor", not "Overview".
  const current = active ?? links.filter((l) => (l.href === home ? pathname === home : pathname === l.href || pathname.startsWith(`${l.href}/`))).sort((a, b) => b.href.length - a.href.length)[0]?.key;

  return links.map((item) => {
    const on = item.key === current;
    return (
      <Link
        key={item.key}
        href={item.href}
        aria-current={on ? 'page' : undefined}
        className={cx(
          'flex items-center rounded-[9px] px-3 py-2.5 text-body-s font-medium transition-colors',
          on ? 'bg-brand-soft text-brand shadow-[inset_3px_0_0_var(--brand)] rtl:shadow-[inset_-3px_0_0_var(--brand)]' : 'text-muted hover:bg-surface-2 hover:text-ink',
        )}
      >
        {item.label}
        {item.badge && <span className="ms-auto rounded-full bg-brand-fill px-2 py-0.5 text-[10px] font-semibold text-white">{item.badge}</span>}
      </Link>
    );
  });
}
