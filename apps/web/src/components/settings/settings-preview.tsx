'use client';

/* eslint-disable @next/next/no-img-element -- pre-sized WebP from the API */
import { useState } from 'react';
import { fill, type Closure, type Locale, type Photo, type SetupItem, type WeekHours } from '@savora/shared';
import type { Dictionary } from '@/app/[lang]/dictionaries';
import { cx } from '@/lib/cx';
import { openStatusText } from '@/lib/open-status';
import { plural } from '@/lib/plural';

export type PreviewData = {
  nameEn: string;
  nameAr: string;
  brandEn: string;
  brandAr: string | null;
  streetEn: string;
  streetAr: string;
  hours: WeekHours | null;
  closures: Closure[];
  timezone: string;
  logo: Photo | null;
  cover: Photo | null;
  hasPin: boolean;
  showMap: boolean;
  radiusM: number | null;
  phone: boolean;
  whatsapp: boolean;
  order: boolean;
  book: boolean;
};

/** The phone on the right: how the top of the guest menu looks with the values being edited. */
export function GuestPreview({ d, t, locale }: { d: PreviewData; t: Dictionary; locale: Locale }) {
  // Starts in the screen's language; the switch shows the other one.
  const [lang, setLang] = useState<Locale>(locale);
  const g = t.guest;
  const ar = lang === 'ar';
  const name = ar ? d.nameAr || d.nameEn : d.nameEn;
  const brand = ar ? d.brandAr || d.brandEn : d.brandEn;
  const street = ar ? d.streetAr || d.streetEn : d.streetEn;
  const status = openStatusText(d.hours, d.closures, d.timezone, new Date(), g, lang);
  // Labels in the preview's language, which may differ from the screen's.
  const label = (key: 'actionCall' | 'actionWhatsapp' | 'actionDirections' | 'actionOrder' | 'actionBook') => (ar ? AR[key] : EN[key]);
  const actions = [
    {
      key: 'call',
      on: d.phone,
      text: label(d.whatsapp ? 'actionWhatsapp' : 'actionCall'),
      glyph: d.whatsapp ? '◍' : '☎',
    },
    { key: 'dir', on: d.hasPin, text: label('actionDirections'), glyph: '➤' },
    { key: 'order', on: d.order, text: label('actionOrder'), glyph: '◧' },
    { key: 'book', on: d.book, text: label('actionBook'), glyph: '▦' },
  ];

  return (
    <section className="rounded-[20px] border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <p className="text-overline font-semibold tracking-[0.12em] text-brand uppercase">{t.settings.guestView}</p>
        <div className="flex rounded-[9px] border border-line bg-surface-2 p-0.5" role="group" aria-label={t.common.language}>
          {(['en', 'ar'] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={lang === l}
              onClick={() => setLang(l)}
              className={cx('rounded-[7px] px-2.5 py-1 text-[11px] font-semibold', lang === l ? 'bg-surface text-ink shadow-card' : 'text-muted')}
            >
              {l === 'en' ? 'EN' : 'عربي'}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-4 w-full max-w-[250px] rounded-[30px] border-[6px] border-[#1c1c1c] bg-[#1c1c1c] shadow-raised">
        <div dir={ar ? 'rtl' : 'ltr'} lang={lang} className="overflow-hidden rounded-[24px] bg-surface text-ink">
          <div className="relative h-[86px] bg-[radial-gradient(circle_at_80%_10%,rgb(219_26_26/0.7),#1f1f1f_70%)]">
            {d.cover && <img src={d.cover.url} alt="" className="absolute inset-0 size-full object-cover" />}
            <span aria-hidden className="absolute start-1/2 top-1.5 h-4 w-16 -translate-x-1/2 rounded-full bg-[#1a1a1a] rtl:translate-x-1/2" />
          </div>
          <div className="relative -mt-6 px-3.5 pb-3.5">
            <span className="relative grid size-12 place-items-center overflow-hidden rounded-xl bg-brand-fill text-title-m font-bold text-white ring-[3px] ring-surface">
              {d.logo ? <img src={d.logo.url} alt="" className="absolute inset-0 size-full bg-white object-contain p-0.5" /> : name.slice(0, 1)}
            </span>
            <p className="mt-2 text-title-m leading-tight font-semibold">{name}</p>
            <p className="mt-0.5 truncate text-[10px] text-muted">{[brand, street].filter(Boolean).join(' · ')}</p>
            {status && (
              <p className={cx('mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold', status.open ? 'bg-ok-soft text-ok' : 'bg-gold-soft text-gold-ink')}>
                <span aria-hidden className="size-1.5 rounded-full bg-current" />
                {status.text}
              </p>
            )}
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {actions.map((a) => (
                <span
                  key={a.key}
                  className={cx(
                    'grid justify-items-center gap-0.5 rounded-lg border py-1.5 text-[9px] font-semibold',
                    a.on ? 'border-line text-brand' : 'border-dashed border-line-2 text-muted',
                  )}
                >
                  <span aria-hidden className="text-[12px] leading-none">
                    {a.glyph}
                  </span>
                  {a.text}
                </span>
              ))}
            </div>
            <div aria-hidden className="mt-3 grid gap-2">
              <span className="h-1.5 w-16 rounded bg-brand/70" />
              <span className="flex items-center justify-between rounded-lg border border-line px-2.5 py-2">
                <span className="grid gap-1">
                  <span className="h-1.5 w-20 rounded bg-ink/60" />
                  <span className="h-1 w-24 rounded bg-line-2" />
                </span>
                <span className="h-1.5 w-6 rounded bg-brand/60" />
              </span>
            </div>
            {d.showMap && d.hasPin && (
              <div className="mt-3 overflow-hidden rounded-xl border border-line">
                <div aria-hidden className="relative h-14 bg-[repeating-linear-gradient(35deg,var(--surface-2)_0_10px,var(--line)_10px_11px)]">
                  <span className="absolute start-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-fill shadow rtl:translate-x-1/2" />
                </div>
                <div className="px-2.5 py-1.5">
                  <p className="truncate text-[9px] font-semibold">{street || name}</p>
                  {d.radiusM && (
                    <p className="text-[8px] text-muted">
                      {fill(ar ? AR.delivers : EN.delivers, {
                        km: (d.radiusM / 1000).toFixed(1),
                      })}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// The preview speaks the language it shows, not the screen's.
const EN = {
  actionCall: 'Call',
  actionWhatsapp: 'WhatsApp',
  actionDirections: 'Directions',
  actionOrder: 'Order',
  actionBook: 'Book',
  delivers: 'Delivers within {km} km',
};
const AR = {
  actionCall: 'اتصل',
  actionWhatsapp: 'واتساب',
  actionDirections: 'الاتجاهات',
  actionOrder: 'اطلب',
  actionBook: 'احجز',
  delivers: 'نوصّل حتى {km} كم',
};

/** Ring and checklist: what's left for a complete listing. Each item jumps to its section. */
export function SetupHealth({ items, pct, t, locale, onJump }: { items: SetupItem[]; pct: number; t: Dictionary['settings']; locale: Locale; onJump: (key: SetupItem['key']) => void }) {
  const left = items.filter((i) => !i.done).length;
  const LABEL: Record<SetupItem['key'], string> = {
    names: t.healthNames,
    pin: t.healthPin,
    hours: t.healthHours,
    logo: t.healthLogo,
    contact: t.healthContact,
    booking: t.healthBooking,
  };
  return (
    <section className="rounded-[20px] border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-3.5">
        <span
          role="img"
          aria-label={`${pct}%`}
          className="grid size-14 shrink-0 place-items-center rounded-full"
          style={{
            background: `conic-gradient(var(--brand) ${pct * 3.6}deg, var(--line) 0)`,
          }}
        >
          <span className="grid size-11 place-items-center rounded-full bg-surface text-caption font-bold tabular-nums">{pct}%</span>
        </span>
        <div>
          <p className="text-title-s font-semibold">{t.healthTitle}</p>
          <p className="text-caption text-muted">{left ? plural(locale, left, t.healthLeft) : t.healthDone}</p>
        </div>
      </div>
      <ul className="mt-3 grid gap-0.5">
        {items.map((i) => (
          <li key={i.key}>
            <button type="button" onClick={() => onJump(i.key)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start hover:bg-surface-2">
              <span
                aria-hidden
                className={cx('grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold', i.done ? 'bg-ok-soft text-ok' : 'border border-dashed border-line-2 text-muted')}
              >
                {i.done ? '✓' : '+'}
              </span>
              <span className={cx('text-caption', i.done ? 'text-muted' : 'font-semibold text-ink')}>{LABEL[i.key]}</span>
              <span className="sr-only">{i.done ? ` · ${t.done}` : ` · ${t.todo}`}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
