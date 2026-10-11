import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fill, isRange, type AnalyticsRange, type AnalyticsReport, type Insight, type Locale } from '@savora/shared';
import { ScanChart, type ChartBar } from '@/components/analytics/scan-chart';
import { AppShell } from '@/components/app-shell';
import { ButtonLink } from '@/components/ui/button';
import { Card, Overline } from '@/components/ui/card';
import { getAnalyticsOrLock } from '@/lib/api';
import { cx } from '@/lib/cx';
import { plural } from '@/lib/plural';
import { nameOf, requireWorkspace } from '@/lib/workspace';
import { getDictionary, getLocale } from '../../dictionaries';

type Text = Awaited<ReturnType<typeof getDictionary>>['analytics'];

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).nav.analytics };
}

// Western digits in both languages, as everywhere else in the app.
const intlLocale = (locale: Locale) => (locale === 'ar' ? 'ar-u-nu-latn' : 'en');
const noon = (date: string) => new Date(`${date}T12:00:00Z`);
const fmt = (locale: Locale, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(intlLocale(locale), { ...o, timeZone: 'UTC' });
const hourLabel = (h: number) => `${h}:00`;
const weekdayName = (weekday: number, locale: Locale) => fmt(locale, { weekday: 'long' }).format(new Date(Date.UTC(2026, 0, 4 + weekday, 12))); // 4 Jan 2026 is a Sunday
const n = (v: number) => v.toLocaleString('en');

function chartBars(r: AnalyticsReport, locale: Locale): ChartBar[] {
  if (r.unit === 'hour') return r.bars.map((b) => ({ ...b, short: hourLabel(Number(b.key)), long: `${hourLabel(Number(b.key))}–${hourLabel(Number(b.key) + 1)}`, showLabel: Number(b.key) % 3 === 0 }));
  const weekly = r.bars.length <= 7;
  const short = fmt(locale, weekly ? { weekday: 'short' } : { day: 'numeric', month: 'short' });
  const long = fmt(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  return r.bars.map((b, i) => ({ ...b, short: short.format(noon(b.key)), long: long.format(noon(b.key)), showLabel: weekly || i % 5 === 4 || i === r.bars.length - 1 }));
}

const ICON: Record<Insight['kind'], { path: React.ReactNode; tone: string }> = {
  busiestDay: { path: <polygon points="12 3 14.8 9 21 9.6 16.2 13.8 17.7 20 12 16.7 6.3 20 7.8 13.8 3 9.6 9.2 9" />, tone: 'bg-brand-soft text-brand' },
  busiestWeekday: { path: <polygon points="12 3 14.8 9 21 9.6 16.2 13.8 17.7 20 12 16.7 6.3 20 7.8 13.8 3 9.6 9.2 9" />, tone: 'bg-brand-soft text-brand' },
  peakHour: { path: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, tone: 'bg-brand-soft text-brand' },
  weekend: { path: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>, tone: 'bg-gold-soft text-gold' },
  today: { path: <polygon points="13 2 4 14 12 14 11 22 20 10 12 10 13 2" />, tone: 'bg-ok-soft text-ok' },
  qr: { path: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM17 17h4v4" /></>, tone: 'bg-gold-soft text-gold' },
  language: { path: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" /></>, tone: 'bg-ok-soft text-ok' },
};

function describe(i: Insight, t: Text, locale: Locale): { title: string; body: string } {
  const count = (v: number) => plural(locale, v, t.scans);
  switch (i.kind) {
    case 'busiestDay': {
      const day = weekdayName(i.weekday, locale);
      return { title: fill(t.busiestDayTitle, { day }), body: fill(t.busiestDayBody, { count: count(i.scans), day }) };
    }
    case 'busiestWeekday': {
      const day = weekdayName(i.weekday, locale);
      return { title: fill(t.busiestWeekdayTitle, { day }), body: fill(t.busiestWeekdayBody, { count: count(i.average), day }) };
    }
    case 'peakHour':
      return { title: fill(t.peakHourTitle, { hour: hourLabel(i.hour) }), body: fill(t.peakHourBody, { count: count(i.scans) }) };
    case 'weekend':
      return { title: fill(t.weekendTitle, { pct: i.pct }), body: t.weekendBody };
    case 'today': {
      const title = Math.abs(i.pct) < 5 ? t.todayEvenTitle : fill(i.pct > 0 ? t.todayAboveTitle : t.todayBelowTitle, { pct: Math.abs(i.pct) });
      return { title, body: fill(t.todayBody, { count: count(i.scans), typical: i.typical }) };
    }
    case 'qr':
      return { title: fill(t.qrTitle, { pct: i.pct }), body: t.qrBody };
    case 'language':
      return { title: fill(i.lang === 'ar' ? t.languageArTitle : t.languageEnTitle, { pct: i.pct }), body: t.languageBody };
  }
}

/** Scan analytics for the current location: totals, a chart, plain-language insights and where
 *  guests come from. The range lives in the URL (?range=today|7d|30d). */
export default async function AnalyticsPage({ searchParams }: PageProps<'/[lang]/app/analytics'>) {
  const [t, locale, query] = await Promise.all([getDictionary(), getLocale(), searchParams]);
  const a = t.analytics;
  const range: AnalyticsRange = isRange(query.range) ? query.range : '7d';
  const { ctx, shell } = await requireWorkspace(locale);
  const loc = ctx.location;
  const result = loc ? await getAnalyticsOrLock(loc.id, range) : null;
  if (loc && !result) notFound();
  const report = result && 'report' in result ? result.report : null;
  const locked = result && 'locked' in result ? result.locked : null;
  const live = loc?.status === 'live';

  const header = (
    <header className="flex flex-wrap items-end justify-between gap-5">
      <div>
        <Overline>{fill(a.overline, { location: loc ? nameOf(loc, locale) : '' })}</Overline>
        <h1 className="mt-2.5 text-heading-l font-semibold tracking-[-0.02em] sm:text-heading-xl">{a.title}</h1>
        <p className="mt-2 max-w-xl text-body-m text-muted">{a.lead}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <nav aria-label={a.rangeLabel} className="flex rounded-full border border-line bg-surface-2 p-1">
          {(['today', '7d', '30d'] as const).map((r) => (
            <Link
              key={r}
              href={`/${locale}/app/analytics?range=${r}`}
              aria-current={range === r ? 'page' : undefined}
              scroll={false}
              className={cx('rounded-full px-3.5 py-1.5 text-caption font-semibold transition-colors', range === r ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink')}
            >
              {r === 'today' ? a.today : r === '7d' ? a.d7 : a.d30}
            </Link>
          ))}
        </nav>
        <ButtonLink href={`/${locale}/app/qr`} variant="dark">
          {a.qr}
        </ButtonLink>
      </div>
    </header>
  );

  if (locked) {
    // Starter: the screen explains what Growth adds, and that scans are already waiting.
    return (
      <AppShell t={t} locale={locale} active="analytics" workspace={shell}>
        {header}
        <Card className="mt-7 grid max-w-2xl gap-3 p-8">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-caption font-semibold text-brand">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            {t.locks.growth}
          </span>
          <h2 className="text-heading-s font-semibold">{t.locks.analyticsTitle}</h2>
          <p className="max-w-lg text-body-m text-muted">{locked.allTime > 0 ? fill(t.locks.analyticsBody, { n: locked.allTime.toLocaleString('en') }) : t.locks.analyticsBodyZero}</p>
          <ButtonLink href={`/${locale}/app/billing`} className="mt-2 justify-self-start">
            {t.locks.seePlans}
          </ButtonLink>
        </Card>
      </AppShell>
    );
  }

  if (!loc || !report) {
    return (
      <AppShell t={t} locale={locale} active="analytics" workspace={shell}>
        {header}
        <Card className="mt-7 max-w-xl p-6">
          <p className="text-body-m text-muted">{t.editor.noLocation}</p>
        </Card>
      </AppShell>
    );
  }

  const bars = chartBars(report, locale);
  const avg = Math.round(report.average);
  const hero = range === 'today' ? a.heroToday : range === '7d' ? a.hero7d : a.hero30d;
  const today = report.today;
  const todayNote =
    today.pct === null
      ? a.todayNoBaseline
      : Math.abs(today.pct) < 5
        ? a.todayEven
        : fill(today.pct > 0 ? a.todayAbove : a.todayBelow, { pct: today.pct > 0 ? today.pct : `−${Math.abs(today.pct)}` });
  const empty = report.allTime === 0;
  const split = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

  return (
    <AppShell t={t} locale={locale} active="analytics" workspace={shell}>
      {header}

      {!live || empty ? (
        <Card className="mt-7 grid max-w-2xl gap-3 p-8">
          <span aria-hidden className="grid size-11 place-items-center rounded-xl bg-gold-soft text-gold">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
            </svg>
          </span>
          <h2 className="text-heading-s font-semibold">{live ? a.emptyTitle : a.notLiveTitle}</h2>
          <p className="max-w-lg text-body-m text-muted">{live ? a.emptyBody : a.notLiveBody}</p>
          <ButtonLink href={`/${locale}/app/${live ? 'qr' : 'menu'}`} className="mt-2 justify-self-start">
            {live ? a.emptyCta : a.notLiveCta}
          </ButtonLink>
        </Card>
      ) : (
        <>
          <div className="mt-7 grid gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <section className="flex items-end justify-between gap-4 rounded-[20px] bg-[#1c1c1c] p-5 text-[#f5f5f5] shadow-[0_18px_40px_rgb(28_28_28/0.22)]">
              <div>
                <p className="text-overline font-semibold tracking-[0.1em] text-[#a6a6a6] uppercase">{hero}</p>
                <p className="mt-3 text-[36px] leading-none font-semibold tabular-nums">{n(report.total)}</p>
                <p className="mt-1.5 text-caption text-[#a6a6a6]">{fill(range === 'today' ? a.heroNoteToday : a.heroNote, { n: avg })}</p>
              </div>
              <div aria-hidden className="flex h-11 items-end gap-[3px]">
                {report.bars.slice(-14).map((b) => {
                  const top = Math.max(...report.bars.slice(-14).map((x) => x.scans), 1);
                  return <span key={b.key} className={cx('w-[6px] rounded-t-[2px]', b.key === report.peak?.key ? 'bg-[#ff4d4d]' : 'bg-white/30')} style={{ height: `${Math.max(3, (b.scans / top) * 44)}px` }} />;
                })}
              </div>
            </section>
            {range === 'today' ? (
              <Tile label={a.tileYesterday} value={n(report.yesterday)} note={a.yesterdayNote} />
            ) : (
              <Tile label={a.tileToday} value={n(today.scans)} note={todayNote} tone={today.pct !== null && today.pct >= 0 ? 'text-ok' : undefined} />
            )}
            <Tile label={a.tileAllTime} value={n(report.allTime)} note={a.allTimeNote} />
          </div>

          <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
            <Card className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Overline>{a.chartOverline}</Overline>
                  <h2 className="mt-1 text-heading-s font-semibold">{report.unit === 'hour' ? a.chartTitleHours : a.chartTitleDays}</h2>
                </div>
                <span className="flex items-center gap-2 text-caption text-muted">
                  <span aria-hidden className="w-[18px] border-t-2 border-dashed border-ink-2" />
                  {fill(report.unit === 'hour' ? a.averageHour : a.averageDay, { n: avg })}
                </span>
              </div>
              <ScanChart
                key={range}
                bars={bars}
                peakKey={report.peak?.key ?? null}
                average={report.average}
                locale={locale}
                t={{
                  busiest: report.unit === 'hour' ? a.busiestHour : a.busiestDay,
                  average: a.averageDay,
                  scans: a.scans,
                  vsAverage: a.vsAverage,
                  showTable: a.showTable,
                  showChart: a.showChart,
                  colKey: report.unit === 'hour' ? a.colHour : a.colDay,
                  colScans: a.colScans,
                  chartLabel: a.chartLabel,
                }}
              />
            </Card>

            <Card className="px-6 py-2">
              <Overline className="pt-4">{range === 'today' ? a.insightsToday : range === '7d' ? a.insights7d : a.insights30d}</Overline>
              {report.insights.length ? (
                <ul>
                  {report.insights.map((i, k) => {
                    const d = describe(i, a, locale);
                    return (
                      <li key={i.kind} className={cx('flex gap-3.5 py-4', k < report.insights.length - 1 && 'border-b border-line')}>
                        <span aria-hidden className={cx('grid size-9 shrink-0 place-items-center rounded-[11px]', ICON[i.kind].tone)}>
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            {ICON[i.kind].path}
                          </svg>
                        </span>
                        <div>
                          <p className="text-body-s font-semibold">{d.title}</p>
                          <p className="mt-0.5 text-caption text-muted">{d.body}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="py-4">
                  <p className="text-body-s font-semibold">{a.quietTitle}</p>
                  <p className="mt-0.5 text-caption text-muted">{a.quietBody}</p>
                </div>
              )}
            </Card>
          </div>

          {report.total > 0 && (
            <Card className="mt-5 p-6">
              <h2 className="text-title-m font-semibold">{a.splitTitle}</h2>
              <div className="mt-4 grid gap-5 md:grid-cols-2">
                <Split label={[a.sourceQr, a.sourceLink]} values={[report.sources.qr, report.sources.link]} pct={split(report.sources.qr, report.total)} tones={['bg-brand-fill', 'bg-gold']} />
                <Split label={[a.langAr, a.langEn]} values={[report.languages.ar, report.languages.en]} pct={split(report.languages.ar, report.total)} tones={['bg-ink', 'bg-line-2']} />
              </div>
            </Card>
          )}
        </>
      )}

      <p className="mt-6 flex items-center gap-2 text-caption text-muted">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3Z" />
        </svg>
        {a.privacy}
      </p>
    </AppShell>
  );
}

function Tile({ label, value, note, tone }: { label: string; value: string; note: string; tone?: string }) {
  return (
    <Card className="flex flex-col justify-between gap-3 p-5">
      <p className="text-overline font-semibold tracking-[0.1em] text-muted uppercase">{label}</p>
      <div>
        <p className="text-[36px] leading-none font-semibold tabular-nums">{value}</p>
        <p className={cx('mt-1.5 text-caption', tone ?? 'text-muted')}>{note}</p>
      </div>
    </Card>
  );
}

/** Two-part share as one bar, labelled with words and numbers (never colour alone). */
function Split({ label, values, pct, tones }: { label: [string, string]; values: [number, number]; pct: number; tones: [string, string] }) {
  return (
    <div>
      <div className="flex justify-between gap-3 text-caption">
        <span>
          <span aria-hidden className={cx('me-1.5 inline-block size-2 rounded-full', tones[0])} />
          <span className="font-semibold">{label[0]}</span> <span className="text-muted tabular-nums">{pct}% · {values[0].toLocaleString('en')}</span>
        </span>
        <span>
          <span aria-hidden className={cx('me-1.5 inline-block size-2 rounded-full', tones[1])} />
          <span className="font-semibold">{label[1]}</span> <span className="text-muted tabular-nums">{100 - pct}% · {values[1].toLocaleString('en')}</span>
        </span>
      </div>
      <div aria-hidden className="mt-2 flex h-2.5 gap-[2px] overflow-hidden rounded-full">
        {pct > 0 && <span className={tones[0]} style={{ width: `${pct}%` }} />}
        {pct < 100 && <span className={cx('flex-1', tones[1])} />}
      </div>
    </div>
  );
}
