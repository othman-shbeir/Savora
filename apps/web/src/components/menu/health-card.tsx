'use client';

import { useState } from 'react';
import { fill, formatPrice, priceCheck, type HealthCheck, type Locale, type MenuCategory, type MenuItem } from '@savora/shared';
import { cx } from '@/lib/cx';
import { primaryName } from '@/lib/menu-text';
import { Badge } from '../ui/badge';
import { Card, Overline } from '../ui/card';
import type { EditorText } from './menu-editor';

/** Turns each check into a title and a sentence, naming up to two items so the owner knows where to look. */
function describe(c: HealthCheck, t: EditorText, locale: Locale) {
  const names = c.examples.join(locale === 'ar' ? '، ' : ', ');
  const list = c.count > c.examples.length ? fill(t.andMore, { list: names, n: c.count - c.examples.length }) : names;
  switch (c.key) {
    case 'items':
      return { title: t.checkItems, bad: t.checkItemsBad };
    case 'names':
      return c.missing === 'en' ? { title: t.checkNamesEn, bad: fill(t.checkNamesBadEn, { list }) } : { title: t.checkNamesAr, bad: fill(t.checkNamesBadAr, { list }) };
    case 'categories':
      return { title: t.checkCategories, bad: fill(t.checkCategoriesBad, { list }) };
    case 'prices':
      return { title: t.checkPrices, bad: fill(t.checkPricesBad, { list }) };
  }
}

/** Each check opens its full result underneath: every dish or category it looked at that needs a
 *  look, with a shortcut to fix it. */
export function HealthCard({
  checks,
  categories,
  currency,
  t,
  locale,
  onEditItem,
  onEditCategories,
}: {
  checks: HealthCheck[];
  categories: MenuCategory[];
  currency: string;
  t: EditorText;
  locale: Locale;
  onEditItem: (item: MenuItem) => void;
  onEditCategories: () => void;
}) {
  const [openKey, setOpenKey] = useState<HealthCheck['key'] | null>(null);
  const ready = checks.every((c) => c.ok);
  const open = checks.find((c) => c.key === openKey);

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-[1_1_240px]">
          <Overline>{t.healthOverline}</Overline>
          <h2 className="mt-1 text-heading-s font-semibold">{t.healthTitle}</h2>
          <p className="mt-1 max-w-[340px] text-caption text-muted">{t.healthBody}</p>
        </div>
        <Badge tone={ready ? 'ok' : 'gold'}>{ready ? t.healthReady : t.healthAttention}</Badge>
      </div>
      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {checks.map((c) => {
          const d = describe(c, t, locale);
          const on = c.key === openKey;
          return (
            <li key={c.key}>
              <button
                type="button"
                aria-expanded={on}
                aria-controls="health-result"
                title={on ? t.hideResult : t.showResult}
                onClick={() => setOpenKey(on ? null : c.key)}
                className={cx(
                  'flex size-full items-start gap-2.5 rounded-xl border p-3 text-start transition-colors',
                  c.ok ? 'border-line hover:border-line-2 hover:bg-surface-2' : 'border-gold bg-gold-soft hover:brightness-[0.98]',
                  on && 'ring-2 ring-ink/80',
                )}
              >
                <span aria-hidden className={cx('mt-px grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold', c.ok ? 'bg-ok-soft text-ok' : 'bg-gold text-[#242424]')}>
                  {c.ok ? '✓' : '!'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-caption font-semibold">{d.title}</span>
                  <span className="mt-0.5 block text-caption text-muted">{c.ok ? t.allClear : d.bad}</span>
                </span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className={cx('mt-0.5 shrink-0 text-muted transition-transform', on && 'rotate-180')}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
      {open && (
        <div id="health-result" role="region" aria-label={describe(open, t, locale).title} className="mt-3 rounded-xl border border-line bg-surface-2 p-4 text-caption">
          <Result check={open} categories={categories} currency={currency} t={t} locale={locale} onEditItem={onEditItem} onEditCategories={onEditCategories} />
        </div>
      )}
    </Card>
  );
}

type Row = { key: string; name: string; note?: string; tag?: { text: string; tone: 'gold' | 'muted' }; fix?: () => void; fixLabel?: string };

function Result({
  check,
  categories,
  currency,
  t,
  locale,
  onEditItem,
  onEditCategories,
}: {
  check: HealthCheck;
  categories: MenuCategory[];
  currency: string;
  t: EditorText;
  locale: Locale;
  onEditItem: (item: MenuItem) => void;
  onEditCategories: () => void;
}) {
  const items = categories.flatMap((c) => c.items);
  const categoryOf = (item: MenuItem) => categories.find((c) => c.id === item.categoryId);
  const dish = (item: MenuItem, extra: Partial<Row> = {}): Row => ({
    key: item.id,
    name: primaryName(item, locale) || '—',
    note: categoryOf(item) ? primaryName(categoryOf(item)!, locale) : undefined,
    fix: () => onEditItem(item),
    fixLabel: fill(t.edit, { name: primaryName(item, locale) }),
    ...extra,
  });

  let lead: string;
  let rows: Row[] = [];
  switch (check.key) {
    case 'items': {
      const hidden = items.filter((i) => !i.available);
      lead = fill(t.detailItems, { shown: items.length - hidden.length, hidden: hidden.length });
      rows = hidden.map((i) => dish(i, { tag: { text: t.hidden, tone: 'muted' } }));
      if (!hidden.length && items.length) lead += ` ${t.detailHiddenNone}`;
      break;
    }
    case 'names': {
      const lang = check.missing === 'en' ? 'nameEn' : 'nameAr';
      const missingCats = categories.filter((c) => !c[lang]);
      const missingItems = items.filter((i) => !i[lang]);
      lead = missingCats.length + missingItems.length ? (lang === 'nameAr' ? t.detailNamesAr : t.detailNamesEn) : t.detailNamesOk;
      rows = [
        ...missingCats.map((c) => ({ key: c.id, name: primaryName(c, locale) || '—', note: t.detailCategory, fix: onEditCategories, fixLabel: t.manageCategories })),
        ...missingItems.map((i) => dish(i)),
      ];
      break;
    }
    case 'categories':
      lead = '';
      rows = categories.map((c) => {
        const n = c.items.filter((i) => i.available).length;
        return {
          key: c.id,
          name: primaryName(c, locale) || '—',
          tag: n ? { text: fill(t.detailOnShow, { n }), tone: 'muted' } : { text: t.detailNothingOnShow, tone: 'gold' },
          fix: n ? undefined : onEditCategories,
          fixLabel: t.manageCategories,
        };
      });
      break;
    case 'prices': {
      const { typical, odd, reason } = priceCheck(categories);
      const reasonText = { free: t.detailFree, high: t.detailHigh, low: t.detailLow };
      lead = [typical ? fill(t.detailTypical, { price: formatPrice(Math.round(typical), currency) }) : '', odd.length ? '' : t.detailPricesOk].filter(Boolean).join(' · ');
      rows = odd.map((i) => dish(i, { note: formatPrice(i.priceMinor, currency), tag: { text: reasonText[reason(i)!], tone: 'gold' } }));
      break;
    }
  }

  return (
    <>
      {lead && <p className="text-ink-2">{lead}</p>}
      {rows.length > 0 && (
        <ul className={cx('grid gap-1.5', lead && 'mt-3')}>
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink">{r.name}</span>
                {r.note && (
                  <span dir="auto" className="block truncate text-muted">
                    {r.note}
                  </span>
                )}
              </span>
              {r.tag && (
                <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', r.tag.tone === 'gold' ? 'bg-gold-soft text-gold-ink' : 'bg-surface-2 text-muted')}>
                  {r.tag.text}
                </span>
              )}
              {r.fix && (
                <button type="button" onClick={r.fix} aria-label={r.fixLabel} className="shrink-0 rounded-lg px-2 py-1 font-semibold text-brand hover:bg-brand-soft">
                  {r.fix === onEditCategories ? r.fixLabel : t.fixItem}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
