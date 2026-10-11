'use client';

import { useState } from 'react';
import { fill, type Locale, type MenuItem } from '@savora/shared';
import { cx } from '@/lib/cx';
import { descriptionOf, primaryName, secondaryName } from '@/lib/menu-text';
import { Switch } from '../ui/switch';
import type { EditorText } from './menu-editor';

const iconButton = 'grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-30';

/** One dish in the list: category, photo, both names, price, the on-menu switch and row actions. */
export function ItemRow({
  item,
  categoryLabel,
  price,
  first,
  last,
  t,
  locale,
  onToggle,
  onMove,
  onEdit,
  onDelete,
}: {
  item: MenuItem;
  categoryLabel: string;
  price: string;
  first: boolean;
  last: boolean;
  t: EditorText;
  locale: Locale;
  onToggle: (on: boolean) => Promise<unknown>;
  onMove: (direction: 'up' | 'down') => Promise<unknown>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  // Shows the switch's new position while the save is in flight.
  const [pending, setPending] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const available = pending ?? item.available;
  const name = primaryName(item, locale);
  const other = secondaryName(item, locale);
  const desc = descriptionOf(item, locale);
  const missing = !item.nameAr ? t.noArabic : !item.nameEn ? t.noEnglish : null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  return (
    <li
      className={cx(
        'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 rounded-[14px] border border-line bg-surface p-3 transition-shadow hover:border-line-2 hover:shadow-card sm:grid-cols-[88px_auto_minmax(0,1fr)_auto_auto_auto] sm:px-4',
        !available && 'bg-surface-2',
      )}
    >
      <span className="hidden truncate rounded-full bg-brand-soft px-2.5 py-1 text-center text-[10px] font-semibold tracking-[0.05em] text-brand uppercase sm:block">{categoryLabel}</span>

      <span className={cx('relative size-14 shrink-0 overflow-hidden rounded-xl bg-surface-2', !available && 'opacity-50')}>
        {item.photo ? (
          // Already a 480px WebP thumbnail from the API; next/image would only re-encode it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.photo.thumbUrl} alt="" width={56} height={56} loading="lazy" className="size-full object-cover" />
        ) : (
          <span aria-hidden className="grid size-full place-items-center border border-dashed border-line-2 text-muted">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="3" />
              <circle cx="9" cy="11" r="2" />
              <path d="m21 16-5-5-8 8" />
            </svg>
          </span>
        )}
      </span>

      {/* Hidden dishes read as quieter, but stay legible: muted text and the badge, not transparency. */}
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <strong className={cx('text-title-s font-semibold', !available && 'text-muted')}>{name}</strong>
          {!available && <span className="rounded-full border border-line-2 px-2 py-0.5 text-[10px] font-semibold text-muted">{t.hidden}</span>}
          {missing && <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[10px] font-semibold text-gold-ink">{missing}</span>}
        </p>
        <p className="mt-0.5 truncate text-caption text-muted">
          {other && (
            <span lang={locale === 'ar' ? 'en' : 'ar'} dir="auto">
              {other}
            </span>
          )}
          {other && desc && ' · '}
          {desc}
        </p>
        <p className="mt-1 text-[11px] font-semibold text-brand sm:hidden">{categoryLabel}</p>
      </div>

      <strong dir="ltr" className="font-mono text-body-s font-semibold">
        {price}
      </strong>

      <div className="col-span-3 flex items-center justify-between gap-3 border-t border-line pt-3 sm:col-span-2 sm:justify-end sm:border-0 sm:pt-0">
        <Switch
          label={fill(t.showOnMenu, { name })}
          checked={available}
          disabled={pending !== null}
          onChange={async (on) => {
            setPending(on);
            await onToggle(on);
            setPending(null);
          }}
        />
        <div className="flex items-center gap-0.5">
          <button type="button" className={iconButton} disabled={first || busy} aria-label={fill(t.moveUp, { name })} onClick={() => run(() => onMove('up'))}>
            <span aria-hidden>↑</span>
          </button>
          <button type="button" className={iconButton} disabled={last || busy} aria-label={fill(t.moveDown, { name })} onClick={() => run(() => onMove('down'))}>
            <span aria-hidden>↓</span>
          </button>
          <button type="button" className={iconButton} aria-label={fill(t.edit, { name })} onClick={onEdit}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
          <button type="button" className={cx(iconButton, 'hover:bg-brand-soft hover:text-brand')} aria-label={fill(t.delete, { name })} onClick={onDelete}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      </div>
    </li>
  );
}
