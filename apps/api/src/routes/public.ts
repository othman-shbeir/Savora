import { schema, type Db } from '@savora/db';
import { can, directionsUrl, photoOf, type PublicMenu } from '@savora/shared';
import { locationPaused, pausedIn } from '../lib/billing';
import { desc, eq, sql } from 'drizzle-orm';
import { resolveTheme } from './themes';
import { tourTeaser } from './tour';
import type { FastifyInstance } from 'fastify';

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/i;

/** Routes guests reach without signing in. They only ever expose published menu versions. */
export function publicRoutes(app: FastifyInstance, db: Db) {
  app.get('/public/menu/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    if (!SLUG.test(slug)) return reply.code(404).send({ error: 'not_found' });

    const [row] = await db
      .select({ location: schema.locations, brand: schema.brands })
      .from(schema.locations)
      .innerJoin(schema.brands, eq(schema.brands.id, schema.locations.brandId))
      .where(sql`lower(${schema.locations.slug}) = ${slug.toLowerCase()}`)
      .limit(1);
    if (!row) return reply.code(404).send({ error: 'not_found' });

    const { location, brand } = row;
    // Past the plan's location limit: the place is kept but resting until the owner upgrades.
    if (await locationPaused(db, location)) return reply.code(409).send({ error: 'paused', slug: location.slug, name: { en: brand.nameEn, ar: brand.nameAr } });
    const [org] = await db.select({ plan: schema.organizations.plan }).from(schema.organizations).where(eq(schema.organizations.id, location.organizationId)).limit(1);
    const links = can(org!.plan, 'guestLinks');
    const [latest] =
      location.status === 'live'
        ? await db.select().from(schema.menuVersions).where(eq(schema.menuVersions.locationId, location.id)).orderBy(desc(schema.menuVersions.version)).limit(1)
        : [];
    // The place exists but has nothing public yet: the page says "coming soon" instead of 404.
    if (!latest) return reply.code(409).send({ error: 'not_published', slug: location.slug, name: { en: brand.nameEn, ar: brand.nameAr } });

    const body: PublicMenu = {
      slug: location.slug,
      location: {
        nameEn: location.nameEn,
        nameAr: location.nameAr,
        addressEn: location.addressEn,
        addressAr: location.addressAr,
        city: location.city,
        timezone: location.timezone,
        pin: location.showMap && location.lat !== null && location.lng !== null ? { lat: location.lat, lng: location.lng, deliveryRadiusM: location.deliveryRadiusM } : null,
        directions: location.lat !== null && location.lng !== null ? directionsUrl(location.lat, location.lng) : null,
        hours: location.hours,
        closures: location.closures,
        contact: location.phone ? { phone: location.phone, whatsapp: location.phoneIsWhatsapp } : null,
        orderUrl: links ? location.orderUrl : null,
        reservationUrl: links ? location.reservationUrl : null,
      },
      brand: { nameEn: brand.nameEn, nameAr: brand.nameAr, taglineEn: brand.taglineEn, taglineAr: brand.taglineAr, logo: photoOf(brand.logoPhotoId) },
      cover: photoOf(location.coverPhotoId),
      version: latest.version,
      publishedAt: latest.publishedAt.toISOString(),
      menu: latest.content,
      theme: await resolveTheme(db, location, org!.plan),
      tour: await tourTeaser(db, location, org!.plan),
    };
    // Guests always get the newest version; a short shared cache absorbs bursts at busy tables.
    return reply.header('cache-control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=60').send(body);
  });

  // For the sitemap: every menu guests can open, with when it last changed.
  app.get('/public/sitemap', async (_req, reply) => {
    const rows = await db
      .select({ id: schema.locations.id, slug: schema.locations.slug, organizationId: schema.locations.organizationId, plan: schema.organizations.plan, updatedAt: sql<string>`max(${schema.menuVersions.publishedAt})` })
      .from(schema.locations)
      .innerJoin(schema.organizations, eq(schema.organizations.id, schema.locations.organizationId))
      .innerJoin(schema.menuVersions, eq(schema.menuVersions.locationId, schema.locations.id))
      .where(eq(schema.locations.status, 'live'))
      .groupBy(schema.locations.id, schema.organizations.plan);
    const paused = new Set<string>();
    for (const org of new Map(rows.map((r) => [r.organizationId, r.plan]))) for (const id of await pausedIn(db, org[0], org[1])) paused.add(id);
    const menus = rows.filter((r) => !paused.has(r.id)).map((r) => ({ slug: r.slug, updatedAt: new Date(r.updatedAt).toISOString() }));
    return reply.header('cache-control', 'public, max-age=0, s-maxage=3600').send({ menus });
  });
}
