import type { Metadata } from 'next';
import Link from 'next/link';
import { fill } from '@savora/shared';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card, Overline } from '@/components/ui/card';
import { getOverview } from '@/lib/api';
import { cx } from '@/lib/cx';
import { plural } from '@/lib/plural';
import { nameOf, requireWorkspace } from '@/lib/workspace';
import { getDictionary, getLocale } from '../dictionaries';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).nav.overview };
}

function Check({ done }: { done: boolean }) {
  return (
    <span aria-hidden className={cx('grid size-6 shrink-0 place-items-center rounded-full', done ? 'bg-ok text-white' : 'border-[1.5px] border-dashed border-line-2')}>
      {done && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </span>
  );
}

export default async function OverviewPage() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const { org, ctx, shell } = await requireWorkspace(locale);
  const overview = await getOverview(org.id);
  const o = t.overview;
  const stats = overview?.stats ?? { locations: 0, live: 0, menuItems: 0, totalScans: 0 };
  const brand = ctx.brand ?? org.brands[0];
  const anyLive = stats.live > 0;

  const STATS = [
    { label: o.locations, value: stats.locations, tone: '' },
    { label: o.live, value: stats.live, tone: 'text-ok' },
    { label: o.menuItems, value: stats.menuItems, tone: '' },
    { label: o.totalScans, value: stats.totalScans, tone: 'text-brand' },
  ];

  return (
    <AppShell t={t} locale={locale} active="overview" workspace={shell}>
      <header>
        <Overline>{o.overline}</Overline>
        <h1 className="mt-2.5 text-heading-l font-semibold tracking-[-0.02em]">{nameOf(org, locale)}</h1>
        <p className="mt-1.5 max-w-xl text-body-m text-muted">{o.lead}</p>
      </header>

      <Card className="mt-7 flex flex-wrap items-center justify-between gap-6 p-6">
        <div className="flex items-start gap-4">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-title-m font-bold text-white">
            {nameOf(org, locale).slice(0, 1)}
          </span>
          <div>
            <Overline>{o.glanceOverline}</Overline>
            <h2 className="mt-1 text-heading-s font-semibold">{o.glanceTitle}</h2>
            <p className="mt-1 text-body-s text-muted">{o.glanceBody}</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="border-s border-line ps-4">
              <dd className={cx('text-heading-m font-semibold tabular-nums', s.tone)}>{s.value.toLocaleString('en')}</dd>
              <dt className="text-overline font-semibold tracking-[0.1em] text-muted uppercase">{s.label}</dt>
            </div>
          ))}
        </dl>
      </Card>

      {org.brands.map((b) => (
        <section key={b.id} className="mt-9">
          <div className="flex items-end justify-between gap-4">
            <div className="flex items-center gap-3">
              <span aria-hidden className="grid size-8 place-items-center rounded-lg border border-line bg-surface text-caption font-bold text-brand">
                {nameOf(b, locale).slice(0, 1)}
              </span>
              <div>
                <h2 className="text-title-m font-semibold">{nameOf(b, locale)}</h2>
                {b.nameAr && locale === 'en' && (
                  <p lang="ar" dir="rtl" className="text-caption text-muted">
                    {b.nameAr}
                  </p>
                )}
              </div>
            </div>
            <p className="text-overline font-semibold tracking-[0.1em] text-muted uppercase">{fill(o.locationsCount, { n: b.locations.length })}</p>
          </div>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {b.locations.map((l) => (
              <li key={l.id}>
                <Card className={cx('border-t-[3px] p-5', l.status === 'live' ? 'border-t-ok' : 'border-t-gold')}>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-title-s font-semibold">{nameOf(l, locale)}</h3>
                    {l.paused ? (
                      <Badge tone="brand">{t.locks.paused}</Badge>
                    ) : (
                      <Badge tone={l.status === 'live' ? 'ok' : 'gold'}>{l.status === 'live' ? o.statusLive : o.statusDraft}</Badge>
                    )}
                  </div>
                  <p className="mt-5 flex items-baseline gap-1.5">
                    <span className="text-heading-l font-semibold tabular-nums">{(overview?.itemsByLocation[l.id] ?? 0).toLocaleString('en')}</span>
                    <span className="text-body-s text-muted">{o.itemsAvailable}</span>
                  </p>
                  <div className="mt-4 flex items-center justify-between text-caption">
                    <span className="text-muted">{plural(locale, overview?.scansByLocation[l.id] ?? 0, t.analytics.scans)}</span>
                    <Link href={`/${locale}/app/menu`} className="font-semibold text-brand">
                      {o.manage} <span aria-hidden>{locale === 'ar' ? '←' : '→'}</span>
                    </Link>
                  </div>
                  <p dir="ltr" className="mt-3 truncate border-t border-line pt-3 text-caption text-muted">
                    savora.menu/r/{l.slug}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="mt-9 grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card className="p-6">
          <Overline>{o.pathOverline}</Overline>
          <h2 className="mt-1 text-heading-s font-semibold">{o.pathTitle}</h2>
          <ol className="mt-5 grid">
            <li className="flex items-center gap-3.5 border-b border-line py-4">
              <Check done />
              <span>
                <span className="block text-title-s font-semibold">{o.stepProfile}</span>
                <span className="block text-caption text-muted">{o.stepProfileDone}</span>
              </span>
            </li>
            <li className="flex items-center gap-3.5 border-b border-line py-4">
              <Check done={stats.menuItems > 0} />
              <span className="flex-1">
                <span className="block text-title-s font-semibold">{o.stepMenu}</span>
                <span className="block text-caption text-muted">{o.stepMenuBody}</span>
              </span>
              <ButtonLink href={`/${locale}/app/menu`} variant="secondary" size="sm">
                {o.addDishes}
              </ButtonLink>
            </li>
            <li className="flex items-center gap-3.5 py-4">
              <Check done={anyLive} />
              <span className="flex-1">
                <span className="block text-title-s font-semibold">{o.stepShare}</span>
                <span className="block text-caption text-muted">{o.stepShareBody}</span>
              </span>
              <ButtonLink href={`/${locale}/app/qr`} variant="secondary" size="sm">
                {o.openQr}
              </ButtonLink>
            </li>
          </ol>
        </Card>

        <Card className="p-6">
          <Overline>{o.identityOverline}</Overline>
          <h2 className="mt-1 text-heading-s font-semibold">{o.identityTitle}</h2>
          <div className="mt-5 rounded-2xl border border-line bg-surface-2 p-6 text-center">
            <span aria-hidden className="mx-auto grid size-11 place-items-center rounded-full border border-brand text-title-s font-bold text-brand">
              {brand ? nameOf(brand, locale).slice(0, 1) : 'S'}
            </span>
            <p className="mt-3 text-heading-s font-semibold">{brand ? nameOf(brand, locale) : nameOf(org, locale)}</p>
            {brand && (locale === 'ar' ? brand.taglineAr : brand.taglineEn) && <p className="mt-1 text-caption text-muted">{locale === 'ar' ? brand.taglineAr : brand.taglineEn}</p>}
            <p className="mt-5 border-t border-line pt-4 text-caption text-muted">{o.identityEmpty}</p>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
