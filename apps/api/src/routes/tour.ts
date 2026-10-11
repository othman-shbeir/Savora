import { schema, type Db } from '@savora/db';
import {
  can,
  canonicalJson,
  MAX_SCENES,
  MAX_SPOTS,
  photoOf,
  quality,
  SceneInput,
  SpotInput,
  tourChecks,
  tourScore,
  tourSeconds,
  type PlanId,
  type PublicTour,
  type TourDraft,
  type TourScene,
  type TourSnapshot,
  type TourTeaser,
} from '@savora/shared';
import { and, asc, desc, eq, inArray, max, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth/session';
import { locationAccess } from '../lib/access';
import { locationPaused } from '../lib/billing';
import { NotAnImage, processImage, type MediaStore } from '../lib/media';
import { measurePhoto } from '../lib/tour-quality';

type Location = typeof schema.locations.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Phone photos run to 12 MB; ten at a time keeps one upload reasonable. */
const TOUR_PHOTO_BYTES = 15 * 1024 * 1024;
const TOUR_PHOTOS_PER_UPLOAD = 10;
/** Scenes are shown full-screen, so they keep more pixels than dish photos. */
const SCENE_SIZE = 2400;

const uuid = z.string().uuid();
const invalid = (reply: FastifyReply, error: z.ZodError) => reply.code(400).send({ error: 'invalid', issues: error.issues.map((i) => i.path.join('.') || i.message) });

async function planOf(db: Db | Tx, organizationId: string): Promise<PlanId> {
  const [org] = await db.select({ plan: schema.organizations.plan }).from(schema.organizations).where(eq(schema.organizations.id, organizationId)).limit(1);
  return org?.plan ?? 'starter';
}

async function loadScenes(db: Db | Tx, locationId: string): Promise<TourScene[]> {
  const scenes = await db.select().from(schema.tourScenes).where(eq(schema.tourScenes.locationId, locationId)).orderBy(asc(schema.tourScenes.position));
  const spots = scenes.length
    ? await db.select().from(schema.tourSpots).where(inArray(schema.tourSpots.sceneId, scenes.map((s) => s.id))).orderBy(asc(schema.tourSpots.createdAt), asc(schema.tourSpots.id))
    : [];
  return scenes.map((s) => ({
    id: s.id,
    photo: photoOf(s.photoId)!,
    nameEn: s.nameEn,
    nameAr: s.nameAr,
    seconds: s.seconds,
    quality: s.quality,
    spots: spots
      .filter((p) => p.sceneId === s.id)
      .map((p) => ({ id: p.id, x: p.x, y: p.y, kind: p.kind, labelEn: p.labelEn, labelAr: p.labelAr, noteEn: p.noteEn, noteAr: p.noteAr, itemId: p.itemId, targetSceneId: p.targetSceneId })),
  }));
}

/** The tour as guests would get it if published now. Sizes come from the stored (shrunk) photo. */
async function snapshotOf(db: Db | Tx, scenes: TourScene[]): Promise<TourSnapshot> {
  const sizes = scenes.length ? await db.select({ id: schema.media.id, width: schema.media.width, height: schema.media.height }).from(schema.media).where(inArray(schema.media.id, scenes.map((s) => s.photo.id))) : [];
  return {
    scenes: scenes.map(({ photo, quality: _q, ...s }) => {
      const size = sizes.find((m) => m.id === photo.id);
      return { ...s, photoId: photo.id, width: size?.width ?? 1600, height: size?.height ?? 1200 };
    }),
  };
}

async function loadDraft(db: Db, loc: Location): Promise<TourDraft> {
  const scenes = await loadScenes(db, loc.id);
  const [tour] = await db.select().from(schema.tours).where(eq(schema.tours.locationId, loc.id)).limit(1);
  const [version] = await db.select({ id: schema.menuVersions.id }).from(schema.menuVersions).where(eq(schema.menuVersions.locationId, loc.id)).limit(1);
  const menuLive = loc.status === 'live' && Boolean(version);
  const items = await db
    .select({ id: schema.menuItems.id, nameEn: schema.menuItems.nameEn, nameAr: schema.menuItems.nameAr, priceMinor: schema.menuItems.priceMinor, photoId: schema.menuItems.photoId })
    .from(schema.menuItems)
    .innerJoin(schema.menuCategories, eq(schema.menuCategories.id, schema.menuItems.categoryId))
    .where(eq(schema.menuItems.locationId, loc.id))
    .orderBy(asc(schema.menuCategories.position), asc(schema.menuItems.position));
  const published = tour?.published && tour.publishedAt ? { at: tour.publishedAt.toISOString(), scenes: tour.published.scenes.length } : null;
  return {
    location: { id: loc.id, slug: loc.slug, currency: loc.currency, menuLive },
    scenes,
    score: tourScore(scenes),
    checks: tourChecks(scenes, menuLive),
    published,
    hasChanges: tour?.published ? canonicalJson(tour.published) !== canonicalJson(await snapshotOf(db, scenes)) : scenes.length > 0,
    dishes: items.map(({ photoId, ...i }) => ({ ...i, photo: photoOf(photoId) })),
  };
}

/** A published tour's card on the guest menu, or null. */
export async function tourTeaser(db: Db, loc: Pick<Location, 'id' | 'organizationId'>, plan: PlanId): Promise<TourTeaser | null> {
  if (!can(plan, 'virtualTrial')) return null;
  const [tour] = await db.select({ published: schema.tours.published }).from(schema.tours).where(eq(schema.tours.locationId, loc.id)).limit(1);
  const scenes = tour?.published?.scenes ?? [];
  return scenes.length ? { scenes: scenes.length, seconds: tourSeconds(scenes), cover: photoOf(scenes[0]!.photoId)! } : null;
}

export function tourRoutes(app: FastifyInstance, db: Db, store: MediaStore) {
  const auth = { preHandler: requireUser };

  /** The location, if the caller may work on it and the plan includes the Virtual trial. */
  async function tourLocation(req: FastifyRequest, reply: FastifyReply, locationId: string, roles?: Array<'owner' | 'admin' | 'editor'>) {
    const loc = await locationAccess(db, req, reply, locationId, roles);
    if (!loc) return null;
    if (!can(await planOf(db, loc.organizationId), 'virtualTrial')) {
      reply.code(402).send({ error: 'upgrade_required', feature: 'virtualTrial', plan: 'growth' });
      return null;
    }
    return loc;
  }
  const notFound = (reply: FastifyReply) => {
    reply.code(404).send({ error: 'not_found' });
    return null;
  };
  async function sceneLocation(req: FastifyRequest, reply: FastifyReply, sceneId: string) {
    if (!uuid.safeParse(sceneId).success) return notFound(reply);
    const [scene] = await db.select().from(schema.tourScenes).where(eq(schema.tourScenes.id, sceneId)).limit(1);
    if (!scene) return notFound(reply);
    const loc = await tourLocation(req, reply, scene.locationId);
    return loc ? { scene, loc } : null;
  }
  async function spotLocation(req: FastifyRequest, reply: FastifyReply, spotId: string) {
    if (!uuid.safeParse(spotId).success) return notFound(reply);
    const [spot] = await db.select().from(schema.tourSpots).where(eq(schema.tourSpots.id, spotId)).limit(1);
    if (!spot) return notFound(reply);
    const found = await sceneLocation(req, reply, spot.sceneId);
    return found ? { spot, ...found } : null;
  }

  /** Reads uploaded photos, shrinks and measures each one. Nothing is stored unless every file is
   *  a readable image within the limits. Null after replying with what was wrong. */
  async function readPhotos(req: FastifyRequest, reply: FastifyReply, organizationId: string, limit: number) {
    const files: Buffer[] = [];
    try {
      for await (const part of req.files({ limits: { files: limit, fileSize: TOUR_PHOTO_BYTES } })) files.push(await part.toBuffer());
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'FST_REQ_FILE_TOO_LARGE' || code === 'FST_FILES_LIMIT') {
        reply.code(413).send({ error: code === 'FST_FILES_LIMIT' ? 'too_many_files' : 'too_large', max: limit });
        return null;
      }
      throw e;
    }
    const ready = [];
    for (const data of files) {
      try {
        ready.push({ img: await processImage(data, SCENE_SIZE), measure: await measurePhoto(data) });
      } catch (e) {
        if (!(e instanceof NotAnImage)) throw e;
        reply.code(415).send({ error: 'not_an_image' });
        return null;
      }
    }
    const out = [];
    for (const { img, measure } of ready) {
      const [row] = await db.insert(schema.media).values({ organizationId, width: img.width, height: img.height, bytes: img.full.length }).returning();
      await store.put(row!.id, 'full', img.full);
      await store.put(row!.id, 'thumb', img.thumb);
      out.push({ mediaId: row!.id, measure });
    }
    return out;
  }

  /** Spots may only point at this location's dishes and scenes. */
  async function spotTargetsOk(locationId: string, sceneId: string, s: z.infer<typeof SpotInput>) {
    if (s.kind === 'dish') {
      const [item] = await db.select({ id: schema.menuItems.id }).from(schema.menuItems).where(and(eq(schema.menuItems.id, s.itemId!), eq(schema.menuItems.locationId, locationId))).limit(1);
      return Boolean(item);
    }
    if (s.kind === 'scene') {
      if (s.targetSceneId === sceneId) return false;
      const [target] = await db.select({ id: schema.tourScenes.id }).from(schema.tourScenes).where(and(eq(schema.tourScenes.id, s.targetSceneId!), eq(schema.tourScenes.locationId, locationId))).limit(1);
      return Boolean(target);
    }
    return true;
  }
  /** Only what the kind uses is kept, so switching kinds never leaves a stale link behind. */
  const spotValues = (s: z.infer<typeof SpotInput>) => ({ ...s, itemId: s.kind === 'dish' ? s.itemId : null, targetSceneId: s.kind === 'scene' ? s.targetSceneId : null });

  // ---------- Draft ----------

  app.get('/locations/:locationId/tour', auth, async (req, reply) => {
    const loc = await tourLocation(req, reply, (req.params as { locationId: string }).locationId);
    if (!loc) return;
    return loadDraft(db, loc);
  });

  app.post('/locations/:locationId/tour/scenes', auth, async (req, reply) => {
    const loc = await tourLocation(req, reply, (req.params as { locationId: string }).locationId);
    if (!loc) return;
    const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(schema.tourScenes).where(eq(schema.tourScenes.locationId, loc.id))) as [{ n: number }];
    if (n >= MAX_SCENES) return reply.code(409).send({ error: 'too_many_scenes', max: MAX_SCENES });
    const photos = await readPhotos(req, reply, loc.organizationId, Math.min(TOUR_PHOTOS_PER_UPLOAD, MAX_SCENES - n));
    if (!photos) return;
    if (!photos.length) return reply.code(400).send({ error: 'invalid' });
    await db.transaction(async (tx) => {
      const [row] = await tx.select({ p: max(schema.tourScenes.position) }).from(schema.tourScenes).where(eq(schema.tourScenes.locationId, loc.id));
      let position = (row?.p ?? -1) + 1;
      await tx.insert(schema.tourScenes).values(photos.map((p) => ({ locationId: loc.id, photoId: p.mediaId, position: position++, quality: quality(p.measure) })));
    });
    return reply.code(201).send(await loadDraft(db, loc));
  });

  // A retake: a new photo for the same scene, keeping its name and spots.
  app.put('/tour/scenes/:id/photo', auth, async (req, reply) => {
    const found = await sceneLocation(req, reply, (req.params as { id: string }).id);
    if (!found) return;
    const photos = await readPhotos(req, reply, found.loc.organizationId, 1);
    if (!photos) return;
    if (!photos.length) return reply.code(400).send({ error: 'invalid' });
    await db.update(schema.tourScenes).set({ photoId: photos[0]!.mediaId, quality: quality(photos[0]!.measure) }).where(eq(schema.tourScenes.id, found.scene.id));
    return loadDraft(db, found.loc);
  });

  app.patch('/tour/scenes/:id', auth, async (req, reply) => {
    const found = await sceneLocation(req, reply, (req.params as { id: string }).id);
    if (!found) return;
    const body = SceneInput.safeParse(req.body);
    if (!body.success) return invalid(reply, body.error);
    await db.update(schema.tourScenes).set(body.data).where(eq(schema.tourScenes.id, found.scene.id));
    return loadDraft(db, found.loc);
  });

  app.post('/tour/scenes/:id/move', auth, async (req, reply) => {
    const found = await sceneLocation(req, reply, (req.params as { id: string }).id);
    if (!found) return;
    const body = z.object({ to: z.number().int().min(0) }).safeParse(req.body);
    if (!body.success) return invalid(reply, body.error);
    await db.transaction(async (tx) => {
      const rows = await tx.select({ id: schema.tourScenes.id }).from(schema.tourScenes).where(eq(schema.tourScenes.locationId, found.loc.id)).orderBy(asc(schema.tourScenes.position));
      const order = rows.map((r) => r.id).filter((id) => id !== found.scene.id);
      order.splice(Math.min(body.data.to, order.length), 0, found.scene.id);
      for (const [i, id] of order.entries()) await tx.update(schema.tourScenes).set({ position: i }).where(eq(schema.tourScenes.id, id));
    });
    return loadDraft(db, found.loc);
  });

  app.delete('/tour/scenes/:id', auth, async (req, reply) => {
    const found = await sceneLocation(req, reply, (req.params as { id: string }).id);
    if (!found) return;
    await db.delete(schema.tourScenes).where(eq(schema.tourScenes.id, found.scene.id));
    return loadDraft(db, found.loc);
  });

  // ---------- Spots ----------

  app.post('/tour/scenes/:id/spots', auth, async (req, reply) => {
    const found = await sceneLocation(req, reply, (req.params as { id: string }).id);
    if (!found) return;
    const body = SpotInput.safeParse(req.body);
    if (!body.success) return invalid(reply, body.error);
    const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(schema.tourSpots).where(eq(schema.tourSpots.sceneId, found.scene.id))) as [{ n: number }];
    if (n >= MAX_SPOTS) return reply.code(409).send({ error: 'too_many_spots', max: MAX_SPOTS });
    if (!(await spotTargetsOk(found.loc.id, found.scene.id, body.data))) return reply.code(400).send({ error: 'invalid', issues: [body.data.kind === 'dish' ? 'itemId' : 'targetSceneId'] });
    await db.insert(schema.tourSpots).values({ sceneId: found.scene.id, ...spotValues(body.data) });
    return reply.code(201).send(await loadDraft(db, found.loc));
  });

  app.patch('/tour/spots/:id', auth, async (req, reply) => {
    const found = await spotLocation(req, reply, (req.params as { id: string }).id);
    if (!found) return;
    const body = SpotInput.safeParse(req.body);
    if (!body.success) return invalid(reply, body.error);
    if (!(await spotTargetsOk(found.loc.id, found.scene.id, body.data))) return reply.code(400).send({ error: 'invalid', issues: [body.data.kind === 'dish' ? 'itemId' : 'targetSceneId'] });
    await db.update(schema.tourSpots).set(spotValues(body.data)).where(eq(schema.tourSpots.id, found.spot.id));
    return loadDraft(db, found.loc);
  });

  app.delete('/tour/spots/:id', auth, async (req, reply) => {
    const found = await spotLocation(req, reply, (req.params as { id: string }).id);
    if (!found) return;
    await db.delete(schema.tourSpots).where(eq(schema.tourSpots.id, found.spot.id));
    return loadDraft(db, found.loc);
  });

  // ---------- Publishing ----------

  app.post('/locations/:locationId/tour/publish', auth, async (req, reply) => {
    const loc = await tourLocation(req, reply, (req.params as { locationId: string }).locationId, ['owner', 'admin']);
    if (!loc) return;
    if (await locationPaused(db, loc)) return reply.code(402).send({ error: 'upgrade_required', feature: 'locations' });
    const draft = await loadDraft(db, loc);
    const missing = draft.checks.filter((c) => c.required && !c.ok).map((c) => c.key);
    if (missing.length) return reply.code(409).send({ error: 'not_ready', missing });
    const snapshot = await snapshotOf(db, draft.scenes);
    const now = new Date();
    await db.insert(schema.tours).values({ locationId: loc.id, published: snapshot, publishedAt: now }).onConflictDoUpdate({ target: schema.tours.locationId, set: { published: snapshot, publishedAt: now } });
    return reply.code(201).send(await loadDraft(db, loc));
  });

  app.delete('/locations/:locationId/tour/publish', auth, async (req, reply) => {
    const loc = await tourLocation(req, reply, (req.params as { locationId: string }).locationId, ['owner', 'admin']);
    if (!loc) return;
    await db.update(schema.tours).set({ published: null, publishedAt: null }).where(eq(schema.tours.locationId, loc.id));
    return loadDraft(db, loc);
  });

  // ---------- Guests ----------

  app.get('/public/tour/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/i.test(slug)) return reply.code(404).send({ error: 'not_found' });
    const [row] = await db
      .select({ location: schema.locations, brand: schema.brands, tour: schema.tours })
      .from(schema.locations)
      .innerJoin(schema.brands, eq(schema.brands.id, schema.locations.brandId))
      .innerJoin(schema.tours, eq(schema.tours.locationId, schema.locations.id))
      .where(sql`lower(${schema.locations.slug}) = ${slug.toLowerCase()}`)
      .limit(1);
    const snapshot = row?.tour.published;
    if (!row || !snapshot?.scenes.length || row.location.status !== 'live') return reply.code(404).send({ error: 'not_found' });
    if (!can(await planOf(db, row.location.organizationId), 'virtualTrial') || (await locationPaused(db, row.location))) return reply.code(404).send({ error: 'not_found' });
    // Dishes come from the published menu, so guests see the same names and prices as on the menu.
    const [menu] = await db.select({ content: schema.menuVersions.content }).from(schema.menuVersions).where(eq(schema.menuVersions.locationId, row.location.id)).orderBy(desc(schema.menuVersions.version)).limit(1);
    const dishes = new Map((menu?.content.categories ?? []).flatMap((c) => c.items).map((i) => [i.id, i]));
    const sceneIds = new Set(snapshot.scenes.map((s) => s.id));
    const body: PublicTour = {
      slug: row.location.slug,
      name: { en: row.brand.nameEn, ar: row.brand.nameAr },
      currency: menu?.content.currency ?? row.location.currency,
      scenes: snapshot.scenes.map(({ photoId, spots, ...s }) => ({
        ...s,
        photo: photoOf(photoId)!,
        spots: spots
          .filter((p) => (p.kind === 'dish' ? dishes.has(p.itemId!) : p.kind === 'scene' ? sceneIds.has(p.targetSceneId!) : true))
          .map(({ itemId, ...p }) => {
            const d = itemId ? dishes.get(itemId) : undefined;
            return { ...p, dish: d ? { id: d.id, nameEn: d.nameEn, nameAr: d.nameAr, descriptionEn: d.descriptionEn, descriptionAr: d.descriptionAr, priceMinor: d.priceMinor, photo: d.photo } : null };
          }),
      })),
    };
    return reply.header('cache-control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=60').send(body);
  });
}
