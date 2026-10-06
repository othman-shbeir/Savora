import { describe, expect, it } from 'vitest';
import { buildReport, localDate, shiftDate, weekdayOf, type HourRow } from './analytics';

// Friday 9 October 2026, 09:30 UTC.
const NOW = new Date('2026-10-09T09:30:00Z');
const row = (iso: string, scans: number, qr = 0, ar = 0): HourRow => ({ hour: iso, scans, qr, ar });
const report = (rows: HourRow[], range: 'today' | '7d' | '30d', timezone = 'UTC', allTime = 0) => buildReport({ rows, allTime, liveSince: null, range, timezone, now: NOW });

describe('dates', () => {
  it('shifts calendar dates and knows weekdays', () => {
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekdayOf('2026-10-09')).toBe(5);
  });
  it('reads the wall clock of the location, not the server', () => {
    // 22:30 UTC on the 8th is already the 9th in Amman (UTC+3).
    expect(localDate(new Date('2026-10-08T22:30:00Z'), 'Asia/Amman')).toBe('2026-10-09');
    expect(localDate(new Date('2026-10-08T22:30:00Z'), 'UTC')).toBe('2026-10-08');
  });
});

describe('7-day report', () => {
  // Mon 18, Tue 24, Wed 31, Thu 27, Fri (today, partial) 12, plus Sat/Sun of the week before.
  const week = [
    row('2026-10-03T10:00:00Z', 39, 30, 20), // Sat
    row('2026-10-04T10:00:00Z', 31, 20, 10), // Sun
    row('2026-10-05T10:00:00Z', 18, 10, 9),
    row('2026-10-06T10:00:00Z', 24, 12, 12),
    row('2026-10-07T10:00:00Z', 31, 20, 15),
    row('2026-10-08T10:00:00Z', 27, 20, 14),
    row('2026-10-09T08:00:00Z', 12, 10, 6),
  ];

  it('lays out seven days ending today, with totals and the peak', () => {
    const r = report(week, '7d');
    expect(r.bars.map((b) => b.key)).toEqual(['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
    expect(r.total).toBe(182);
    expect(r.average).toBeCloseTo(26);
    expect(r.peak).toEqual({ key: '2026-10-03', scans: 39 });
    expect(r.sources).toEqual({ qr: 122, link: 60 });
    expect(r.yesterday).toBe(27);
  });

  it('says which day is busiest and how much the weekend brings', () => {
    const r = report(week, '7d');
    expect(r.insights[0]).toEqual({ kind: 'busiestDay', weekday: 6, scans: 39 });
    // Friday 12 + Saturday 39 of 182.
    expect(r.insights[1]).toEqual({ kind: 'weekend', pct: 28 });
  });

  it('compares today with a typical day up to the same hour, not with whole days', () => {
    // Previous days each had 3 scans by 09:00 and more later; today has 6 by 09:00.
    const rows = [
      ...Array.from({ length: 7 }, (_, i) => [row(`${shiftDate('2026-10-08', -i)}T08:00:00Z`, 3), row(`${shiftDate('2026-10-08', -i)}T15:00:00Z`, 20)]).flat(),
      row('2026-10-09T08:00:00Z', 6),
    ];
    const r = report(rows, '7d');
    expect(r.today).toEqual({ scans: 6, typical: 3, pct: 100 });
    expect(r.insights.find((i) => i.kind === 'today')).toEqual({ kind: 'today', pct: 100, scans: 6, typical: 3 });
  });

  it('stays quiet when there is nothing to say', () => {
    const r = report([], '7d');
    expect(r.total).toBe(0);
    expect(r.peak).toBeNull();
    expect(r.insights).toEqual([]);
    expect(r.today.typical).toBeNull();
  });
});

describe('today', () => {
  it('shows hours so far in the local time zone, and the peak hour', () => {
    // 05:00 and 06:00 UTC are 08:00 and 09:00 in Amman; now is 12:30 there.
    const r = report([row('2026-10-09T05:00:00Z', 4, 4, 1), row('2026-10-09T06:00:00Z', 9, 5, 6)], 'today', 'Asia/Amman');
    expect(r.unit).toBe('hour');
    expect(r.bars).toHaveLength(13);
    expect(r.bars[8]).toEqual({ key: '8', scans: 4 });
    expect(r.insights[0]).toEqual({ kind: 'peakHour', hour: 9, scans: 9 });
    expect(r.insights.find((i) => i.kind === 'qr')).toEqual({ kind: 'qr', pct: 69 });
  });
});

describe('30 days', () => {
  it('finds the busiest weekday on average and the main reading language', () => {
    const rows = Array.from({ length: 30 }, (_, i) => {
      const date = shiftDate('2026-10-09', -i);
      const scans = weekdayOf(date) === 4 ? 50 : 10; // Thursdays are busy
      return row(`${date}T10:00:00Z`, scans, scans, Math.round(scans * 0.7));
    });
    const r = report(rows, '30d', 'UTC', 9999);
    expect(r.bars).toHaveLength(30);
    expect(r.allTime).toBe(9999);
    expect(r.insights[0]).toEqual({ kind: 'busiestWeekday', weekday: 4, average: 50 });
    expect(r.insights).toContainEqual({ kind: 'qr', pct: 100 });
    expect(r.insights).toContainEqual({ kind: 'language', lang: 'ar', pct: 70 });
  });
});
