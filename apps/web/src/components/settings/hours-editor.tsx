'use client';

import { fill, localDate, weekdayOf, type Closure, type Locale, type WeekHours } from '@savora/shared';
import { cx } from '@/lib/cx';
import { weekdayName } from '@/lib/open-status';
import { Switch } from '../ui/switch';

/** The regional week starts on Saturday. */
const ORDER = [6, 0, 1, 2, 3, 4, 5];

type Text = {
  today: string;
  dayOpen: string;
  opens: string;
  closes: string;
  closed: string;
  pastMidnight: string;
  copyFirst: string;
  closures: string;
  addClosure: string;
  closureNote: string;
  closureNotePh: string;
  removeClosure: string;
};

const timeInput =
  'h-9 rounded-[9px] border border-line-2 bg-surface ps-2.5 pe-7 font-mono text-caption tabular-nums outline-none focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-soft)] disabled:opacity-50';

/** 00:00 … 23:45, 24-hour, every 15 minutes. */
const TIMES = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);

/** A 24-hour time picker. A saved time off the 15-minute grid is kept as an extra option. */
function TimeSelect({ value, label, disabled, onChange }: { value: string; label: string; disabled?: boolean; onChange: (v: string) => void }) {
  return (
    <select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={timeInput}>
      {!TIMES.includes(value) && <option value={value}>{value}</option>}
      {TIMES.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

/** Seven rows of hours with the week starting Saturday, plus one-off holiday closures. */
export function HoursEditor({
  hours,
  closures,
  timezone,
  onHours,
  onClosures,
  disabled,
  t,
  locale,
}: {
  hours: WeekHours;
  closures: Closure[];
  timezone: string;
  onHours: (h: WeekHours) => void;
  onClosures: (c: Closure[]) => void;
  disabled?: boolean;
  t: Text;
  locale: Locale;
}) {
  const today = weekdayOf(localDate(new Date(), timezone));
  const set = (day: number, patch: Partial<WeekHours[number]>) => onHours(hours.map((d, i) => (i === day ? { ...d, ...patch } : d)) as WeekHours);
  const first = ORDER[0]!;

  return (
    <div>
      <ul className="grid gap-1">
        {ORDER.map((day) => {
          const d = hours[day]!;
          const name = weekdayName(day, locale);
          const overnight = d.open && d.to <= d.from && d.to !== '00:00';
          return (
            <li key={day} className={cx('flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-3 py-2', day === today ? 'bg-surface-2 ring-1 ring-line' : '')}>
              <span className="flex w-[150px] shrink-0 items-center gap-2 text-body-s font-semibold">
                {name}
                {day === today && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-brand uppercase">{t.today}</span>}
              </span>
              <Switch label={fill(t.dayOpen, { day: name })} checked={d.open} disabled={disabled} onChange={(open) => set(day, { open })} />
              {d.open ? (
                <span className="ms-auto flex items-center gap-2" dir="ltr">
                  <TimeSelect label={`${name} · ${t.opens}`} value={d.from} disabled={disabled} onChange={(from) => set(day, { from })} />
                  <span aria-hidden className="text-muted">
                    –
                  </span>
                  <TimeSelect label={`${name} · ${t.closes}`} value={d.to} disabled={disabled} onChange={(to) => set(day, { to })} />
                  {overnight && <span className="text-[10px] font-semibold text-gold-ink">+1 {t.pastMidnight}</span>}
                </span>
              ) : (
                <span className="ms-auto text-caption font-semibold text-muted">{t.closed}</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onHours(hours.map(() => ({ ...hours[first]! })) as WeekHours)}
          className="h-9 rounded-[9px] border border-line-2 px-3 text-caption font-semibold hover:bg-surface-2 disabled:opacity-50"
        >
          {fill(t.copyFirst, { day: weekdayName(first, locale) })}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onClosures([...closures, { date: localDate(new Date(), timezone), note: null }])}
          className="h-9 rounded-[9px] px-3 text-caption font-semibold text-brand disabled:opacity-50"
        >
          {t.addClosure}
        </button>
      </div>

      {closures.length > 0 && (
        <div className="mt-4">
          <p className="text-caption font-semibold text-ink-2">{t.closures}</p>
          <ul className="mt-2 grid gap-2">
            {closures.map((c, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={c.date}
                  aria-label={`${t.closures} ${i + 1}`}
                  disabled={disabled}
                  onChange={(e) => e.target.value && onClosures(closures.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))}
                  className="h-9 rounded-[9px] border border-line-2 bg-surface px-2 font-mono text-caption outline-none focus:border-brand"
                  dir="ltr"
                />
                <input
                  value={c.note ?? ''}
                  placeholder={t.closureNotePh}
                  aria-label={t.closureNote}
                  maxLength={60}
                  disabled={disabled}
                  onChange={(e) => onClosures(closures.map((x, j) => (j === i ? { ...x, note: e.target.value || null } : x)))}
                  className="h-9 min-w-0 flex-1 rounded-[9px] border border-line-2 bg-surface px-3 text-caption outline-none focus:border-brand"
                />
                <button
                  type="button"
                  aria-label={fill(t.removeClosure, { date: c.date })}
                  disabled={disabled}
                  onClick={() => onClosures(closures.filter((_, j) => j !== i))}
                  className="grid size-9 place-items-center rounded-lg text-muted hover:bg-brand-soft hover:text-brand"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
