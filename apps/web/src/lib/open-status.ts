import { fill, openStatus, type Closure, type Locale, type WeekHours } from '@savora/shared';

type Text = { openUntil: string; closedOpens: string; closedOpensTomorrow: string; closedOpensDay: string; closedToday: string; closedTodayNote: string; closedForNow: string };

/** Weekday name with western digits, e.g. "Saturday" / "السبت". 4 Jan 2026 is a Sunday. */
export const weekdayName = (weekday: number, locale: Locale) =>
  new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 4 + weekday, 12)));

/** "Open now · until 23:00", "Closed · opens 07:00 tomorrow"…, or null when no hours are set. */
export function openStatusText(hours: WeekHours | null, closures: Closure[], tz: string, now: Date, t: Text, locale: Locale) {
  const s = openStatus(hours, closures, tz, now);
  if (!s) return null;
  switch (s.state) {
    case 'open':
      return { open: true, text: fill(t.openUntil, { time: s.until }) };
    case 'closed':
      return {
        open: false,
        text:
          s.opensDay === 'today'
            ? fill(t.closedOpens, { time: s.opensAt })
            : s.opensDay === 'tomorrow'
              ? fill(t.closedOpensTomorrow, { time: s.opensAt })
              : fill(t.closedOpensDay, { day: weekdayName(s.opensDay, locale), time: s.opensAt }),
      };
    case 'closedToday':
      return { open: false, text: s.note ? fill(t.closedTodayNote, { note: s.note }) : t.closedToday };
    case 'closedForNow':
      return { open: false, text: t.closedForNow };
  }
}
