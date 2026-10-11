import type { MetadataRoute } from 'next';
import { SITE_ORIGIN } from '@/lib/site';

/** Search engines get the landing page, legal pages and published guest menus; never the workspace. */
export default function robots(): MetadataRoute.Robots {
  const privateAreas = ['app', 'staff', 'welcome', 'auth'].flatMap((p) => [`/en/${p}`, `/ar/${p}`]);
  return { rules: { userAgent: '*', allow: '/', disallow: [...privateAreas, '/api/'] }, sitemap: `${SITE_ORIGIN}/sitemap.xml` };
}
