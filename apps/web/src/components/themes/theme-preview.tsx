import { AA, checkTheme, fill, formatPrice, onPrimary, type Locale, type ThemeColors, type ThemeStyle } from '@savora/shared';
import type { Dictionary } from '@/app/[lang]/dictionaries';
import { cx } from '@/lib/cx';
import { menuFontVars } from '@/lib/menu-fonts';

type Text = Dictionary['themes'];

/** The parts of a theme the previews draw: colours and the rest of the look. */
export type Look = ThemeStyle & { colors: ThemeColors };

/** What the phone shows: the place's own name and first dishes, or a sample when the menu is empty. */
export type PreviewData = {
  name: { en: string; ar: string | null };
  tagline: { en: string | null; ar: string | null };
  logoUrl: string | null;
  coverUrl: string | null;
  currency: string;
  section: { en: string | null; ar: string | null };
  items: Array<{ nameEn: string | null; nameAr: string | null; descriptionEn: string | null; descriptionAr: string | null; priceMinor: number; thumbUrl: string | null }>;
};

/** Guest-menu words in both languages: the preview language is chosen separately from the app's. */
const GUEST = {
  en: { contact: 'Contact', directions: 'Directions', order: 'Order', special: 'Today’s special' },
  ar: { contact: 'اتصال', directions: 'الاتجاهات', order: 'اطلب', special: 'طبق اليوم' },
};

export const ICON = {
  check: <polyline points="20 6 9 17 4 12" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </>
  ),
  send: (
    <>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4z" />
    </>
  ),
  clip: <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10.5 18a2 2 0 0 1-3-3l7.5-7.5" />,
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <polyline points="21 3 21 9 15 9" />
    </>
  ),
  layers: (
    <>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </>
  ),
  type: (
    <>
      <polyline points="4 7 4 4 20 4 20 7" />
      <path d="M9 20h6M12 4v16" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
    </>
  ),
  x: <path d="M18 6 6 18M6 6l12 12" />,
};

export const Icon = ({ d, size = 16, className, strokeWidth = 2 }: { d: React.ReactNode; size?: number; className?: string; strokeWidth?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
    {d}
  </svg>
);

/** A thumbnail of the guest menu drawn from the palette: card, title line, two priced rows. */
export function MiniTheme({ colors: c, height = 124 }: { colors: ThemeColors; height?: number }) {
  const row = (w: number) => (
    <>
      <div className="mt-[9px] flex items-center justify-between gap-2">
        <span className="block h-[5px] rounded-[3px] opacity-85" style={{ width: `${w}%`, background: c.ink }} />
        <span className="block h-[7px] w-5 rounded-[3px]" style={{ background: c.primary }} />
      </div>
      <span className="mt-1 block h-1 rounded-sm opacity-45" style={{ width: `${w - 18}%`, background: c.muted }} />
    </>
  );
  return (
    <div aria-hidden className="relative overflow-hidden rounded-xl border border-black/5 px-4 pt-3.5" style={{ height, background: c.bg }}>
      <div className="rounded-t-[10px] p-3 pb-2.5" style={{ height, background: c.surface }}>
        <div className="flex items-center gap-2">
          <span className="block size-[18px] rounded-full" style={{ background: c.primary }} />
          <span className="block h-1.5 w-16 rounded-[3px]" style={{ background: c.ink }} />
          <span className="ms-auto block h-2.5 w-[26px] rounded-full" style={{ background: c.accent }} />
        </div>
        {row(58)}
        {row(46)}
      </div>
    </div>
  );
}

/** The guest menu in a phone frame, in the chosen theme and preview language. */
export function PhonePreview({ look, data, lang }: { look: Look; data: PreviewData; lang: Locale }) {
  const c = look.colors;
  const g = GUEST[lang];
  const pick = (en: string | null, ar: string | null) => (lang === 'ar' ? (ar ?? en) : (en ?? ar)) ?? '';
  const name = pick(data.name.en, data.name.ar);
  const tagline = pick(data.tagline.en, data.tagline.ar);
  const other = lang === 'ar' ? data.section.en : data.section.ar;
  const rule = `color-mix(in srgb, ${c.muted} 25%, transparent)`;
  const priceClass = cx('shrink-0 font-mono', look.boldPrices ? 'text-body-s font-bold' : 'text-caption font-semibold');
  // The same top as the guest menu: the cover photo (or its gradient), a primary band, or none.
  const banner =
    look.header === 'color'
      ? { background: `radial-gradient(circle at 85% 0%, color-mix(in srgb, ${c.accent} 45%, transparent), transparent 60%), ${c.primary}` }
      : data.coverUrl
        ? { background: `center / cover no-repeat url("${data.coverUrl}")` }
        : { background: `radial-gradient(circle at 80% 10%, color-mix(in srgb, ${c.primary} 55%, transparent), transparent 55%), #1f1f1f` };
  return (
    <div className="mx-auto w-[272px] max-w-full rounded-[40px] bg-[#1a1a1a] p-2 shadow-[0_24px_48px_rgb(28_28_28/0.22)]">
      <div
        lang={lang}
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        data-menu-font={look.font !== 'sans' ? look.font : undefined}
        data-corners={look.corners}
        className={cx('menu-look relative overflow-hidden rounded-[32px] px-4 pt-11 pb-[18px]', menuFontVars)}
        style={{ background: c.bg }}
      >
        <span aria-hidden className="absolute start-1/2 top-2.5 z-10 h-[22px] w-[78px] -translate-x-1/2 rounded-full bg-[#1a1a1a] rtl:translate-x-1/2" />
        <div className="overflow-hidden rounded-[var(--r-tile)] text-center" style={{ background: c.surface }}>
          {look.header !== 'plain' && <div aria-hidden className="h-16" style={banner} />}
          <div className={cx('px-3.5 pb-4', look.header === 'plain' && 'pt-4')}>
            <span
              className={cx('relative mx-auto grid size-11 place-items-center overflow-hidden rounded-[var(--r-thumb)] text-title-m font-bold', look.header !== 'plain' && '-mt-[22px]')}
              style={{ background: c.primary, color: onPrimary(c), boxShadow: look.header !== 'plain' ? `0 0 0 3px ${c.surface}` : undefined }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a pre-sized WebP from the API */}
              {data.logoUrl ? <img src={data.logoUrl} alt="" className="absolute inset-0 size-full bg-white object-contain p-0.5" /> : name.slice(0, 1)}
            </span>
            <p className="menu-heading mt-2 text-heading-s leading-tight font-semibold" style={{ color: c.ink }}>
              {name}
            </p>
            {tagline && (
              <p className="text-caption" style={{ color: c.muted }}>
                {tagline}
              </p>
            )}
            <div className="mt-2.5 flex justify-center gap-1.5">
              {[g.contact, g.directions, g.order].map((l, i) => (
                <span
                  key={l}
                  className="rounded-[var(--r-thumb)] px-2.5 py-1 text-[10px] leading-none font-semibold"
                  style={i === 1 ? { background: c.primary, color: onPrimary(c) } : { border: `1px solid color-mix(in srgb, ${c.muted} 35%, transparent)`, color: c.ink }}
                >
                  {l}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3.5 rounded-[var(--r-tile)] px-3.5 pt-1 pb-1.5" style={{ background: c.surface }}>
          <div className="flex items-baseline justify-between gap-2 pt-2.5 pb-1.5" style={{ borderBottom: `1px solid ${rule}` }}>
            <span className="text-overline font-semibold tracking-[0.1em] uppercase" style={{ color: c.primary }}>
              {pick(data.section.en, data.section.ar)}
            </span>
            {other && (
              <span dir={lang === 'ar' ? 'ltr' : 'rtl'} className="truncate text-[11px]" style={{ color: c.muted }}>
                {other}
              </span>
            )}
          </div>
          {data.items.map((it, i) => {
            const desc = pick(it.descriptionEn, it.descriptionAr);
            const dish = pick(it.nameEn, it.nameAr);
            const price = formatPrice(it.priceMinor, data.currency);
            const divider = i < data.items.length - 1 ? { borderBottom: `1px dashed ${rule}` } : undefined;
            if (look.layout === 'compact')
              return (
                <div key={i} className="py-2.5" style={divider}>
                  <div className="flex items-baseline gap-1.5">
                    <span className="menu-heading truncate text-body-s font-semibold" style={{ color: c.ink }}>
                      {dish}
                    </span>
                    <span aria-hidden className="min-w-3 flex-1 -translate-y-1" style={{ borderBottom: `2px dotted color-mix(in srgb, ${c.muted} 45%, transparent)` }} />
                    <span dir="ltr" className={priceClass} style={{ color: c.primary }}>
                      {price}
                    </span>
                  </div>
                  {desc && (
                    <span className="block truncate text-[11px]" style={{ color: c.muted }}>
                      {desc}
                    </span>
                  )}
                </div>
              );
            if (look.layout === 'cards' && it.thumbUrl)
              return (
                <div key={i} className="py-2.5" style={divider}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a pre-sized WebP from the API */}
                  <img src={it.thumbUrl} alt="" className="h-[92px] w-full rounded-[var(--r-thumb)] object-cover" />
                  <span className="mt-1.5 flex items-baseline justify-between gap-2">
                    <span className="menu-heading truncate text-body-s font-semibold" style={{ color: c.ink }}>
                      {dish}
                    </span>
                    <span dir="ltr" className={priceClass} style={{ color: c.primary }}>
                      {price}
                    </span>
                  </span>
                </div>
              );
            return (
              <div key={i} className="flex items-center justify-between gap-2.5 py-2.5" style={divider}>
                <span className="min-w-0">
                  <span className="menu-heading block truncate text-body-s font-semibold" style={{ color: c.ink }}>
                    {dish}
                  </span>
                  {desc && (
                    <span className="block truncate text-[11px]" style={{ color: c.muted }}>
                      {desc}
                    </span>
                  )}
                  {it.thumbUrl && (
                    <span dir="ltr" className={cx(priceClass, 'mt-0.5 block')} style={{ color: c.primary }}>
                      {price}
                    </span>
                  )}
                </span>
                {it.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a pre-sized WebP from the API
                  <img src={it.thumbUrl} alt="" className="size-11 shrink-0 rounded-[var(--r-thumb)] object-cover" />
                ) : (
                  <span dir="ltr" className={priceClass} style={{ color: c.primary }}>
                    {price}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex justify-center">
          <span className="rounded-full px-3 py-1 text-[10px] font-semibold" style={{ background: c.accent, color: bestOn(c.accent, c) }}>
            {g.special}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Text colour for a chip filled with the accent. */
const bestOn = (fill: string, c: ThemeColors) => onPrimary({ ...c, primary: fill });

/** Four swatches with hex values, then the contrast checks guests depend on. */
export function TokenRow({ look, t }: { look: Look; t: Text }) {
  const c = look.colors;
  const r = checkTheme(c);
  const pills: Array<[string, number]> = [
    [t.contrastText, r.text],
    [t.contrastPrices, r.prices],
    [t.contrastMuted, r.muted],
    [t.contrastButtons, r.buttons],
  ];
  return (
    <>
      <div className="mt-3.5 grid grid-cols-4 gap-2">
        {(
          [
            [t.background, c.bg],
            [t.primary, c.primary],
            [t.accent, c.accent],
            [t.text, c.ink],
          ] as const
        ).map(([label, hex]) => (
          <span key={label} className="min-w-0">
            <span className="block h-[30px] rounded-lg border border-line" style={{ background: hex }} />
            <span className="mt-1.5 block truncate text-[11px] text-muted">{label}</span>
            <span dir="ltr" className="block font-mono text-[11px] font-semibold">
              {hex.toUpperCase()}
            </span>
          </span>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap items-center gap-1.5">
        {pills.map(([label, ratio]) => {
          const ok = ratio >= AA;
          return (
            <li key={label} className={cx('inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold', ok ? 'bg-ok-soft text-ok' : 'bg-gold-soft text-gold-ink')}>
              <Icon d={ok ? ICON.check : ICON.x} size={11} strokeWidth={3} />
              {fill(label, { r: ratio.toFixed(1) })} · {ok ? t.pass : t.fail}
            </li>
          );
        })}
      </ul>
      <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Icon d={ICON.type} size={12} />
          {t.style.font[look.font]}
        </span>
        <span>{styleLine(look, t)}</span>
      </p>
    </>
  );
}

/** "Photo header · List · Soft corners · Bold prices", in the app's language. */
export function styleLine(look: Look, t: Text) {
  return [t.style.header[look.header], t.style.layout[look.layout], t.style.corners[look.corners], look.boldPrices ? t.boldPrices : null].filter(Boolean).join(' · ');
}
