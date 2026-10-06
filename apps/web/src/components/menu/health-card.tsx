import { fill, type HealthCheck, type Locale } from '@savora/shared';
import { cx } from '@/lib/cx';
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

export function HealthCard({ checks, t, locale }: { checks: HealthCheck[]; t: EditorText; locale: Locale }) {
  const ready = checks.every((c) => c.ok);
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
          return (
            <li key={c.key} className={cx('flex items-start gap-2.5 rounded-xl border p-3', c.ok ? 'border-line' : 'border-gold bg-gold-soft')}>
              <span aria-hidden className={cx('mt-px grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold', c.ok ? 'bg-ok-soft text-ok' : 'bg-gold text-[#242424]')}>
                {c.ok ? '✓' : '!'}
              </span>
              <div className="min-w-0">
                <p className="text-caption font-semibold">{d.title}</p>
                <p className="mt-0.5 text-caption text-muted">{c.ok ? t.allClear : d.bad}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
