'use client';

import { useState } from 'react';
import { fill, type Locale } from '@savora/shared';
import { cx } from '@/lib/cx';
import { plural, type PluralForms } from '@/lib/plural';

export type ChartBar = { key: string; scans: number; short: string; long: string; showLabel: boolean };

/** A tidy axis: three equal steps of 1, 2, 2.5 or 5 × 10ⁿ, with headroom above the tallest bar. */
function niceMax(value: number) {
  const target = Math.max(value * 1.08, 3) / 3;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= target)!;
  return step * 3;
}

type Text = { busiest: string; average: string; scans: PluralForms; vsAverage: string; showTable: string; showChart: string; colKey: string; colScans: string; chartLabel: string };

/** Single-series bar chart: gold bars, the busiest one in brand red and labelled, a dashed average
 *  line, a tooltip on hover or focus, and a table view. In Arabic it mirrors, so time reads right
 *  to left. */
export function ScanChart({ bars, peakKey, average, t, locale }: { bars: ChartBar[]; peakKey: string | null; average: number; t: Text; locale: Locale }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const max = niceMax(Math.max(...bars.map((b) => b.scans), 0));
  const ticks = [0, max / 3, (max * 2) / 3, max];
  const peakIndex = bars.findIndex((b) => b.key === peakKey);
  const shown = hover ?? (peakIndex >= 0 ? peakIndex : null);
  const pct = (v: number) => `${(v / max) * 100}%`;
  const count = (n: number) => plural(locale, n, t.scans);
  const vs = (n: number) => {
    if (average <= 0) return null;
    const diff = Math.round((n / average - 1) * 100);
    return fill(t.vsAverage, { sign: diff > 0 ? '+' : diff < 0 ? '−' : '', pct: Math.abs(diff) });
  };
  const dense = bars.length > 12;

  return (
    <div>
      {asTable ? (
        <div className="max-h-[300px] overflow-y-auto rounded-xl border border-line">
          <table className="w-full text-body-s">
            <thead className="sticky top-0 bg-surface-2 text-caption text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 text-start font-medium">
                  {t.colKey}
                </th>
                <th scope="col" className="px-4 py-2 text-end font-medium">
                  {t.colScans}
                </th>
              </tr>
            </thead>
            <tbody>
              {bars.map((b) => (
                <tr key={b.key} className="border-t border-line">
                  <th scope="row" className={cx('px-4 py-2 text-start font-normal', b.key === peakKey && 'font-semibold')}>
                    {b.long}
                  </th>
                  <td className="px-4 py-2 text-end tabular-nums">{b.scans}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        // The top padding is room for the busiest-bar label, so it never covers the card title.
        <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-2 pt-[84px]">
          {/* Axis values, quiet. */}
          <div aria-hidden className="relative h-[240px] text-[11px] text-muted">
            {ticks.map((v) => (
              <span key={v} className="absolute end-0 translate-y-1/2 tabular-nums" style={{ bottom: pct(v) }}>
                {Math.round(v)}
              </span>
            ))}
          </div>
          <div role="group" aria-label={fill(t.chartLabel, { peak: peakIndex >= 0 ? bars[peakIndex]!.long : '—' })} className="relative h-[240px]" onMouseLeave={() => setHover(null)}>
            {ticks.map((v) => (
              <span key={v} aria-hidden className={cx('absolute inset-x-0 border-t', v === 0 ? 'border-line-2' : 'border-dashed border-line')} style={{ bottom: pct(v) }} />
            ))}
            {average > 0 && <span aria-hidden className="absolute inset-x-0 z-10 border-t-2 border-dashed border-ink-2/50" style={{ bottom: pct(average) }} />}
            <div className={cx('absolute inset-0 flex items-end', dense ? 'gap-[2px]' : 'gap-2 sm:gap-3')}>
              {bars.map((b, i) => {
                const isPeak = b.key === peakKey;
                const edge = i < 2 ? 'start' : i > bars.length - 3 ? 'end' : 'center';
                return (
                  <div key={b.key} className="relative flex h-full min-w-0 flex-1 items-end">
                    {shown === i && b.scans > 0 && (
                      <div
                        role="tooltip"
                        className={cx(
                          'pointer-events-none absolute z-20 w-max max-w-[220px] rounded-xl bg-ink px-3 py-2 text-surface shadow-raised',
                          edge === 'start' ? 'start-0' : edge === 'end' ? 'end-0' : 'start-1/2 -translate-x-1/2 rtl:translate-x-1/2',
                        )}
                        style={{ bottom: `calc(${pct(b.scans)} + 10px)` }}
                      >
                        <p className="text-[11px] text-line-2">
                          {b.long}
                          {isPeak && ` · ${t.busiest}`}
                        </p>
                        <p className="text-title-s font-semibold">{count(b.scans)}</p>
                        {vs(b.scans) && <p className="text-[11px] text-line-2">{vs(b.scans)}</p>}
                      </div>
                    )}
                    <button
                      type="button"
                      aria-label={`${b.long}: ${count(b.scans)}${isPeak ? `, ${t.busiest}` : ''}`}
                      onMouseEnter={() => setHover(i)}
                      onFocus={() => setHover(i)}
                      onBlur={() => setHover(null)}
                      className="flex h-full w-full items-end outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                    >
                      <span
                        className={cx('block w-full rounded-t-[4px] transition-opacity', isPeak ? 'bg-brand-fill' : 'bg-gold', !isPeak && (hover === i ? 'opacity-100' : 'opacity-80'))}
                        // A sliver for zero days, so the day still reads as "measured, nothing".
                        style={{ height: b.scans ? pct(b.scans) : '2px' }}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div />
          <div aria-hidden className={cx('mt-2 flex', dense ? 'gap-[2px]' : 'gap-2 sm:gap-3')}>
            {bars.map((b) => (
              <span key={b.key} className={cx('min-w-0 flex-1 text-center text-[11px] whitespace-nowrap', b.key === peakKey ? 'font-semibold text-ink' : 'text-muted')}>
                {b.showLabel ? b.short : ''}
              </span>
            ))}
          </div>
        </div>
      )}
      <button type="button" onClick={() => setAsTable(!asTable)} className="mt-3 text-caption font-semibold text-ink-2 underline-offset-4 hover:underline">
        {asTable ? t.showChart : t.showTable}
      </button>
    </div>
  );
}
