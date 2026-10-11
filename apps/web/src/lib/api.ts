import { cookies } from 'next/headers';
import { cache } from 'react';
import type { AnalyticsRange, AnalyticsReport, BillingOverview, LocationSettings, Me, MenuDraft, Overview, PublicMenu, PublicTour, ThemesOverview, TourDraft } from '@savora/shared';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';

/** Server-side call to the API that forwards the visitor's cookies (and so their session). */
export async function apiServer(path: string, init: RequestInit = {}) {
  const jar = await cookies();
  return fetch(`${API_ORIGIN}${path}`, {
    ...init,
    cache: 'no-store',
    headers: { ...init.headers, cookie: jar.toString() },
  });
}

/** The signed-in user and their workspace, or null when signed out. */
export async function getMe(): Promise<Me | null> {
  const res = await apiServer('/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`API /me failed: ${res.status}`);
  return res.json();
}

export async function getOverview(orgId: string): Promise<Overview | null> {
  const res = await apiServer(`/organizations/${orgId}/overview`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API overview failed: ${res.status}`);
  return res.json();
}

/** The location's draft menu, or null when it doesn't exist or isn't the caller's. */
export async function getMenu(locationId: string): Promise<MenuDraft | null> {
  const res = await apiServer(`/locations/${locationId}/menu`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API menu failed: ${res.status}`);
  return res.json();
}

export type PublicMenuResult =
  | { status: 'ok'; menu: PublicMenu }
  | { status: 'not_published'; name: { en: string; ar: string | null } }
  | { status: 'paused'; name: { en: string; ar: string | null } }
  | { status: 'missing' };

/** The published menu behind a guest link. No cookies: guests are anonymous. Deduplicated per
 *  request so the page and its metadata share one call. */
export const getPublicMenu = cache(async (slug: string): Promise<PublicMenuResult> => {
  const res = await fetch(`${API_ORIGIN}/public/menu/${encodeURIComponent(slug)}`, { cache: 'no-store' });
  if (res.status === 404) return { status: 'missing' };
  if (res.status === 409) {
    const body = (await res.json()) as { error: string; name: { en: string; ar: string | null } };
    return body.error === 'paused' ? { status: 'paused', name: body.name } : { status: 'not_published', name: body.name };
  }
  if (!res.ok) throw new Error(`API public menu failed: ${res.status}`);
  return { status: 'ok', menu: await res.json() };
});

/** Where printed QR codes and shared links point. savora.menu in production. */
export const MENU_ORIGIN = (process.env.PUBLIC_MENU_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');

export async function getAnalytics(locationId: string, range: AnalyticsRange): Promise<AnalyticsReport | null> {
  const res = await apiServer(`/locations/${locationId}/analytics?range=${range}`);
  // 402: the plan doesn't include analytics; callers simply show nothing.
  if (res.status === 404 || res.status === 402) return null;
  if (!res.ok) throw new Error(`API analytics failed: ${res.status}`);
  return res.json();
}

export async function getSettings(locationId: string): Promise<LocationSettings | null> {
  const res = await apiServer(`/locations/${locationId}/settings`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API settings failed: ${res.status}`);
  return res.json();
}

export async function getBilling(orgId: string): Promise<BillingOverview | null> {
  const res = await apiServer(`/organizations/${orgId}/billing`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API billing failed: ${res.status}`);
  return res.json();
}

/** Analytics, or why it's locked: the plan, and how many scans are waiting behind the lock. */
export async function getAnalyticsOrLock(locationId: string, range: AnalyticsRange): Promise<{ report: AnalyticsReport } | { locked: { plan: string; allTime: number } } | null> {
  const res = await apiServer(`/locations/${locationId}/analytics?range=${range}`);
  if (res.status === 404) return null;
  if (res.status === 402) return { locked: await res.json() };
  if (!res.ok) throw new Error(`API analytics failed: ${res.status}`);
  return { report: await res.json() };
}

export async function getThemes(locationId: string): Promise<ThemesOverview | null> {
  const res = await apiServer(`/locations/${locationId}/themes`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API themes failed: ${res.status}`);
  return res.json();
}

/** The tour builder's draft, or why it's locked. */
export async function getTourOrLock(locationId: string): Promise<{ draft: TourDraft } | { locked: true } | null> {
  const res = await apiServer(`/locations/${locationId}/tour`);
  if (res.status === 404) return null;
  if (res.status === 402) return { locked: true };
  if (!res.ok) throw new Error(`API tour failed: ${res.status}`);
  return { draft: await res.json() };
}

/** A published Virtual trial, for guests (no cookies). Null when there is none to show. */
export const getPublicTour = cache(async (slug: string): Promise<PublicTour | null> => {
  const res = await fetch(`${API_ORIGIN}/public/tour/${encodeURIComponent(slug)}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API public tour failed: ${res.status}`);
  return res.json();
});
