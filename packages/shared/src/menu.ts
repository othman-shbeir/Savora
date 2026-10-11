import { z } from 'zod';
import type { Closure, WeekHours } from './location';
import type { Theme } from './themes';
import type { TourTeaser } from './tour';

// Menu shapes shared by the API (which stores and validates them) and the web editor.
// Prices are whole minor units (agorot, fils, cents) so sums and comparisons are exact.

export const CURRENCIES = ['ILS', 'JOD', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export type Photo = { id: string; url: string; thumbUrl: string };

export type MenuItem = {
  id: string;
  categoryId: string;
  nameEn: string | null;
  nameAr: string | null;
  descriptionEn: string | null;
  descriptionAr: string | null;
  priceMinor: number;
  available: boolean;
  photo: Photo | null;
};

export type MenuCategory = { id: string; nameEn: string | null; nameAr: string | null; items: MenuItem[] };

/** What guests see: only available items, only categories that have some. Frozen at publish time. */
export type MenuSnapshot = {
  currency: string;
  categories: Array<Omit<MenuCategory, 'items'> & { items: Array<Omit<MenuItem, 'categoryId' | 'available'>> }>;
};

export type PublishedVersion = { version: number; note: string | null; publishedAt: string; itemCount: number };

export type HealthCheck = {
  key: 'items' | 'names' | 'categories' | 'prices';
  ok: boolean;
  /** Counts and examples the UI turns into a sentence in the reader's language. */
  count: number;
  examples: string[];
  /** For 'names': which language is missing more often. */
  missing?: 'ar' | 'en';
};

export type MenuDraft = {
  location: { id: string; nameEn: string; nameAr: string | null; slug: string; status: 'draft' | 'live'; currency: string; organizationId: string };
  categories: MenuCategory[];
  published: PublishedVersion | null;
  hasChanges: boolean;
  health: HealthCheck[];
};

// ---------- Validation ----------

const name = z.string().trim().max(80).nullish().transform((v) => v || null);
const description = z.string().trim().max(240).nullish().transform((v) => v || null);
const bothNamesNeeded = { message: 'name_required', path: ['nameEn'] };
const hasAName = (v: { nameEn?: string | null; nameAr?: string | null }) => Boolean(v.nameEn || v.nameAr);

export const CategoryInput = z.object({ nameEn: name, nameAr: name }).refine(hasAName, bothNamesNeeded);

/** Up to 100,000.00 in any currency; enough for a menu, small enough to catch a typo in minor units. */
export const priceMinor = z.number().int().min(0).max(10_000_000);

export const ItemInput = z
  .object({
    categoryId: z.string().uuid(),
    nameEn: name,
    nameAr: name,
    descriptionEn: description,
    descriptionAr: description,
    priceMinor,
    available: z.boolean().default(true),
    photoId: z.string().uuid().nullish().transform((v) => v ?? null),
  })
  .refine(hasAName, bothNamesNeeded);

export const ImportInput = z.object({
  categories: z
    .array(
      z.object({
        nameEn: name,
        nameAr: name,
        items: z.array(z.object({ nameEn: name, nameAr: name, descriptionEn: description, descriptionAr: description, priceMinor }).refine(hasAName, bothNamesNeeded)).max(200),
      }).refine(hasAName, bothNamesNeeded),
    )
    .min(1)
    .max(40),
});
export type ImportPayload = z.infer<typeof ImportInput>;

// ---------- Prices ----------

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;
/** ١٨ -> 18, ۱۸ -> 18, and the Arabic decimal separator ٫ -> . */
export function westernDigits(s: string) {
  return s.replace(ARABIC_DIGITS, (d) => String((d.charCodeAt(0) - 0x0660) % 0x90 % 10)).replace(/٫/g, '.');
}

/** Turns what an owner types ("18", "18.5", "١٨", "₪ 22.00") into minor units, or null if it isn't a price. */
export function parsePrice(input: string): number | null {
  const s = westernDigits(input).replace(/[^\d.,]/g, '').replace(',', '.');
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export { formatPrice } from './format';

/** Minor units back to the plain number shown in a price field: 1800 -> "18", 1850 -> "18.50". */
export function priceInput(minor: number) {
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}

// ---------- Health ----------

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

const label = (x: { nameEn: string | null; nameAr: string | null }) => x.nameEn || x.nameAr || '';

/** A quick pass over the draft before it becomes the public menu. Warnings never block publishing,
 *  except an empty menu. */
export function menuHealth(categories: MenuCategory[]): HealthCheck[] {
  const items = categories.flatMap((c) => c.items);
  const shown = items.filter((i) => i.available);

  const noAr = [...categories, ...items].filter((x) => !x.nameAr);
  const noEn = [...categories, ...items].filter((x) => !x.nameEn);
  const missing = noAr.length >= noEn.length ? 'ar' : 'en';
  const untranslated = missing === 'ar' ? noAr : noEn;

  const empty = categories.filter((c) => !c.items.some((i) => i.available));

  // Free items and prices far from the menu's typical price are usually typos (18 vs 1800).
  const mid = shown.length ? median(shown.map((i) => i.priceMinor)) : 0;
  const odd = shown.filter((i) => i.priceMinor === 0 || (mid > 0 && (i.priceMinor > mid * 15 || i.priceMinor * 15 < mid)));

  return [
    { key: 'items', ok: shown.length > 0, count: shown.length, examples: [] },
    { key: 'names', ok: untranslated.length === 0, count: untranslated.length, examples: untranslated.slice(0, 2).map(label), missing },
    { key: 'categories', ok: empty.length === 0, count: empty.length, examples: empty.slice(0, 2).map(label) },
    { key: 'prices', ok: odd.length === 0, count: odd.length, examples: odd.slice(0, 2).map(label) },
  ];
}

/** The guest-facing copy of a draft. Two drafts with the same snapshot look identical to guests. */
export function snapshotOf(categories: MenuCategory[], currency: string): MenuSnapshot {
  return {
    currency,
    categories: categories
      .map((c) => ({
        id: c.id,
        nameEn: c.nameEn,
        nameAr: c.nameAr,
        items: c.items.filter((i) => i.available).map(({ categoryId: _c, available: _a, ...rest }) => rest),
      }))
      .filter((c) => c.items.length > 0),
  };
}

// ---------- Paste your menu ----------

const ARABIC = /[؀-ۿ]/;
const PRICE_AT_END = /^(.*?)[\s.·…:|\-–—_]*(?:₪|\$|JD|JOD|ILS|NIS|شيكل|شيقل|دينار|ش\.?)?\s*(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:₪|\$|JD|JOD|ILS|NIS|شيكل|شيقل|دينار|ش\.?|د\.ا)?\s*$/i;

/** "Cardamom Latte / لاتيه بالهيل" -> both names. A single name goes to the language it is written in. */
function splitNames(text: string): { nameEn: string | null; nameAr: string | null } {
  const parts = text.split(/\s+[/|–—-]\s+|\s*[/|]\s*/).map((p) => p.trim()).filter(Boolean);
  const ar = parts.filter((p) => ARABIC.test(p));
  const en = parts.filter((p) => !ARABIC.test(p));
  if (parts.length > 1 && ar.length && en.length) return { nameEn: en.join(' ').slice(0, 80), nameAr: ar.join(' ').slice(0, 80) };
  const whole = text.trim().slice(0, 80);
  return ARABIC.test(whole) ? { nameEn: null, nameAr: whole } : { nameEn: whole, nameAr: null };
}

/** Turns pasted text into categories and items. Lines ending in a price are items; other lines are
 *  category headings, or the description of the item just above when they read like one.
 *  It is deliberately simple and predictable; the owner reviews the result before it is added. */
export function parsePastedMenu(text: string, fallbackCategory = { nameEn: 'Menu', nameAr: 'القائمة' }): ImportPayload {
  const categories: ImportPayload['categories'] = [];
  let current: ImportPayload['categories'][number] | null = null;
  let lastItem: ImportPayload['categories'][number]['items'][number] | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = westernDigits(raw).replace(/^[\s•*·\-–—]+/, '').trim();
    if (!line) {
      lastItem = null;
      continue;
    }
    const m = PRICE_AT_END.exec(line);
    const itemName = m?.[1]?.trim();
    if (m && itemName && /[\p{L}]/u.test(itemName)) {
      if (!current) categories.push((current = { ...fallbackCategory, items: [] }));
      lastItem = { ...splitNames(itemName), descriptionEn: null, descriptionAr: null, priceMinor: parsePrice(m[2]!)! };
      current.items.push(lastItem);
      continue;
    }
    if (m && !itemName) continue; // a stray number on its own line

    // Lower-case starts, commas and long lines read as descriptions, not headings.
    const looksLikeDescription = lastItem && (/^[a-z]/.test(line) || line.includes(',') || line.includes('،') || line.split(/\s+/).length > 5);
    if (lastItem && looksLikeDescription) {
      const key = ARABIC.test(line) ? 'descriptionAr' : 'descriptionEn';
      lastItem[key] = [lastItem[key], line].filter(Boolean).join(' ').slice(0, 240);
      continue;
    }
    categories.push((current = { ...splitNames(line.replace(/:$/, '')), items: [] }));
    lastItem = null;
  }
  return { categories: categories.filter((c) => c.items.length > 0) };
}

/** Photos are served by the API and reached through the web app's /api proxy. */
export function photoOf(id: string | null): Photo | null {
  return id ? { id, url: `/api/media/${id}/full.webp`, thumbUrl: `/api/media/${id}/thumb.webp` } : null;
}

/** JSON with object keys sorted, so a snapshot read back from Postgres jsonb (which reorders keys)
 *  compares equal to the same snapshot built in memory. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export const sameSnapshot = (a: MenuSnapshot, b: MenuSnapshot) => canonicalJson(a) === canonicalJson(b);

/** Everything the public guest page needs, and nothing from the draft. */
export type PublicMenu = {
  slug: string;
  location: {
    nameEn: string;
    nameAr: string | null;
    addressEn: string | null;
    addressAr: string | null;
    city: string | null;
    timezone: string;
    /** Only when the owner chose to show the map. */
    pin: { lat: number; lng: number; deliveryRadiusM: number | null } | null;
    /** Directions work from the pin even when the map card is hidden. */
    directions: string | null;
    hours: WeekHours | null;
    closures: Closure[];
    contact: { phone: string; whatsapp: boolean } | null;
    orderUrl: string | null;
    reservationUrl: string | null;
  };
  brand: { nameEn: string; nameAr: string | null; taglineEn: string | null; taglineAr: string | null; logo: Photo | null };
  cover: Photo | null;
  version: number;
  publishedAt: string;
  menu: MenuSnapshot;
  /** The look chosen in Menu themes; applies at once, without publishing. */
  theme: Theme;
  /** The Virtual trial, when one is published. */
  tour: TourTeaser | null;
};
