import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { schema, type Db } from '@savora/db';
import {
  can,
  canonicalJson,
  DEFAULT_POSE,
  MAX_SPACE_SPOTS,
  modelUrl,
  photoOf,
  SPACE_VIDEO,
  SpacePoseInput,
  SpaceSpotInput,
  type PlanId,
  type SpaceDraft,
  type SpaceSnapshot,
  type SpaceSpot,
} from '@savora/shared';
import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth/session';
import { locationAccess } from '../lib/access';
import { locationPaused } from '../lib/billing';
import { NotAnImage, processImage, type MediaStore } from '../lib/media';
import { MODEL_KEY, SpaceBusy, SpaceRejected, toSpz, type ModelStore, type SpaceBuilder } from '../lib/space';

type SpaceRow = typeof schema.tourSpaces.$inferSelect;
type Location = typeof schema.locations.$inferSelect;

/** A build is asked about at most this often, whoever is waiting for it. */
const CHECK_EVERY_MS = 10_000;

async function planOf(db: Db, organizationId: string): Promise<PlanId> {
  const [org] = await db.select({ plan: schema.organizations.plan }).from(schema.organizations).where(eq(schema.organizations.id, organizationId)).limit(1);
  return org?.plan ?? 'starter';
}

const snapshotOf = (row: SpaceRow): SpaceSnapshot | null =>
  row.status === 'ready' && row.modelKey ? { modelKey: row.modelKey, bytes: row.modelBytes ?? 0, pose: row.pose ?? DEFAULT_POSE, spots: row.spots, posterId: row.posterId } : null;

/** The owner's view of the 3D walk-through for a location. */
export async function loadSpace(db: Db, locationId: string, available: boolean): Promise<SpaceDraft> {
  const [row] = await db.select().from(schema.tourSpaces).where(eq(schema.tourSpaces.locationId, locationId)).limit(1);
  if (!row) return { available, status: null, error: null, startedAt: null, model: null, pose: DEFAULT_POSE, spots: [], poster: null, published: null, hasChanges: false };
  const draft = snapshotOf(row);
  return {
    available,
    status: row.status,
    error: row.error,
    startedAt: row.startedAt.toISOString(),
    model: row.status === 'ready' && row.modelKey ? { url: modelUrl(row.modelKey), bytes: row.modelBytes ?? 0 } : null,
    pose: row.pose ?? DEFAULT_POSE,
    spots: row.spots,
    poster: photoOf(row.posterId),
    published: row.published && row.publishedAt ? { at: row.publishedAt.toISOString() } : null,
    hasChanges: Boolean(draft) && (!row.published || canonicalJson(row.published) !== canonicalJson(draft)),
  };
}

/** Removes model files that neither the draft nor the published walk-through uses any more. */
async function dropUnused(models: ModelStore, keys: Array<string | null | undefined>, row: Pick<SpaceRow, 'modelKey' | 'published'> | null) {
  const keep = new Set([row?.modelKey, row?.published?.modelKey]);
  for (const key of new Set(keys)) if (key && !keep.has(key)) await models.remove(key);
}

/**
 * Moves builds along: asks the service about each waiting one and, when it's done, downloads the
 * model, compresses it to .spz and stores it. Runs on a timer and when an owner is watching.
 */
export async function advanceSpaces(db: Db, builder: SpaceBuilder | null, models: ModelStore, log: FastifyBaseLogger, only?: string) {
  if (!builder) return;
  const due = new Date(Date.now() - CHECK_EVERY_MS);
  const waiting = await db
    .select()
    .from(schema.tourSpaces)
    .where(and(inArray(schema.tourSpaces.status, ['queued', 'processing']), eq(schema.tourSpaces.provider, builder.name), or(isNull(schema.tourSpaces.checkedAt), lt(schema.tourSpaces.checkedAt, due)), only ? eq(schema.tourSpaces.locationId, only) : undefined));
  for (const row of waiting) {
    if (busy.has(row.locationId)) continue;
    busy.add(row.locationId);
    try {
      await advanceOne(db, builder, models, row);
    } catch (e) {
      log.error({ err: e, locationId: row.locationId }, 'space build check failed');
    } finally {
      busy.delete(row.locationId);
    }
  }
}
/** Builds being downloaded or compressed right now, so a second check doesn't repeat the work. */
const busy = new Set<string>();

async function advanceOne(db: Db, builder: SpaceBuilder, models: ModelStore, row: SpaceRow) {
  const same = and(eq(schema.tourSpaces.locationId, row.locationId), eq(schema.tourSpaces.jobId, row.jobId!));
  await db.update(schema.tourSpaces).set({ checkedAt: new Date() }).where(same);
  let state;
  try {
    ({ state } = await builder.check(row.jobId!));
  } catch (e) {
    if (e instanceof SpaceBusy) return;
    throw e;
  }
  if (state === 'queued' || state === 'processing') {
    if (state !== row.status) await db.update(schema.tourSpaces).set({ status: state }).where(same);
    return;
  }
  if (state === 'failed' || state === 'expired') {
    await db.update(schema.tourSpaces).set({ status: 'failed', error: state }).where(same);
    return;
  }
  let spz: Uint8Array;
  try {
    spz = await toSpz(await builder.fetchModel(row.jobId!));
  } catch (e) {
    if (e instanceof SpaceBusy) return;
    await db.update(schema.tourSpaces).set({ status: 'failed', error: e instanceof SpaceRejected ? 'failed' : 'convert_failed' }).where(same);
    return;
  }
  const key = `${randomUUID()}.spz`;
  await models.put(key, spz);
  // Only if this is still the build the owner is waiting for; a newer upload wins.
  const [done] = await db.update(schema.tourSpaces).set({ status: 'ready', error: null, modelKey: key, modelBytes: spz.length }).where(same).returning();
  if (!done) await models.remove(key);
}

/** The first bytes of an MP4/MOV ("ftyp" box) or WebM/Matroska file. */
async function looksLikeVideo(file: string) {
  const fh = await open(file, 'r');
  try {
    const head = Buffer.alloc(12);
    await fh.read(head, 0, 12, 0);
    return head.subarray(4, 8).toString('latin1') === 'ftyp' || head.readUInt32BE(0) === 0x1a45dfa3;
  } finally {
    await fh.close();
  }
}

export function spaceRoutes(app: FastifyInstance, db: Db, deps: { store: MediaStore; models: ModelStore; builder: SpaceBuilder | null }) {
  const { store, models, builder } = deps;
  const auth = { preHandler: requireUser };
  const available = Boolean(builder);
  // Every build costs real money at the scanning service.
  const buildLimit = { rateLimit: { max: 6, timeWindow: '1 day', keyGenerator: (req: { user?: { id: string } | null; ip: string }) => req.user?.id ?? req.ip } };

  /** The location, if the caller may work on it and the plan includes the Virtual trial. */
  async function spaceLocation(req: FastifyRequest, reply: FastifyReply, roles?: Array<'owner' | 'admin' | 'editor'>) {
    const loc = await locationAccess(db, req, reply, (req.params as { locationId: string }).locationId, roles);
    if (!loc) return null;
    if (!can(await planOf(db, loc.organizationId), 'virtualTrial')) {
      reply.code(402).send({ error: 'upgrade_required', feature: 'virtualTrial', plan: 'growth' });
      return null;
    }
    return loc;
  }
  async function rowOf(loc: Location) {
    const [row] = await db.select().from(schema.tourSpaces).where(eq(schema.tourSpaces.locationId, loc.id)).limit(1);
    return row ?? null;
  }
  const draft = (loc: Location) => loadSpace(db, loc.id, available);
  const invalid = (reply: FastifyReply, error: z.ZodError) => reply.code(400).send({ error: 'invalid', issues: error.issues.map((i) => i.path.join('.') || i.message) });

  // ---------- Building ----------

  app.post('/locations/:locationId/tour/space', { ...auth, config: buildLimit }, async (req, reply) => {
    const loc = await spaceLocation(req, reply, ['owner', 'admin']);
    if (!loc) return;
    if (!builder) return reply.code(503).send({ error: 'space_unavailable' });
    const current = await rowOf(loc);
    if (current && (current.status === 'queued' || current.status === 'processing')) return reply.code(409).send({ error: 'space_building' });

    const dir = await mkdtemp(path.join(tmpdir(), 'savora-video-'));
    try {
      const part = await req.file({ limits: { fileSize: SPACE_VIDEO.maxBytes, files: 1 } }).catch(() => null);
      if (!part) return reply.code(400).send({ error: 'invalid' });
      const file = path.join(dir, 'walkthrough');
      await pipeline(part.file, createWriteStream(file));
      if (part.file.truncated) return reply.code(413).send({ error: 'too_large' });
      if (!(await looksLikeVideo(file))) return reply.code(415).send({ error: 'not_a_video' });

      let jobId: string;
      try {
        jobId = await builder.start({ path: file, filename: part.filename || 'walkthrough.mp4', mediaType: part.mimetype.startsWith('video/') ? part.mimetype : 'video/mp4' });
      } catch (e) {
        if (e instanceof SpaceRejected) return reply.code(422).send({ error: 'space_rejected' });
        if (e instanceof SpaceBusy) return reply.code(503).send({ error: 'space_busy' });
        throw e;
      }
      // A new scan has its own coordinates, so the old levelling and tags don't carry over. The
      // published walk-through stays live until the new one is published.
      const fresh = { status: 'queued' as const, provider: builder.name, jobId, error: null, modelKey: null, modelBytes: null, pose: null, spots: [], posterId: null, startedAt: new Date(), checkedAt: null };
      await db.insert(schema.tourSpaces).values({ locationId: loc.id, ...fresh }).onConflictDoUpdate({ target: schema.tourSpaces.locationId, set: fresh });
      await dropUnused(models, [current?.modelKey], await rowOf(loc));
      return reply.code(201).send(await draft(loc));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // Polled by the studio while a build runs; asking also moves the build along.
  app.get('/locations/:locationId/tour/space', auth, async (req, reply) => {
    const loc = await spaceLocation(req, reply);
    if (!loc) return;
    await advanceSpaces(db, builder, models, req.log, loc.id);
    return draft(loc);
  });

  // Throws the draft scan away (after a bad recording, say). The published one is untouched.
  app.delete('/locations/:locationId/tour/space', auth, async (req, reply) => {
    const loc = await spaceLocation(req, reply, ['owner', 'admin']);
    if (!loc) return;
    const row = await rowOf(loc);
    if (!row) return draft(loc);
    if (row.published) {
      await db.update(schema.tourSpaces).set({ status: 'ready', error: null, jobId: null, modelKey: row.published.modelKey, modelBytes: row.published.bytes, pose: row.published.pose, spots: row.published.spots, posterId: row.published.posterId }).where(eq(schema.tourSpaces.locationId, loc.id));
    } else {
      await db.delete(schema.tourSpaces).where(eq(schema.tourSpaces.locationId, loc.id));
    }
    await dropUnused(models, [row.modelKey], await rowOf(loc));
    return draft(loc);
  });

  // ---------- Levelling, start view, poster ----------

  /** The draft once its model is ready, or null after replying. */
  async function readyRow(loc: Location, reply: FastifyReply) {
    const row = await rowOf(loc);
    if (row?.status === 'ready' && row.modelKey) return row;
    reply.code(409).send({ error: 'space_not_ready' });
    return null;
  }

  app.put('/locations/:locationId/tour/space/pose', auth, async (req, reply) => {
    const loc = await spaceLocation(req, reply);
    if (!loc) return;
    const body = SpacePoseInput.safeParse(req.body);
    if (!body.success) return invalid(reply, body.error);
    if (!(await readyRow(loc, reply))) return;
    await db.update(schema.tourSpaces).set({ pose: body.data }).where(eq(schema.tourSpaces.locationId, loc.id));
    return draft(loc);
  });

  // A still from the start view, taken in the owner's browser: the menu card and loading picture.
  app.put('/locations/:locationId/tour/space/poster', auth, async (req, reply) => {
    const loc = await spaceLocation(req, reply);
    if (!loc) return;
    if (!(await readyRow(loc, reply))) return;
    const part = await req.file().catch(() => null);
    if (!part) return reply.code(400).send({ error: 'invalid' });
    let img;
    try {
      img = await processImage(await part.toBuffer(), 1600);
    } catch (e) {
      if (e instanceof NotAnImage) return reply.code(415).send({ error: 'not_an_image' });
      if ((e as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') return reply.code(413).send({ error: 'too_large' });
      throw e;
    }
    const [media] = await db.insert(schema.media).values({ organizationId: loc.organizationId, width: img.width, height: img.height, bytes: img.full.length }).returning();
    await store.put(media!.id, 'full', img.full);
    await store.put(media!.id, 'thumb', img.thumb);
    await db.update(schema.tourSpaces).set({ posterId: media!.id }).where(eq(schema.tourSpaces.locationId, loc.id));
    return draft(loc);
  });

  // ---------- Tags ----------

  async function dishOk(loc: Location, s: z.infer<typeof SpaceSpotInput>) {
    if (s.kind !== 'dish') return true;
    const [item] = await db.select({ id: schema.menuItems.id }).from(schema.menuItems).where(and(eq(schema.menuItems.id, s.itemId!), eq(schema.menuItems.locationId, loc.id))).limit(1);
    return Boolean(item);
  }
  const spotOf = (id: string, s: z.infer<typeof SpaceSpotInput>): SpaceSpot => ({ id, ...s, itemId: s.kind === 'dish' ? s.itemId : null });

  app.post('/locations/:locationId/tour/space/spots', auth, async (req, reply) => {
    const loc = await spaceLocation(req, reply);
    if (!loc) return;
    const body = SpaceSpotInput.safeParse(req.body);
    if (!body.success) return invalid(reply, body.error);
    const row = await readyRow(loc, reply);
    if (!row) return;
    if (row.spots.length >= MAX_SPACE_SPOTS) return reply.code(409).send({ error: 'too_many_spots', max: MAX_SPACE_SPOTS });
    if (!(await dishOk(loc, body.data))) return reply.code(400).send({ error: 'invalid', issues: ['itemId'] });
    await db.update(schema.tourSpaces).set({ spots: [...row.spots, spotOf(randomUUID(), body.data)] }).where(eq(schema.tourSpaces.locationId, loc.id));
    return reply.code(201).send(await draft(loc));
  });

  app.patch('/locations/:locationId/tour/space/spots/:spotId', auth, async (req, reply) => {
    const loc = await spaceLocation(req, reply);
    if (!loc) return;
    const { spotId } = req.params as { spotId: string };
    const body = SpaceSpotInput.safeParse(req.body);
    if (!body.success) return invalid(reply, body.error);
    const row = await readyRow(loc, reply);
    if (!row) return;
    if (!row.spots.some((s) => s.id === spotId)) return reply.code(404).send({ error: 'not_found' });
    if (!(await dishOk(loc, body.data))) return reply.code(400).send({ error: 'invalid', issues: ['itemId'] });
    await db.update(schema.tourSpaces).set({ spots: row.spots.map((s) => (s.id === spotId ? spotOf(spotId, body.data) : s)) }).where(eq(schema.tourSpaces.locationId, loc.id));
    return draft(loc);
  });

  app.delete('/locations/:locationId/tour/space/spots/:spotId', auth, async (req, reply) => {
    const loc = await spaceLocation(req, reply);
    if (!loc) return;
    const { spotId } = req.params as { spotId: string };
    const row = await readyRow(loc, reply);
    if (!row) return;
    if (!row.spots.some((s) => s.id === spotId)) return reply.code(404).send({ error: 'not_found' });
    await db.update(schema.tourSpaces).set({ spots: row.spots.filter((s) => s.id !== spotId) }).where(eq(schema.tourSpaces.locationId, loc.id));
    return draft(loc);
  });

  // ---------- Publishing ----------

  app.post('/locations/:locationId/tour/space/publish', auth, async (req, reply) => {
    const loc = await spaceLocation(req, reply, ['owner', 'admin']);
    if (!loc) return;
    if (await locationPaused(db, loc)) return reply.code(402).send({ error: 'upgrade_required', feature: 'locations' });
    const row = await readyRow(loc, reply);
    if (!row) return;
    const [version] = await db.select({ id: schema.menuVersions.id }).from(schema.menuVersions).where(eq(schema.menuVersions.locationId, loc.id)).limit(1);
    if (loc.status !== 'live' || !version) return reply.code(409).send({ error: 'not_ready', missing: ['menu'] });
    const snapshot = snapshotOf(row)!;
    await db.update(schema.tourSpaces).set({ published: snapshot, publishedAt: new Date() }).where(eq(schema.tourSpaces.locationId, loc.id));
    await dropUnused(models, [row.published?.modelKey], await rowOf(loc));
    return reply.code(201).send(await draft(loc));
  });

  app.delete('/locations/:locationId/tour/space/publish', auth, async (req, reply) => {
    const loc = await spaceLocation(req, reply, ['owner', 'admin']);
    if (!loc) return;
    const row = await rowOf(loc);
    await db.update(schema.tourSpaces).set({ published: null, publishedAt: null }).where(eq(schema.tourSpaces.locationId, loc.id));
    await dropUnused(models, [row?.published?.modelKey], await rowOf(loc));
    return draft(loc);
  });

  // ---------- The model file ----------

  // Keys are random and never reused, so the file can be cached for good.
  app.get('/spaces/:key', async (req, reply) => {
    const { key } = req.params as { key: string };
    if (!MODEL_KEY.test(key)) return reply.code(404).send({ error: 'not_found' });
    const file = await models.open(key);
    if (!file) return reply.code(404).send({ error: 'not_found' });
    return reply
      .header('content-type', 'application/octet-stream')
      .header('content-length', file.bytes)
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(file.stream);
  });
}
