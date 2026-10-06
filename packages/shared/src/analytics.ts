// Scan analytics, computed from hourly counts in the location's own time zone. Pure functions, so
// the API and tests share them.

export const RANGES = ['today', '7d', '30d'] as const;
export type AnalyticsRange = (typeof RANGES)[number];
export const isRange = (v: unknown): v is AnalyticsRange => RANGES.includes(v as AnalyticsRange);

/** One stored row: counts for one UTC hour. */
export type HourRow = { hour: Date | string; scans: number; qr: number; ar: number };

export type Insight =
  | { kind: 'busiestDay'; weekday: number; scans: number }
  | { kind: 'busiestWeekday'; weekday: number; average: number }
  | { kind: 'peakHour'; hour: number; scans: number }
  | { kind: 'weekend'; pct: number }
  | { kind: 'today'; pct: number; scans: number; typical: number }
  | { kind: 'qr'; pct: number }
  | { kind: 'language'; lang: 'ar' | 'en'; pct: number };

export type AnalyticsReport = {
  range: AnalyticsRange;
  timezone: string;
  unit: 'day' | 'hour';
  /** 'YYYY-MM-DD' for days, '0'…'23' for hours. The last bar is "now" and may still be filling. */
  bars: Array<{ key: string; scans: number }>;
  total: number;
  /** Per bar: scans per day, or per hour so far today. */
  average: number;
  peak: { key: string; scans: number } | null;
  /** Today so far, against the previous 7 days up to the same hour; pct is null without history. */
  today: { scans: number; typical: number | null; pct: number | null };
  yesterday: number;
  allTime: number;
  liveSince: string | null;
  sources: { qr: number; link: number };
  languages: { ar: number; en: number };
  insights: Insight[];
};

// ---------- Dates in a time zone ----------

const formatters = new Map<string, Intl.DateTimeFormat>();
function partsIn(d: Date, tz: string) {
  let f = formatters.get(tz);
  if (!f) formatters.set(tz, (f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })));
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

/** 'YYYY-MM-DD' of an instant, as the location's wall clock reads it. */
export const localDate = (d: Date, tz: string) => partsIn(d, tz).date;
export const localHour = (d: Date, tz: string) => partsIn(d, tz).hour;

/** Calendar arithmetic on 'YYYY-MM-DD' strings (noon UTC avoids any DST edge). */
export function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** 0 = Sunday … 6 = Saturday. */
export const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** True for a valid IANA zone name such as 'Asia/Hebron'. */
export function isTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ---------- Report ----------

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
/** Palestinian and Jordanian weekends: Friday and Saturday. */
const WEEKEND = [5, 6];

/** Builds everything the analytics screen shows. `rows` must cover at least the range plus the
 *  previous 7 days (for the "typical day" comparison). */
export function buildReport(input: { rows: HourRow[]; allTime: number; liveSince: string | null; range: AnalyticsRange; timezone: string; now: Date }): AnalyticsReport {
  const { rows, range, timezone: tz, now } = input;
  const today = localDate(now, tz);
  const nowHour = localHour(now, tz);

  // Bucket every row by local date and local hour.
  const byDate = new Map<string, { scans: number; qr: number; ar: number }>();
  const byHour = new Map<string, number>(); // `${date}|${hour}`
  for (const r of rows) {
    const { date, hour } = partsIn(new Date(r.hour), tz);
    const d = byDate.get(date) ?? { scans: 0, qr: 0, ar: 0 };
    d.scans += r.scans;
    d.qr += r.qr;
    d.ar += r.ar;
    byDate.set(date, d);
    byHour.set(`${date}|${hour}`, (byHour.get(`${date}|${hour}`) ?? 0) + r.scans);
  }
  const dayScans = (date: string) => byDate.get(date)?.scans ?? 0;
  const scansUpTo = (date: string, hour: number) => {
    let n = 0;
    for (let h = 0; h <= hour; h++) n += byHour.get(`${date}|${h}`) ?? 0;
    return n;
  };

  const days = range === '30d' ? 30 : range === '7d' ? 7 : 1;
  const dates = Array.from({ length: days }, (_, i) => shiftDate(today, i - days + 1));
  const bars =
    range === 'today'
      ? Array.from({ length: nowHour + 1 }, (_, h) => ({ key: String(h), scans: byHour.get(`${today}|${h}`) ?? 0 }))
      : dates.map((date) => ({ key: date, scans: dayScans(date) }));

  const inRange = dates.map((date) => byDate.get(date) ?? { scans: 0, qr: 0, ar: 0 });
  const total = inRange.reduce((n, d) => n + d.scans, 0);
  const qr = inRange.reduce((n, d) => n + d.qr, 0);
  const ar = inRange.reduce((n, d) => n + d.ar, 0);
  const peakBar = bars.reduce<{ key: string; scans: number } | null>((best, b) => (b.scans > (best?.scans ?? 0) ? b : best), null);

  // A fair "today": compared with the previous 7 days up to the same hour, not with whole days.
  const previous = Array.from({ length: 7 }, (_, i) => shiftDate(today, -1 - i));
  const typicalSoFar = previous.reduce((n, date) => n + scansUpTo(date, nowHour), 0) / 7;
  const todayScans = dayScans(today);
  const todayPct = typicalSoFar >= 1 ? Math.round((todayScans / typicalSoFar - 1) * 100) : null;

  const insights: Insight[] = [];
  if (total > 0) {
    if (range === '7d') {
      const peakDate = dates.reduce((best, date) => (dayScans(date) > dayScans(best) ? date : best), dates[0]!);
      insights.push({ kind: 'busiestDay', weekday: weekdayOf(peakDate), scans: dayScans(peakDate) });
      insights.push({ kind: 'weekend', pct: pct(dates.filter((d) => WEEKEND.includes(weekdayOf(d))).reduce((n, d) => n + dayScans(d), 0), total) });
    } else if (range === '30d') {
      // Busiest weekday on average, so a single festival day doesn't decide it.
      const sums = Array.from({ length: 7 }, () => ({ scans: 0, days: 0 }));
      for (const date of dates) {
        const s = sums[weekdayOf(date)]!;
        s.scans += dayScans(date);
        s.days += 1;
      }
      const best = sums.map((s, weekday) => ({ weekday, average: s.days ? s.scans / s.days : 0 })).reduce((a, b) => (b.average > a.average ? b : a));
      insights.push({ kind: 'busiestWeekday', weekday: best.weekday, average: Math.round(best.average) });
    } else if (peakBar) {
      insights.push({ kind: 'peakHour', hour: Number(peakBar.key), scans: peakBar.scans });
    }
    if (range !== '30d' && todayPct !== null) insights.push({ kind: 'today', pct: todayPct, scans: todayScans, typical: Math.round(typicalSoFar) });
    if (range !== '7d') insights.push({ kind: 'qr', pct: pct(qr, total) });
    if (range === '30d') insights.push(ar * 2 >= total ? { kind: 'language', lang: 'ar', pct: pct(ar, total) } : { kind: 'language', lang: 'en', pct: pct(total - ar, total) });
  }

  return {
    range,
    timezone: tz,
    unit: range === 'today' ? 'hour' : 'day',
    bars,
    total,
    average: bars.length ? total / bars.length : 0,
    peak: peakBar,
    today: { scans: todayScans, typical: todayPct === null ? null : Math.round(typicalSoFar), pct: todayPct },
    yesterday: dayScans(shiftDate(today, -1)),
    allTime: input.allTime,
    liveSince: input.liveSince,
    sources: { qr, link: total - qr },
    languages: { ar, en: total - ar },
    insights,
  };
}
