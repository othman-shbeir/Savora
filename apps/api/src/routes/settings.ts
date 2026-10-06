import { schema, type Db } from '@savora/db';
import { can, photoOf, SettingsInput, type LocationSettings, type WeekHours } from '@savora/shared';
import { and, count, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth/session';
import { locationAccess } from '../lib/access';
import type { Geocoder } from '../lib/geocode';

type Location = typeof schema.locations.$inferSelect;

/** Who may change a location's public details. Editors keep the menu up to date but don't move the
 *  pin, the hours or the contact number. */
const MANAGERS = ['owner', 'admin'] as const;

async function loadSettings(db: Db, loc: Location): Promise<LocationSettings> {
  const [brand] = await db.select().from(schema.brands).where(eq(schema.brands.id, loc.brandId)).limit(1);
  const [branches] = await db.select({ n: count() }).from(schema.locations).where(eq(schema.locations.brandId, loc.brandId));
  const others = await db
    .select({ id: schema.locations.id, nameEn: schema.locations.nameEn, nameAr: schema.locations.nameAr, lat: schema.locations.lat, lng: schema.locations.lng })
    .from(schema.locations)
    .where(and(eq(schema.locations.organizationId, loc.organizationId), ne(schema.locations.id, loc.id), isNotNull(schema.locations.lat)));
  return {
    id: loc.id,
    slug: loc.slug,
    status: loc.status,
    nameEn: loc.nameEn,
    nameAr: loc.nameAr,
    currency: loc.currency,
    timezone: loc.timezone,
    addressEn: loc.addressEn,
    addressAr: loc.addressAr,
    building: loc.building,
    city: loc.city,
    lat: loc.lat,
    lng: loc.lng,
    deliveryRadiusM: loc.deliveryRadiusM,
    showMap: loc.showMap,
    hours: loc.hours,
    closures: loc.closures,
    phone: loc.phone,
    phoneIsWhatsapp: loc.phoneIsWhatsapp,
    orderUrl: loc.orderUrl,
    reservationUrl: loc.reservationUrl,
    cover: photoOf(loc.coverPhotoId),
    brand: { id: brand!.id, nameEn: brand!.nameEn, nameAr: brand!.nameAr, logo: photoOf(brand!.logoPhotoId), branches: Number(branches?.n ?? 1) },
    others: others.map((o) => ({ ...o, lat: o.lat!, lng: o.lng! })),
    organizationId: loc.organizationId,
  };
}

export function settingsRoutes(app: FastifyInstance, db: Db, geocode: Geocoder) {
  const auth = { preHandler: requireUser };

  app.get('/locations/:locationId/settings', auth, async (req, reply) => {
    const loc = await locationAccess(db, req, reply, (req.params as { locationId: string }).locationId);
    if (!loc) return;
    return loadSettings(db, loc);
  });

  app.patch('/locations/:locationId/settings', auth, async (req, reply) => {
    const loc = await locationAccess(db, req, reply, (req.params as { locationId: string }).locationId, [...MANAGERS]);
    if (!loc) return;
    const body = SettingsInput.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid', issues: body.error.issues.map((i) => i.path.join('.') || i.message) });
    const { coverPhotoId, logoPhotoId, hours, closures, ...fields } = body.data;
    const [org] = await db.select({ plan: schema.organizations.plan }).from(schema.organizations).where(eq(schema.organizations.id, loc.organizationId)).limit(1);
    if (!can(org!.plan, 'guestLinks')) {
      // Order and reservation links are a Growth feature: what's stored stays, edits are ignored.
      fields.orderUrl = loc.orderUrl;
      fields.reservationUrl = loc.reservationUrl;
    }

    // Photos must belong to this organization.
    const photoIds = [coverPhotoId, logoPhotoId].filter((x): x is string => Boolean(x));
    if (photoIds.length) {
      const owned = await db.select({ id: schema.media.id }).from(schema.media).where(and(inArray(schema.media.id, photoIds), eq(schema.media.organizationId, loc.organizationId)));
      if (owned.length !== new Set(photoIds).size) return reply.code(400).send({ error: 'invalid', issues: ['photo'] });
    }

    // Keep closures tidy: one per date (the first one entered), in date order.
    const tidy = closures
      .filter((c, i) => closures.findIndex((x) => x.date === c.date) === i)
      .map((c) => ({ date: c.date, note: c.note }))
      .sort((a, b) => a.date.localeCompare(b.date));
    await db.transaction(async (tx) => {
      await tx
        .update(schema.locations)
        .set({ ...fields, hours: hours as WeekHours | null, closures: tidy, coverPhotoId })
        .where(eq(schema.locations.id, loc.id));
      await tx.update(schema.brands).set({ logoPhotoId }).where(eq(schema.brands.id, loc.brandId));
    });
    const [fresh] = await db.select().from(schema.locations).where(eq(schema.locations.id, loc.id)).limit(1);
    return loadSettings(db, fresh!);
  });

  // Address search for the map. Signed-in only, and limited, to respect the geocoder's usage policy.
  app.get('/geocode', { preHandler: requireUser, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const q = z.object({ q: z.string().trim().min(3).max(120), lang: z.enum(['en', 'ar']).default('en') }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'invalid' });
    try {
      return { places: await geocode(q.data.q, q.data.lang) };
    } catch (e) {
      req.log.warn({ err: e }, 'geocoder failed');
      return reply.code(503).send({ error: 'geocoder_unavailable' });
    }
  });
}
