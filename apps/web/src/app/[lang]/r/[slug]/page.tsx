/* eslint-disable @next/next/no-img-element -- photos are pre-sized WebP files from the API */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { contactUrl, fill, formatPrice, themeVars, type Locale, type Photo, type PublicMenu, type Theme } from '@savora/shared';
import { GuestMap } from '@/components/guest/guest-map';
import { ScanBeacon } from '@/components/guest/scan-beacon';
import { SectionNav } from '@/components/guest/section-nav';
import { TourTeaserCard } from '@/components/tour/guest-tour';
import { getPublicMenu, MENU_ORIGIN } from '@/lib/api';
import { jsonLdText, menuJsonLd } from '@/lib/menu-jsonld';
import { descriptionOf, primaryName } from '@/lib/menu-text';
import { cx } from '@/lib/cx';
import { menuFontVars } from '@/lib/menu-fonts';
import { openStatusText } from '@/lib/open-status';
import { plural } from '@/lib/plural';
import { getDictionary, getLocale } from '../../dictionaries';

type Props = PageProps<'/[lang]/r/[slug]'>;
type Dish = PublicMenu['menu']['categories'][number]['items'][number];

const pick = (en: string | null, ar: string | null, locale: Locale) => (locale === 'ar' ? (ar ?? en) : (en ?? ar));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, t, locale] = await Promise.all([params, getDictionary(), getLocale()]);
  const res = await getPublicMenu(slug);
  if (res.status === 'missing') return { title: t.guest.missingTitle, robots: { index: false } };
  if (res.status === 'not_published' || res.status === 'paused') return { title: pick(res.name.en, res.name.ar, locale) ?? '', robots: { index: false } };
  const { menu } = res;
  const name = pick(menu.brand.nameEn, menu.brand.nameAr, locale)!;
  const featured = menu.menu.categories.flatMap((c) => c.items).find((i) => i.photo);
  return {
    // The page title stands alone; the layout's "· Savora" suffix would read oddly to guests.
    title: { absolute: fill(t.guest.title, { name }) },
    description: pick(menu.brand.taglineEn, menu.brand.taglineAr, locale) ?? fill(t.guest.description, { name }),
    metadataBase: new URL(MENU_ORIGIN),
    alternates: { canonical: `/${locale}/r/${menu.slug}`, languages: { en: `/en/r/${menu.slug}`, ar: `/ar/r/${menu.slug}` } },
    openGraph: { title: name, images: featured?.photo ? [featured.photo.url] : menu.cover ? [menu.cover.url] : undefined, locale: locale === 'ar' ? 'ar' : 'en' },
  };
}

/** The public menu guests open from the QR code: the latest published version, in their language. */
export default async function GuestMenuPage({ params }: Props) {
  const [{ slug }, t, locale] = await Promise.all([params, getDictionary(), getLocale()]);
  const res = await getPublicMenu(slug);
  if (res.status === 'missing') notFound();
  const g = t.guest;
  const other: Locale = locale === 'ar' ? 'en' : 'ar';

  if (res.status === 'not_published' || res.status === 'paused') {
    const name = pick(res.name.en, res.name.ar, locale)!;
    return (
      <Frame>
        <div className="grid min-h-[70dvh] place-items-center px-6 py-16 text-center">
          <div>
            <Badge initial={name.slice(0, 1)} className="mx-auto" />
            <h1 className="mt-6 text-heading-m font-semibold">{fill(res.status === 'paused' ? g.pausedTitle : g.soonTitle, { name })}</h1>
            <p className="mx-auto mt-2 max-w-xs text-body-m text-muted">{res.status === 'paused' ? g.pausedBody : g.soonBody}</p>
          </div>
        </div>
        <Footer t={g} />
      </Frame>
    );
  }

  const { menu } = res;
  const name = pick(menu.brand.nameEn, menu.brand.nameAr, locale)!;
  const tagline = pick(menu.brand.taglineEn, menu.brand.taglineAr, locale);
  const price = (minor: number) => formatPrice(minor, menu.menu.currency);
  const sections = menu.menu.categories.map((c) => ({ id: `s-${c.id.slice(0, 8)}`, label: primaryName(c, locale), category: c }));
  const header = menu.theme?.header ?? 'photo';
  const layout = menu.theme?.layout ?? 'list';
  // The first dish with a photo leads the menu, large ("cards" shows every photo that way).
  const featuredId = menu.menu.categories[0]?.items.find((i) => i.photo)?.id;
  const place = menu.location;
  const status = openStatusText(place.hours, place.closures, place.timezone, new Date(), g, locale);
  // In Arabic, a city typed only in Latin letters would break the line, so it is left out.
  const city = locale === 'ar' && place.city && !/[؀-ۿ]/.test(place.city) ? null : place.city;
  const address = [pick(place.addressEn, place.addressAr, locale), city].filter(Boolean).join(locale === 'ar' ? '، ' : ', ');
  // Buttons only for what the owner filled in; Directions is the main one, as in the design.
  type Action = { key: string; href: string; label: string; icon: React.ReactNode; main: boolean };
  const actions = (
    [
      place.contact
        ? { key: 'contact', href: contactUrl(place.contact.phone, place.contact.whatsapp), label: place.contact.whatsapp ? g.actionWhatsapp : g.actionCall, icon: ICONS.phone, main: false }
        : null,
      place.directions ? { key: 'directions', href: place.directions, label: g.actionDirections, icon: ICONS.nav, main: true } : null,
      place.orderUrl ? { key: 'order', href: place.orderUrl, label: g.actionOrder, icon: ICONS.bag, main: false } : null,
      place.reservationUrl ? { key: 'book', href: place.reservationUrl, label: g.actionBook, icon: ICONS.cal, main: false } : null,
    ] as Array<Action | null>
  ).filter((a): a is Action => a !== null);

  return (
    <Frame theme={menu.theme}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(menuJsonLd(menu, `${MENU_ORIGIN}/${locale}/r/${menu.slug}`, locale)) }} />
      <ScanBeacon slug={menu.slug} locale={locale} />
      {/* The theme picks the top: the cover photo, a band of the primary colour, or no banner. */}
      {header === 'plain' ? (
        <div className="mx-auto flex w-full max-w-[1200px] justify-end px-4 pt-4 md:px-8 lg:px-10">
          <LanguagePill href={`/${other}/r/${menu.slug}`} other={other} label={g.otherLanguageLabel} locale={locale} />
        </div>
      ) : (
        <div className={cx('relative overflow-hidden', header === 'color' ? 'h-[132px] bg-brand-fill md:h-[160px]' : 'h-[200px] bg-[#1f1f1f] md:h-[260px] lg:h-[320px]')}>
          {header === 'color' ? (
            <div aria-hidden className="size-full bg-[radial-gradient(circle_at_85%_0%,color-mix(in_srgb,var(--accent,var(--gold))_45%,transparent),transparent_60%)]" />
          ) : menu.cover ? (
            <img src={menu.cover.url} alt="" className="size-full object-cover" fetchPriority="high" />
          ) : (
            <div
              aria-hidden
              className="size-full bg-[radial-gradient(circle_at_80%_10%,color-mix(in_srgb,var(--brand)_55%,transparent),transparent_55%),radial-gradient(circle_at_10%_90%,color-mix(in_srgb,var(--accent,var(--gold))_35%,transparent),transparent_50%)]"
            />
          )}
          <LanguagePill href={`/${other}/r/${menu.slug}`} other={other} label={g.otherLanguageLabel} locale={locale} className="absolute end-4 top-4 md:end-8 lg:end-10" />
        </div>
      )}

      {/* Phones and tablets read top to bottom: the place, the menu, then the map. On a computer the
          place and the map share a column that stays in view beside the menu. The aside is
          display:contents below lg, so its two parts can sit on either side of the menu. */}
      <div className="mx-auto flex w-full max-w-[1200px] flex-col px-5 md:px-8 lg:grid lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] lg:items-start lg:gap-12 lg:px-10">
        <aside className="contents lg:sticky lg:top-6 lg:block">
          <header className="order-1">
            <Badge initial={name.slice(0, 1)} logo={menu.brand.logo} className={header === 'plain' ? 'mt-2' : '-mt-9 ring-4 ring-surface'} />
            <h1 className="mt-3 text-heading-l leading-tight font-semibold tracking-[-0.02em]">{name}</h1>
            {tagline && <p className="mt-1 text-body-m text-muted">{tagline}</p>}
            {(status || address) && (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                {status && (
                  <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold', status.open ? 'bg-ok-soft text-ok' : 'bg-gold-soft text-gold-ink')}>
                    <span aria-hidden className="size-1.5 rounded-full bg-current" />
                    {status.text}
                  </span>
                )}
                {address && (
                  <span className="inline-flex items-center gap-1 text-caption text-muted">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" />
                      <circle cx="12" cy="9" r="2.5" />
                    </svg>
                    {address}
                  </span>
                )}
              </div>
            )}
            {actions.length > 0 && (
              <nav aria-label={g.actionsLabel} className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
                {actions.map((a) => (
                  <a
                    key={a.key}
                    href={a.href}
                    {...(a.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className={cx(
                      'grid min-h-[60px] place-items-center content-center gap-1 rounded-[var(--r-tile)] border px-2 text-caption font-semibold transition-colors',
                      a.main ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink hover:bg-surface-2',
                    )}
                  >
                    <span aria-hidden className={a.main ? '' : 'text-brand'}>
                      {a.icon}
                    </span>
                    {a.label}
                  </a>
                ))}
              </nav>
            )}
            {menu.tour && <TourTeaserCard href={`/${locale}/r/${menu.slug}/tour`} cover={menu.tour.cover.thumbUrl} scenes={menu.tour.scenes} seconds={menu.tour.seconds} t={g} locale={locale} />}
          </header>
          {place.pin && (
            <section aria-labelledby="find-us" className="order-3 mt-8 overflow-hidden rounded-[var(--r-tile)] border border-line lg:mt-6">
              <GuestMap pin={place.pin} radiusM={place.pin.deliveryRadiusM} initial={name.slice(0, 1)} label={fill(g.mapLabel, { name })} />
              <div className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <h2 id="find-us" className="text-title-s font-semibold">
                    {g.findUs}
                  </h2>
                  {address && <p className="truncate text-caption text-muted">{address}</p>}
                  {place.pin.deliveryRadiusM && <p className="text-caption text-muted">{fill(g.delivers, { km: (place.pin.deliveryRadiusM / 1000).toFixed(1) })}</p>}
                </div>
                {place.directions && (
                  <a href={place.directions} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-[var(--r-thumb)] bg-ink px-3.5 py-2 text-caption font-semibold text-surface">
                    {g.actionDirections}
                  </a>
                )}
              </div>
            </section>
          )}
        </aside>

        <div className="order-2 min-w-0 lg:pt-2">
          {/* A direct child of the section column, so it can stay stuck for the whole menu. */}
          <SectionNav sections={sections.map(({ id, label }) => ({ id, label }))} label={g.sections} />

          {sections.map(({ id, label, category }) => (
            <section key={id} id={id} aria-labelledby={`${id}-h`} className="scroll-mt-16 pt-6">
              <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2.5">
                <h2 id={`${id}-h`} className="text-heading-s font-semibold">
                  {label}
                </h2>
                <span className="text-caption text-muted">{plural(locale, category.items.length, g.items)}</span>
              </div>
              {/* From tablet width up, dishes sit two to a row as cards (the compact layout keeps its ruled lines). */}
              <ul className={cx('md:grid md:grid-cols-2 md:gap-x-4', layout === 'compact' ? 'md:gap-x-10' : 'md:gap-y-4 md:pt-4')}>
                {category.items.map((dish, i) => {
                  const last = i === category.items.length - 1;
                  if (layout === 'compact') return <Compact key={dish.id} dish={dish} locale={locale} price={price(dish.priceMinor)} last={last} />;
                  if (dish.photo && (dish.id === featuredId || layout === 'cards'))
                    return <Featured key={dish.id} dish={dish} locale={locale} price={price(dish.priceMinor)} label={dish.id === featuredId ? g.favourite : null} />;
                  return <Row key={dish.id} dish={dish} locale={locale} price={price(dish.priceMinor)} last={last} />;
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
      <Footer t={g} />
    </Frame>
  );
}

/** Fills the screen at every size: the content inside sets its own widths (a phone column, two
 *  dishes a row on tablets, the place beside the menu on computers). A theme other than Auto-match replaces the colour tokens for everything inside; Auto-match keeps
 *  Savora's own, including dark mode. */
function Frame({ theme, children }: { theme?: Theme; children: React.ReactNode }) {
  const themed = theme && theme.ref !== 'auto';
  return (
    <div
      className={cx('menu-look min-h-dvh bg-surface text-ink', menuFontVars)}
      style={themed ? (themeVars(theme.colors) as React.CSSProperties) : undefined}
      data-menu-font={theme && theme.font !== 'sans' ? theme.font : undefined}
      data-corners={theme?.corners}
      data-bold-prices={theme?.boldPrices ? '' : undefined}
    >
      <main className="flex min-h-dvh flex-col bg-surface">{children}</main>
    </div>
  );
}

/** EN | عربي switch. It sits at the reading end, but always reads "EN | عربي", as in the design. */
function LanguagePill({ href, other, label, locale, className }: { href: string; other: Locale; label: string; locale: Locale; className?: string }) {
  return (
    <Link href={href} hrefLang={other} lang={other} className={cx('rounded-full bg-black/55 p-1 text-caption font-semibold text-white backdrop-blur', className)}>
      <span className="sr-only">{label}</span>
      <span dir="ltr" className="flex">
        <span className={locale === 'en' ? 'rounded-full bg-white px-3 py-1 text-[#1c1c1c]' : 'px-3 py-1'}>EN</span>
        <span className={locale === 'ar' ? 'rounded-full bg-white px-3 py-1 text-[#1c1c1c]' : 'px-3 py-1'}>عربي</span>
      </span>
    </Link>
  );
}

function Badge({ initial, logo, className = '' }: { initial: string; logo?: Photo | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={`relative grid size-16 place-items-center overflow-hidden rounded-[var(--r-tile)] bg-brand-fill text-heading-m font-bold text-[var(--on-brand,#fff)] shadow-[0_10px_24px_color-mix(in_srgb,var(--brand)_30%,transparent)] ${className}`}
    >
      {logo ? <img src={logo.url} alt="" className="absolute inset-0 size-full bg-white object-contain p-1" /> : initial}
    </span>
  );
}

const icon = (d: React.ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);
const ICONS = {
  phone: icon(
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />,
  ),
  nav: icon(<polygon points="3 11 21 3 13 21 11 13 3 11" />),
  bag: icon(
    <>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
    </>,
  ),
  cal: icon(
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>,
  ),
};

/** On phones dishes are a ruled list; from tablet width up each one is a card in a two-column grid. */
const CARD = 'md:rounded-[var(--r-tile)] md:border md:border-solid md:border-line md:p-4';

function Featured({ dish, locale, price, label }: { dish: Dish; locale: Locale; price: string; label: string | null }) {
  const desc = descriptionOf(dish, locale);
  return (
    <li
      id={`d-${dish.id.slice(0, 8)}`}
      className={cx('scroll-mt-20 border-b border-dashed border-line py-4', CARD, label && 'md:col-span-2 md:grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:items-center md:gap-6')}
    >
      <div className="relative aspect-[16/10] overflow-hidden rounded-[var(--r-tile)] bg-surface-2">
        <img src={dish.photo!.url} alt={primaryName(dish, locale)} loading={label ? undefined : 'lazy'} className="size-full object-cover" />
        {label && <span className="absolute start-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">{label}</span>}
        <span dir="ltr" className="menu-price absolute end-3 bottom-3 rounded-[var(--r-chip)] bg-surface px-2.5 py-1 font-mono text-body-s font-semibold text-brand shadow">
          {price}
        </span>
      </div>
      <div className={label ? 'md:py-2' : undefined}>
        <h3 className={cx('mt-3 text-title-m font-semibold', label && 'md:mt-0 md:text-heading-s')}>{primaryName(dish, locale)}</h3>
        {desc && <p className="mt-0.5 text-body-s text-muted">{desc}</p>}
      </div>
    </li>
  );
}

function Row({ dish, locale, price, last }: { dish: Dish; locale: Locale; price: string; last: boolean }) {
  const desc = descriptionOf(dish, locale);
  return (
    <li id={`d-${dish.id.slice(0, 8)}`} className={cx('flex scroll-mt-20 items-center gap-4 py-4', !last && 'border-b border-dashed border-line', CARD)}>
      <div className="min-w-0 flex-1">
        <h3 className="text-title-s font-semibold">{primaryName(dish, locale)}</h3>
        {desc && <p className="mt-0.5 text-body-s text-muted">{desc}</p>}
        <span dir="ltr" className="menu-price mt-2 inline-block rounded-[var(--r-chip)] bg-[var(--price-bg,var(--brand-soft))] px-2 py-0.5 font-mono text-caption font-semibold text-brand">
          {price}
        </span>
      </div>
      {dish.photo && <img src={dish.photo.thumbUrl} alt="" width={84} height={84} loading="lazy" className="size-21 shrink-0 rounded-[var(--r-thumb)] object-cover" />}
    </li>
  );
}

/** Text only, like a printed menu: name, a dotted leader, the price; the description below. */
function Compact({ dish, locale, price, last }: { dish: Dish; locale: Locale; price: string; last: boolean }) {
  const desc = descriptionOf(dish, locale);
  return (
    <li id={`d-${dish.id.slice(0, 8)}`} className={`scroll-mt-20 py-3 ${last ? '' : 'border-b border-dashed border-line'}`}>
      <div className="flex items-baseline gap-2">
        <h3 className="text-title-s font-semibold">{primaryName(dish, locale)}</h3>
        <span aria-hidden className="min-w-4 flex-1 translate-y-[-4px] border-b-2 border-dotted border-line-2" />
        <span dir="ltr" className="menu-price shrink-0 font-mono text-body-s font-semibold text-brand">
          {price}
        </span>
      </div>
      {desc && <p className="mt-0.5 text-body-s text-muted">{desc}</p>}
    </li>
  );
}

function Footer({ t }: { t: { footer: string; brand: string } }) {
  return (
    <footer className="mt-auto px-5 pt-8 pb-10 text-center text-caption text-muted">
      {t.footer} · <span className="font-semibold text-brand">{t.brand}</span>
    </footer>
  );
}
