'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LOCALES, type Locale } from '@savora/shared';
import { cx } from '@/lib/cx';

const NAMES: Record<Locale, string> = { en: 'EN', ar: 'عربي' };

/** EN / عربي switch that keeps the visitor on the same page in the other language. */
export function LocaleSwitch({ current, label }: { current: Locale; label: string }) {
  const pathname = usePathname();
  const rest = pathname.replace(/^\/(en|ar)(?=\/|$)/, '');
  return (
    <nav aria-label={label} className="inline-flex rounded-full border border-line bg-surface-2 p-[3px]">
      {LOCALES.map((l) => (
        <Link
          key={l}
          href={`/${l}${rest}`}
          hrefLang={l}
          lang={l}
          aria-current={l === current ? 'true' : undefined}
          className={cx(
            'rounded-full px-3.5 py-1.5 text-caption font-semibold',
            l === current ? 'bg-surface text-ink shadow-[0_1px_3px_rgb(36_36_36/0.12)]' : 'text-muted hover:text-ink',
          )}
        >
          {NAMES[l]}
        </Link>
      ))}
    </nav>
  );
}
