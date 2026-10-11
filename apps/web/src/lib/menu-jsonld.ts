import type { PublicMenu } from '@savora/shared';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** schema.org Restaurant with its menu, so search results can show the place, hours and dishes.
 *  Names and descriptions follow the page's language, falling back to the other. */
export function menuJsonLd(menu: PublicMenu, url: string, locale: 'en' | 'ar') {
  const pick = (en: string | null, ar: string | null) => (locale === 'ar' ? (ar ?? en) : (en ?? ar)) ?? undefined;
  const place = menu.location;
  const currency = menu.menu.currency;
  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: pick(menu.brand.nameEn, menu.brand.nameAr),
    description: pick(menu.brand.taglineEn, menu.brand.taglineAr),
    url,
    image: menu.cover ? new URL(menu.cover.url, url).toString() : undefined,
    telephone: place.contact?.phone,
    address: place.addressEn || place.addressAr || place.city ? { '@type': 'PostalAddress', streetAddress: pick(place.addressEn, place.addressAr), addressLocality: place.city ?? undefined } : undefined,
    geo: place.pin ? { '@type': 'GeoCoordinates', latitude: place.pin.lat, longitude: place.pin.lng } : undefined,
    openingHoursSpecification: place.hours
      ?.map((d, i) => (d.open ? { '@type': 'OpeningHoursSpecification', dayOfWeek: DAYS[i], opens: d.from, closes: d.to } : null))
      .filter(Boolean),
    acceptsReservations: place.reservationUrl ? place.reservationUrl : undefined,
    hasMenu: {
      '@type': 'Menu',
      inLanguage: locale,
      hasMenuSection: menu.menu.categories.map((c) => ({
        '@type': 'MenuSection',
        name: pick(c.nameEn, c.nameAr),
        hasMenuItem: c.items.map((i) => ({
          '@type': 'MenuItem',
          name: pick(i.nameEn, i.nameAr),
          description: pick(i.descriptionEn, i.descriptionAr),
          image: i.photo ? new URL(i.photo.url, url).toString() : undefined,
          offers: { '@type': 'Offer', price: (i.priceMinor / 100).toFixed(2), priceCurrency: currency },
        })),
      })),
    },
  };
}

/** Safe to drop into a <script type="application/ld+json">: no way to close the tag early. */
export const jsonLdText = (data: unknown) => JSON.stringify(data).replace(/</g, '\u003c');
