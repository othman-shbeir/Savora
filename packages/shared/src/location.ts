import { z } from 'zod';
import { isTimeZone, localDate, shiftDate, weekdayOf } from './analytics';
import { CURRENCIES, type Photo } from './menu';

// Location settings: identity, address and map, opening hours, guest actions. Shared so the API
// validates exactly what the settings screen edits, and the guest page reads hours the same way.

/** One day's hours, 24-hour "HH:MM". `to` at or before `from` runs past midnight (18:00–02:00);
 *  "00:00" as `to` means until midnight. */
export type DayHours = { open: boolean; from: string; to: string };
/** Sunday first, as Date.getDay() counts. */
export type WeekHours = [DayHours, DayHours, DayHours, DayHours, DayHours, DayHours, DayHours];
/** A one-off day off, e.g. Eid. */
export type Closure = { date: string; note: string | null };

export const DEFAULT_HOURS: WeekHours = Array.from({ length: 7 }, () => ({ open: true, from: '08:00', to: '22:00' })) as WeekHours;

/** Time zones offered in settings: the region first, then a few common ones. */
export const TIME_ZONES = ['Asia/Hebron', 'Asia/Gaza', 'Asia/Jerusalem', 'Asia/Amman', 'Asia/Beirut', 'Asia/Damascus', 'Asia/Baghdad', 'Asia/Riyadh', 'Asia/Dubai', 'Africa/Cairo', 'Europe/Istanbul', 'Europe/London', 'UTC'] as const;

export type LocationSettings = {
  id: string;
  slug: string;
  status: 'draft' | 'live';
  nameEn: string;
  nameAr: string | null;
  currency: string;
  timezone: string;
  addressEn: string | null;
  addressAr: string | null;
  building: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  deliveryRadiusM: number | null;
  showMap: boolean;
  hours: WeekHours | null;
  closures: Closure[];
  phone: string | null;
  phoneIsWhatsapp: boolean;
  orderUrl: string | null;
  reservationUrl: string | null;
  cover: Photo | null;
  brand: { id: string; nameEn: string; nameAr: string | null; logo: Photo | null; branches: number };
  /** The organization's other branches, for the map. */
  others: Array<{ id: string; nameEn: string; nameAr: string | null; lat: number; lng: number }>;
  organizationId: string;
};

// ---------- Validation ----------

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const opt = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
const url = z
  .string()
  .trim()
  .max(300)
  .nullish()
  .transform((v) => v || null)
  .refine((v) => v === null || /^https?:\/\/[^\s]+\.[^\s]+$/i.test(v), 'url');

export const SettingsInput = z.object({
  nameEn: z.string().trim().min(2).max(80),
  nameAr: opt(80),
  currency: z.enum(CURRENCIES),
  timezone: z.string().refine(isTimeZone, 'timezone'),
  addressEn: opt(160),
  addressAr: opt(160),
  building: opt(80),
  city: opt(60),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  // 300 m to 20 km; null means no delivery.
  deliveryRadiusM: z.number().int().min(300).max(20000).nullable(),
  showMap: z.boolean(),
  hours: z.array(z.object({ open: z.boolean(), from: time, to: time })).length(7).nullable(),
  closures: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: opt(60) })).max(60),
  // Digits with an optional leading +, spaces and dashes allowed: +970 59 555 0142.
  phone: z
    .string()
    .trim()
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || /^\+?[\d\s-]{6,20}$/.test(v), 'phone'),
  phoneIsWhatsapp: z.boolean(),
  orderUrl: url,
  reservationUrl: url,
  coverPhotoId: z.string().uuid().nullable(),
  logoPhotoId: z.string().uuid().nullable(),
}).refine((v) => (v.lat === null) === (v.lng === null), { message: 'pin', path: ['lat'] });
export type SettingsPayload = z.input<typeof SettingsInput>;

// ---------- Opening hours ----------

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** End of a day's opening in minutes from that day's midnight; past 1440 runs into the next day. */
const endOf = (d: DayHours) => {
  const from = minutes(d.from);
  const to = minutes(d.to);
  return to <= from ? to + 1440 : to;
};

export type OpenStatus =
  | { state: 'open'; until: string }
  | { state: 'closed'; opensAt: string; opensDay: 'today' | 'tomorrow' | number }
  | { state: 'closedToday'; note: string | null; opensAt: string | null; opensDay: 'tomorrow' | number | null }
  | { state: 'closedForNow' };

/** Wall-clock minutes since midnight in a time zone. */
function clock(now: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((x) => [x.type, x.value]));
  return Number(p.hour) * 60 + Number(p.minute);
}

/** "Open now · until 23:00", "Opens 07:00 tomorrow", holidays and late nights included. */
export function openStatus(hours: WeekHours | null, closures: Closure[], tz: string, now: Date): OpenStatus | null {
  if (!hours) return null;
  const today = localDate(now, tz);
  const weekday = weekdayOf(today);
  const minute = clock(now, tz);
  const closedOn = (date: string) => closures.find((c) => c.date === date);

  // Still inside yesterday's late-night opening?
  const yesterday = shiftDate(today, -1);
  const y = hours[weekdayOf(yesterday)]!;
  if (y.open && !closedOn(yesterday) && endOf(y) > 1440 && minute < endOf(y) - 1440) return { state: 'open', until: y.to };

  const closure = closedOn(today);
  const d = hours[weekday]!;
  if (!closure && d.open) {
    if (minute >= minutes(d.from) && minute < endOf(d)) return { state: 'open', until: d.to };
    if (minute < minutes(d.from)) return { state: 'closed', opensAt: d.from, opensDay: 'today' };
  }
  // Find the next opening within a week.
  for (let i = 1; i <= 7; i++) {
    const date = shiftDate(today, i);
    const n = hours[weekdayOf(date)]!;
    if (n.open && !closedOn(date)) {
      const opensDay = i === 1 ? 'tomorrow' : weekdayOf(date);
      return closure ? { state: 'closedToday', note: closure.note, opensAt: n.from, opensDay } : { state: 'closed', opensAt: n.from, opensDay };
    }
  }
  return closure ? { state: 'closedToday', note: closure.note, opensAt: null, opensDay: null } : { state: 'closedForNow' };
}

// ---------- Helpers ----------

/** Distance in km between two points (haversine). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Opens the phone's maps app with directions to the pin. */
export const directionsUrl = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}`;

/** tel: or WhatsApp link for the Contact button. */
export function contactUrl(phone: string, whatsapp: boolean) {
  const digits = phone.replace(/[^\d+]/g, '');
  return whatsapp ? `https://wa.me/${digits.replace(/^\+/, '')}` : `tel:${digits}`;
}

export type SetupItem = { key: 'names' | 'pin' | 'hours' | 'logo' | 'contact' | 'booking'; done: boolean };

/** The checklist beside the settings: what makes a complete listing for guests. */
export function setupHealth(s: Pick<LocationSettings, 'nameEn' | 'nameAr' | 'lat' | 'hours' | 'phone' | 'orderUrl' | 'reservationUrl'> & { logo: unknown }): { items: SetupItem[]; pct: number } {
  const items: SetupItem[] = [
    { key: 'names', done: Boolean(s.nameEn && s.nameAr) },
    { key: 'pin', done: s.lat !== null },
    { key: 'hours', done: Boolean(s.hours?.some((d) => d.open)) },
    { key: 'logo', done: Boolean(s.logo) },
    { key: 'contact', done: Boolean(s.phone) },
    { key: 'booking', done: Boolean(s.orderUrl || s.reservationUrl) },
  ];
  return { items, pct: Math.round((items.filter((i) => i.done).length / items.length) * 100) };
}
