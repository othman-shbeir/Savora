import { describe, expect, it } from 'vitest';
import { contactUrl, DEFAULT_HOURS, directionsUrl, distanceKm, openStatus, SettingsInput, setupHealth, type WeekHours } from './location';

// Amman is UTC+3 all year, so the wall clock in these tests is unambiguous.
const TZ = 'Asia/Amman';
const at = (local: string) => new Date(`${local}:00+03:00`); // e.g. 2026-10-09T10:00 (a Friday)
const week = (over: Partial<Record<number, { open: boolean; from: string; to: string }>> = {}) =>
  DEFAULT_HOURS.map((d, i) => over[i] ?? { ...d, from: '07:00', to: '23:00' }) as WeekHours;

describe('open status', () => {
  it('is open during the day, until closing time', () => {
    expect(openStatus(week(), [], TZ, at('2026-10-09T10:00'))).toEqual({ state: 'open', until: '23:00' });
  });
  it('says when it opens later today, or tomorrow', () => {
    expect(openStatus(week(), [], TZ, at('2026-10-09T06:30'))).toEqual({ state: 'closed', opensAt: '07:00', opensDay: 'today' });
    expect(openStatus(week(), [], TZ, at('2026-10-09T23:30'))).toEqual({ state: 'closed', opensAt: '07:00', opensDay: 'tomorrow' });
  });
  it('handles late nights that run past midnight', () => {
    const late = week({ 4: { open: true, from: '18:00', to: '02:00' } }); // Thursday
    expect(openStatus(late, [], TZ, at('2026-10-09T01:30'))).toEqual({ state: 'open', until: '02:00' }); // Friday 01:30
    expect(openStatus(late, [], TZ, at('2026-10-09T02:30'))).toEqual({ state: 'closed', opensAt: '07:00', opensDay: 'today' });
    // "00:00" closes at midnight.
    const midnight = week({ 5: { open: true, from: '07:00', to: '00:00' } });
    expect(openStatus(midnight, [], TZ, at('2026-10-09T23:45'))).toEqual({ state: 'open', until: '00:00' });
  });
  it('skips closed days to find the next opening', () => {
    const fridayOff = week({ 5: { open: false, from: '07:00', to: '23:00' } });
    expect(openStatus(fridayOff, [], TZ, at('2026-10-09T10:00'))).toEqual({ state: 'closed', opensAt: '07:00', opensDay: 'tomorrow' });
    const longWeekend = week({ 5: { open: false, from: '07:00', to: '23:00' }, 6: { open: false, from: '07:00', to: '23:00' } });
    expect(openStatus(longWeekend, [], TZ, at('2026-10-09T10:00'))).toEqual({ state: 'closed', opensAt: '07:00', opensDay: 0 });
  });
  it('honours holiday closures', () => {
    const s = openStatus(week(), [{ date: '2026-10-09', note: 'Eid' }], TZ, at('2026-10-09T10:00'));
    expect(s).toEqual({ state: 'closedToday', note: 'Eid', opensAt: '07:00', opensDay: 'tomorrow' });
  });
  it('stays silent until hours are set', () => {
    expect(openStatus(null, [], TZ, at('2026-10-09T10:00'))).toBeNull();
    expect(openStatus(week(Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((i) => [i, { open: false, from: '07:00', to: '23:00' }]))), [], TZ, at('2026-10-09T10:00'))).toEqual({ state: 'closedForNow' });
  });
});

describe('settings validation', () => {
  const valid = {
    nameEn: 'Ramallah counter', nameAr: 'فرع رام الله', currency: 'ILS', timezone: 'Asia/Hebron',
    addressEn: 'Rukab St', addressAr: null, building: null, city: 'Ramallah', lat: 31.9074, lng: 35.2094,
    deliveryRadiusM: 800, showMap: true, hours: DEFAULT_HOURS, closures: [], phone: '+970 59 555 0142', phoneIsWhatsapp: true,
    orderUrl: 'https://order.example.com/saltandstem', reservationUrl: '', coverPhotoId: null, logoPhotoId: null,
  };
  it('accepts a complete location and blanks optional fields', () => {
    const r = SettingsInput.parse(valid);
    expect(r.reservationUrl).toBeNull();
  });
  it('rejects bad links, phones, times, zones and half-set pins', () => {
    expect(SettingsInput.safeParse({ ...valid, orderUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(SettingsInput.safeParse({ ...valid, phone: 'call me' }).success).toBe(false);
    expect(SettingsInput.safeParse({ ...valid, hours: [...DEFAULT_HOURS.slice(0, 6), { open: true, from: '25:00', to: '23:00' }] }).success).toBe(false);
    expect(SettingsInput.safeParse({ ...valid, timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(SettingsInput.safeParse({ ...valid, lng: null }).success).toBe(false);
    expect(SettingsInput.safeParse({ ...valid, deliveryRadiusM: 50 }).success).toBe(false);
  });
});

describe('helpers', () => {
  it('measures distances on the ground', () => {
    // Ramallah's Al-Manara Square to Jerusalem's Damascus Gate is about 14 km.
    expect(distanceKm({ lat: 31.9038, lng: 35.2034 }, { lat: 31.7816, lng: 35.2307 })).toBeCloseTo(13.8, 0);
  });
  it('builds directions and contact links', () => {
    expect(directionsUrl(31.9074, 35.2094)).toBe('https://www.google.com/maps/dir/?api=1&destination=31.907400,35.209400');
    expect(contactUrl('+970 59-555 0142', false)).toBe('tel:+970595550142');
    expect(contactUrl('+970 59-555 0142', true)).toBe('https://wa.me/970595550142');
  });
  it('scores the setup checklist', () => {
    const h = setupHealth({ nameEn: 'A', nameAr: 'ب', lat: 1, hours: DEFAULT_HOURS, phone: null, orderUrl: null, reservationUrl: null, logo: null });
    expect(h.pct).toBe(50);
    expect(h.items.filter((i) => !i.done).map((i) => i.key)).toEqual(['logo', 'contact', 'booking']);
  });
});
