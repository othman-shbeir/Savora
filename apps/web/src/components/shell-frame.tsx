'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';

/** Lays out the sidebar and page. On phones the sidebar becomes a drawer behind a menu button;
 *  it slides in from the start edge (left in English, right in Arabic). */
export function ShellFrame({ sidebar, logo, labels, children }: { sidebar: ReactNode; logo: ReactNode; labels: { menu: string; close: string }; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[246px_minmax(0,1fr)]">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        {logo}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="workspace-nav"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-line-2 px-3 text-body-s font-semibold"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          {labels.menu}
        </button>
      </header>

      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <aside
        id="workspace-nav"
        // Following a link inside the drawer closes it.
        onClick={(e) => (e.target as HTMLElement).closest('a') && setOpen(false)}
        className={cx(
          'fixed inset-y-0 start-0 z-50 w-[280px] max-w-[85vw] border-e border-line bg-surface transition-transform duration-200',
          'lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:w-auto lg:max-w-none',
          // Only the phone drawer slides; on large screens the sidebar is always in place.
          !open && 'max-lg:-translate-x-full max-lg:rtl:translate-x-full',
        )}
      >
        {open && (
          <button type="button" onClick={() => setOpen(false)} className="absolute end-3 top-3 rounded-lg px-2 py-1 text-caption font-semibold text-muted lg:hidden">
            {labels.close}
          </button>
        )}
        {sidebar}
      </aside>

      <main className="min-w-0 px-5 py-8 sm:px-10 lg:px-[53px] lg:py-12">{children}</main>
    </div>
  );
}
