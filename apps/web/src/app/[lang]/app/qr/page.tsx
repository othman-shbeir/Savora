import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fill, type AnalyticsReport, type Locale } from '@savora/shared';
import { QrStudio } from '@/components/qr/qr-studio';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card, Overline } from '@/components/ui/card';
import { getAnalytics, getMenu, MENU_ORIGIN } from '@/lib/api';
import { cx } from '@/lib/cx';
import { requireWorkspace } from '@/lib/workspace';
import { getDictionary, getLocale } from '../../dictionaries';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).nav.qr };
}

/** The design's "Scans this week" card: the week's total, today, and the busiest day. */
function WeekCard({ week, t, locale }: { week: AnalyticsReport; t: Awaited<ReturnType<typeof getDictionary>>['qr']; locale: Locale }) {
  const busiest = week.insights.find((i) => i.kind === 'busiestDay');
  const day =
    busiest?.kind === 'busiestDay'
      ? new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 4 + busiest.weekday, 12)))
      : null;
  const top = Math.max(week.peak?.scans ?? 1, 1);
  return (
    <Link href={`/${locale}/app/analytics`} className="block rounded-[20px] transition-shadow hover:shadow-raised">
      <Card className="flex items-end justify-between gap-4 p-5">
        <div>
          <p className="text-overline font-semibold tracking-[0.1em] text-muted uppercase">{t.weekOverline}</p>
          <p className="mt-2 text-[32px] leading-none font-semibold tabular-nums">{week.total.toLocaleString('en')}</p>
          <p className="mt-1.5 text-caption text-muted">{day ? fill(t.weekNote, { today: week.today.scans, day }) : fill(t.weekNoteQuiet, { today: week.today.scans })}</p>
        </div>
        <div aria-hidden className="flex h-12 items-end gap-1">
          {week.bars.map((b) => (
            <span key={b.key} className={cx('w-2 rounded-t-[2px]', b.key === week.peak?.key ? 'bg-brand-fill' : 'bg-gold/45')} style={{ height: `${Math.max(3, (b.scans / top) * 48)}px` }} />
          ))}
        </div>
      </Card>
    </Link>
  );
}

/** The current location's permanent QR code: print studio, share links and why it never changes. */
export default async function QrPage() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const { ctx, org } = await requireWorkspace(locale);
  const q = t.qr;
  const loc = ctx.location;
  const draft = loc ? await getMenu(loc.id) : null;
  if (loc && !draft) notFound();
  const brand = ctx.brand ?? org.brands[0];
  const live = Boolean(draft?.published) && loc?.status === 'live';
  const week = live && loc ? await getAnalytics(loc.id, '7d') : null;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <Overline>{q.overline}</Overline>
          <h1 className="mt-2.5 text-heading-l font-semibold tracking-[-0.02em] sm:text-heading-xl">{q.title}</h1>
          <p className="mt-2 max-w-xl text-body-m text-muted">{q.lead}</p>
        </div>
        {loc &&
          (live ? (
            <Badge tone="ok">{q.live}</Badge>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="gold">{q.notLive}</Badge>
              <ButtonLink href={`/${locale}/app/menu`} size="sm">
                {q.publishCta}
              </ButtonLink>
            </div>
          ))}
      </header>

      {loc && brand ? (
        <QrStudio
          key={loc.id}
          t={q}
          locale={locale}
          slug={loc.slug}
          origin={MENU_ORIGIN}
          card={{ nameEn: brand.nameEn, nameAr: brand.nameAr, taglineEn: brand.taglineEn }}
          aside={week && week.allTime > 0 ? <WeekCard week={week} t={q} locale={locale} /> : null}
        />
      ) : (
        <Card className="mt-7 max-w-xl p-6">
          <p className="text-body-m text-muted">{t.editor.noLocation}</p>
        </Card>
      )}
    </>
  );
}
