import type { MetadataRoute } from 'next';
import { SITE_ORIGIN } from '@/lib/site';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';

// Regenerated at most hourly, so new menus are listed without a deploy.
export const revalidate = 3600;

/** Public pages in both languages, each pointing at its other-language twin. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const both = (path: string, extra: Partial<MetadataRoute.Sitemap[number]> = {}) =>
    (['en', 'ar'] as const).map((l) => ({
      url: `${SITE_ORIGIN}/${l}${path}`,
      alternates: { languages: { en: `${SITE_ORIGIN}/en${path}`, ar: `${SITE_ORIGIN}/ar${path}` } },
      ...extra,
    }));
  let menus: Array<{ slug: string; updatedAt: string }> = [];
  try {
    const res = await fetch(`${API_ORIGIN}/public/sitemap`, { next: { revalidate: 3600 } });
    if (res.ok) menus = (await res.json()).menus;
  } catch {
    // The API being down shouldn't break the sitemap; menus return on the next refresh.
  }
  return [
    ...both('', { changeFrequency: 'weekly', priority: 1 }),
    ...both('/sign-in', { priority: 0.3 }),
    ...both('/privacy', { priority: 0.2 }),
    ...both('/terms', { priority: 0.2 }),
    ...menus.flatMap((m) => both(`/r/${m.slug}`, { lastModified: m.updatedAt, changeFrequency: 'daily', priority: 0.7 })),
  ];
}
