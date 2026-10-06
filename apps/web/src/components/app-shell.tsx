import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Locale } from '@savora/shared';
import type { Dictionary } from '@/app/[lang]/dictionaries';
import { cx } from '@/lib/cx';
import type { LocationOption } from '@/lib/workspace';
import { LocationSwitcher } from './location-switcher';
import { ShellFrame } from './shell-frame';
import { SignOutButton } from './sign-out-button';
import { Logo } from './ui/logo';

export type NavKey = 'overview' | 'menuEditor' | 'menuThemes' | 'qr' | 'analytics' | 'virtualTrial' | 'settings' | 'billing';

export const NAV: Array<{ key: NavKey; path: string; isNew?: boolean; phase: number }> = [
  { key: 'overview', path: '/app', phase: 1 },
  { key: 'menuEditor', path: '/app/menu', phase: 2 },
  { key: 'menuThemes', path: '/app/themes', isNew: true, phase: 7 },
  { key: 'qr', path: '/app/qr', phase: 3 },
  { key: 'analytics', path: '/app/analytics', phase: 4 },
  { key: 'virtualTrial', path: '/app/virtual-trial', isNew: true, phase: 8 },
  { key: 'settings', path: '/app/settings', phase: 5 },
  { key: 'billing', path: '/app/billing', phase: 6 },
];

export type ShellWorkspace = {
  orgName: string;
  locations: LocationOption[];
  currentLocationId?: string;
  user: { name: string | null; email: string; staff?: boolean };
  canAddLocation?: boolean;
};

/** Workspace layout: sidebar at the start edge with the organization, location switcher and navigation. */
export function AppShell({ t, locale, active, workspace, children }: { t: Dictionary; locale: Locale; active?: NavKey; workspace: ShellWorkspace; children: ReactNode }) {
  const current = workspace.locations.find((l) => l.id === workspace.currentLocationId) ?? workspace.locations[0];
  const initial = (workspace.user.name ?? workspace.user.email).slice(0, 1).toUpperCase();

  const sidebar = (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      <Link href={`/${locale}/app`} className="px-2 pt-2">
        <Logo width={112} />
      </Link>

      <div className="rounded-2xl border border-line bg-surface-2 p-3.5">
        <p className="flex items-center justify-between gap-2 text-overline font-semibold tracking-[0.1em] text-muted uppercase">
          <span className="truncate">{workspace.orgName}</span>
          {current && (
            <span className={cx('shrink-0 rounded-full px-2 py-0.5 normal-case', current.paused ? 'bg-brand-soft text-brand' : current.status === 'live' ? 'bg-ok-soft text-ok' : 'bg-gold-soft text-gold')}>
              {current.paused ? t.locks.paused : current.status === 'live' ? t.overview.statusLive : t.overview.statusDraft}
            </span>
          )}
        </p>
        <p className="mt-1.5 truncate text-title-m font-semibold">{current?.label}</p>
        {workspace.locations.length > 1 && <LocationSwitcher options={workspace.locations} current={current?.id} label={t.shell.switchLocation} pausedLabel={t.locks.paused} />}
        {workspace.canAddLocation && (
          <Link href={`/${locale}/app/locations/new`} className="mt-2.5 block text-caption font-semibold text-brand hover:underline">
            {t.locations.add}
          </Link>
        )}
      </div>

      <nav aria-label={t.nav.workspace} className="grid gap-0.5">
        <p className="px-3 pb-2 text-overline font-semibold tracking-[0.11em] text-muted uppercase">{t.nav.workspace}</p>
        {NAV.map((item) => {
          const on = item.key === active;
          return (
            <Link
              key={item.key}
              href={`/${locale}${item.path}`}
              aria-current={on ? 'page' : undefined}
              className={cx(
                'flex items-center rounded-[9px] px-3 py-2.5 text-body-s font-medium transition-colors',
                on ? 'bg-brand-soft text-brand shadow-[inset_3px_0_0_var(--brand)] rtl:shadow-[inset_-3px_0_0_var(--brand)]' : 'text-muted hover:bg-surface-2 hover:text-ink',
              )}
            >
              {t.nav[item.key]}
              {item.isNew && <span className="ms-auto rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-white">{t.nav.new}</span>}
            </Link>
          );
        })}
        {workspace.user.staff && (
          <Link href={`/${locale}/staff`} className="mt-2 flex items-center rounded-[9px] border border-dashed border-line-2 px-3 py-2.5 text-body-s font-medium text-muted hover:text-ink">
            {t.nav.staff}
          </Link>
        )}
      </nav>

      <div className="mt-auto grid gap-4">
        <div className="rounded-2xl bg-gold-soft p-3.5">
          <p className="text-body-s font-semibold">{t.nav.promoTitle}</p>
          <p className="mt-0.5 text-caption text-muted">{t.nav.promoBody}</p>
        </div>
        <div className="flex items-center gap-3 border-t border-line pt-4">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-caption font-semibold text-surface">
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body-s font-semibold">{workspace.user.name ?? workspace.user.email}</span>
            <span dir="ltr" className="block truncate text-caption text-muted">
              {workspace.user.email}
            </span>
          </span>
        </div>
        <SignOutButton label={t.shell.signOut} locale={locale} />
      </div>
    </div>
  );

  return (
    <ShellFrame sidebar={sidebar} logo={<Logo width={96} />} labels={{ menu: t.shell.menu, close: t.shell.close }}>
      {children}
    </ShellFrame>
  );
}
