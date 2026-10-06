import { schema, type Db } from '@savora/db';
import { CategoryInput, ImportInput, ItemInput, menuHealth, photoOf, sameSnapshot, snapshotOf, type MenuCategory, type MenuDraft } from '@savora/shared';
import { and, asc, desc, eq, gt, lt, max, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth/session';
import { categoryAccess, itemAccess, locationAccess, membership } from '../lib/access';
import { locationPaused } from '../lib/billing';
import { MAX_UPLOAD_BYTES, MEDIA_SIZES, NotAnImage, processImage, type MediaSize, type MediaStore } from '../lib/media';

type Location = typeof schema.locations.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const Move = z.object({ direction: z.enum(['up', 'down']) });
const Publish = z.object({ note: z.string().trim().max(140).nullish().transform((v) => v || null) });
const invalid = (reply: FastifyReply, error: z.ZodError) => reply.code(400).send({ error: 'invalid', issues: error.issues.map((i) => i.path.join('.') || i.message) });

/** The draft as the editor sees it: every category and item, in order, with photos resolved. */
export async function loadCategories(db: Db | Tx, locationId: string): Promise<MenuCategory[]> {
  const cats = await db.select().from(schema.menuCategories).where(eq(schema.menuCategories.locationId, locationId)).orderBy(asc(schema.menuCategories.position));
  const items = await db.select().from(schema.menuItems).where(eq(schema.menuItems.locationId, locationId)).orderBy(asc(schema.menuItems.position));
  return cats.map((c) => ({
    id: c.id,
    nameEn: c.nameEn,
    nameAr: c.nameAr,
    items: items
      .filter((i) => i.categoryId === c.id)
      .map((i) => ({
        id: i.id,
        categoryId: i.categoryId,
        nameEn: i.nameEn,
        nameAr: i.nameAr,
        descriptionEn: i.descriptionEn,
        descriptionAr: i.descriptionAr,
        priceMinor: i.priceMinor,
        available: i.available,
        photo: photoOf(i.photoId),
      })),
  }));
}

async function latestVersion(db: Db | Tx, locationId: string) {
  const [v] = await db.select().from(schema.menuVersions).where(eq(schema.menuVersions.locationId, locationId)).orderBy(desc(schema.menuVersions.version)).limit(1);
  return v ?? null;
}

async function loadDraft(db: Db, loc: Location): Promise<MenuDraft> {
  const categories = await loadCategories(db, loc.id);
  const latest = await latestVersion(db, loc.id);
  const snapshot = snapshotOf(categories, loc.currency);
  return {
    location: { id: loc.id, organizationId: loc.organizationId, nameEn: loc.nameEn, nameAr: loc.nameAr, slug: loc.slug, status: loc.status, currency: loc.currency },
    categories,
    published: latest && { version: latest.version, note: latest.note, publishedAt: latest.publishedAt.toISOString(), itemCount: latest.itemCount },
    // Guests see the latest version; anything that would change it counts as unpublished work.
    hasChanges: latest ? !sameSnapshot(latest.content, snapshot) : snapshot.categories.length > 0,
    health: menuHealth(categories),
  };
}

const nextPosition = async (tx: Db | Tx, table: typeof schema.menuCategories | typeof schema.menuItems, where: ReturnType<typeof eq>) => {
  const [row] = await tx.select({ p: max(table.position) }).from(table).where(where);
  return (row?.p ?? -1) + 1;
};

/** A photo may only be attached by members of the organization that uploaded it. */
async function photoAllowed(db: Db, photoId: string | null, organizationId: string) {
  if (!photoId) return true;
  const [m] = await db.select({ id: schema.media.id }).from(schema.media).where(and(eq(schema.media.id, photoId), eq(schema.media.organizationId, organizationId))).limit(1);
  return Boolean(m);
}

export function menuRoutes(app: FastifyInstance, db: Db, store: MediaStore) {
  const auth = { preHandler: requireUser };

  app.get('/locations/:locationId/menu', auth, async (req, reply) => {
    const loc = await locationAccess(db, req, reply, (req.params as { locationId: string }).locationId);
    if (!loc) return;
    return loadDraft(db, loc);
  });

  // ---------- Categories ----------

  app.post('/locations/:locationId/categories', auth, async (req, reply) => {
    const loc = await locationAccess(db, req, reply, (req.params as { locationId: string }).locationId);
    if (!loc) return;
    const body = CategoryInput.safeParse(req.body);
    if (!body.success) return invalid(reply, body.error);
    const position = await nextPosition(db, schema.menuCategories, eq(schema.menuCategories.locationId, loc.id));
    const [row] = await db.insert(schema.menuCategories).values({ locationId: loc.id, ...body.data, position }).returning();
    return reply.code(201).send({ id: row!.id });
  });

  app.patch('/categories/:id', auth, async (req, reply) => {
    const hit = await categoryAccess(db, req, reply, (req.params as { id: string }).id);
    if (!hit) return;
    const body = CategoryInput.safeParse(req.body);
    if (!body.success) return invalid(reply, body.error);
    await db.update(schema.menuCategories).set(body.data).where(eq(schema.menuCategories.id, hit.category.id));
    return { ok: true };
  });

  // Removes the category and its items. The editor asks first and says how many items go with it.
  app.delete('/categories/:id', auth, async (req, reply) => {
    const hit = await categoryAccess(db, req, reply, (req.params as { id: string }).id);
    if (!hit) return;
    await db.delete(schema.menuCategories).where(eq(schema.menuCategories.id, hit.category.id));
    return { ok: true };
  });

  app.post('/categories/:id/move', auth, async (req, reply) => {
    const hit = await categoryAccess(db, req, reply, (req.params as { id: string }).id);
    if (!hit) return;
    const body = Move.safeParse(req.body);
    if (!body.success) return invalid(reply, body.error);
    const c = schema.menuCategories;
    const up = body.data.direction === 'up';
    await db.transaction(async (tx) => {
      const [other] = await tx
        .select()
        .from(c)
        .where(and(eq(c.locationId, hit.category.locationId), up ? lt(c.position, hit.category.position) : gt(c.position, hit.category.position)))
        .orderBy(up ? desc(c.position) : asc(c.position))
        .limit(1);
      if (!other) return;
      await tx.update(c).set({ position: other.position }).where(eq(c.id, hit.category.id));
      await tx.update(c).set({ position: hit.category.position }).where(eq(c.id, other.id));
    });
    return { ok: true };
  });

  // ---------- Items ----------

  app.post('/locations/:locationId/items', auth, async (req, reply) => {
    const loc = await locationAccess(db, req, reply, (req.params as { locationId: string }).locationId);
    if (!loc) return;
    const body = ItemInput.safeParse(req.body);
    if (!body.success) return invalid(reply, body.error);
    const [cat] = await db.select().from(schema.menuCategories).where(and(eq(schema.menuCategories.id, body.data.categoryId), eq(schema.menuCategories.locationId, loc.id))).limit(1);
    if (!cat) return reply.code(400).send({ error: 'invalid', issues: ['categoryId'] });
    if (!(await photoAllowed(db, body.data.photoId, loc.organizationId))) return reply.code(400).send({ error: 'invalid', issues: ['photoId'] });
    const position = await nextPosition(db, schema.menuItems, eq(schema.menuItems.categoryId, cat.id));
    const [row] = await db.insert(schema.menuItems).values({ ...body.data, locationId: loc.id, position }).returning();
    return reply.code(201).send({ id: row!.id });
  });

  // Partial updates: the availability switch sends one field, the item dialog sends them all.
  app.patch('/items/:id', auth, async (req, reply) => {
    const hit = await itemAccess(db, req, reply, (req.params as { id: string }).id);
    if (!hit) return;
    const { item, location } = hit;
    const merged = ItemInput.safeParse({ ...item, ...(req.body as object) });
    if (!merged.success) return invalid(reply, merged.error);
    const next = merged.data;
    let position = item.position;
    if (next.categoryId !== item.categoryId) {
      const [cat] = await db.select().from(schema.menuCategories).where(and(eq(schema.menuCategories.id, next.categoryId), eq(schema.menuCategories.locationId, location.id))).limit(1);
      if (!cat) return reply.code(400).send({ error: 'invalid', issues: ['categoryId'] });
      position = await nextPosition(db, schema.menuItems, eq(schema.menuItems.categoryId, cat.id));
    }
    if (next.photoId !== item.photoId && !(await photoAllowed(db, next.photoId, location.organizationId))) return reply.code(400).send({ error: 'invalid', issues: ['photoId'] });
    await db.update(schema.menuItems).set({ ...next, position, updatedAt: new Date() }).where(eq(schema.menuItems.id, item.id));
    return { ok: true };
  });

  app.delete('/items/:id', auth, async (req, reply) => {
    const hit = await itemAccess(db, req, reply, (req.params as { id: string }).id);
    if (!hit) return;
    await db.delete(schema.menuItems).where(eq(schema.menuItems.id, hit.item.id));
    return { ok: true };
  });

  app.post('/items/:id/move', auth, async (req, reply) => {
    const hit = await itemAccess(db, req, reply, (req.params as { id: string }).id);
    if (!hit) return;
    const body = Move.safeParse(req.body);
    if (!body.success) return invalid(reply, body.error);
    const t = schema.menuItems;
    const { item } = hit;
    const up = body.data.direction === 'up';
    await db.transaction(async (tx) => {
      const [other] = await tx
        .select()
        .from(t)
        .where(and(eq(t.categoryId, item.categoryId), up ? lt(t.position, item.position) : gt(t.position, item.position)))
        .orderBy(up ? desc(t.position) : asc(t.position))
        .limit(1);
      if (!other) return;
      await tx.update(t).set({ position: other.position }).where(eq(t.id, item.id));
      await tx.update(t).set({ position: item.position }).where(eq(t.id, other.id));
    });
    return { ok: true };
  });

  // "Paste your menu": adds reviewed categories and items to the draft. Items join an existing
  // category with the same name instead of creating a duplicate.
  app.post('/locations/:locationId/import', auth, async (req, reply) => {
    const loc = await locationAccess(db, req, reply, (req.params as { locationId: string }).locationId);
    if (!loc) return;
    const body = ImportInput.safeParse(req.body);
    if (!body.success) return invalid(reply, body.error);
    const key = (x: { nameEn: string | null; nameAr: string | null }) => (x.nameEn ?? '').toLowerCase().trim() || (x.nameAr ?? '').trim();
    const added = await db.transaction(async (tx) => {
      const existing = await tx.select().from(schema.menuCategories).where(eq(schema.menuCategories.locationId, loc.id));
      let catPos = await nextPosition(tx, schema.menuCategories, eq(schema.menuCategories.locationId, loc.id));
      let items = 0;
      for (const c of body.data.categories) {
        let cat = existing.find((e) => key(e) === key(c));
        if (!cat) {
          [cat] = await tx.insert(schema.menuCategories).values({ locationId: loc.id, nameEn: c.nameEn, nameAr: c.nameAr, position: catPos++ }).returning();
          existing.push(cat!);
        }
        let pos = await nextPosition(tx, schema.menuItems, eq(schema.menuItems.categoryId, cat!.id));
        if (c.items.length) {
          await tx.insert(schema.menuItems).values(c.items.map((i) => ({ ...i, locationId: loc.id, categoryId: cat!.id, position: pos++ })));
          items += c.items.length;
        }
      }
      return items;
    });
    return reply.code(201).send({ items: added });
  });

  // ---------- Publishing ----------

  app.post('/locations/:locationId/publish', auth, async (req, reply) => {
    const loc = await locationAccess(db, req, reply, (req.params as { locationId: string }).locationId);
    if (!loc) return;
    const body = Publish.safeParse(req.body ?? {});
    if (!body.success) return invalid(reply, body.error);
    if (await locationPaused(db, loc)) return reply.code(402).send({ error: 'upgrade_required', feature: 'locations' });
    const result = await db.transaction(async (tx) => {
      // One publish at a time per location, so two editors can't both claim the same version number.
      await tx.execute(sql`select id from ${schema.locations} where id = ${loc.id} for update`);
      const snapshot = snapshotOf(await loadCategories(tx, loc.id), loc.currency);
      const itemCount = snapshot.categories.reduce((n, c) => n + c.items.length, 0);
      if (!itemCount) return { error: 'empty_menu' as const };
      const latest = await latestVersion(tx, loc.id);
      if (latest && sameSnapshot(latest.content, snapshot)) return { error: 'no_changes' as const };
      const version = (latest?.version ?? 0) + 1;
      await tx.insert(schema.menuVersions).values({ locationId: loc.id, version, note: body.data.note, content: snapshot, itemCount, publishedBy: req.user!.id });
      if (loc.status !== 'live') await tx.update(schema.locations).set({ status: 'live' }).where(eq(schema.locations.id, loc.id));
      return { version, itemCount };
    });
    if ('error' in result) return reply.code(409).send(result);
    return reply.code(201).send(result);
  });

  // ---------- Photos ----------

  app.post('/organizations/:orgId/media', auth, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    if (!(await membership(db, req, reply, orgId))) return;
    let file;
    try {
      file = await req.file({ limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
    } catch {
      return reply.code(400).send({ error: 'invalid' });
    }
    if (!file) return reply.code(400).send({ error: 'invalid' });
    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch {
      return reply.code(413).send({ error: 'too_large' });
    }
    try {
      const img = await processImage(buffer);
      const [row] = await db.insert(schema.media).values({ organizationId: orgId, width: img.width, height: img.height, bytes: img.full.length }).returning();
      await store.put(row!.id, 'full', img.full);
      await store.put(row!.id, 'thumb', img.thumb);
      return reply.code(201).send(photoOf(row!.id));
    } catch (e) {
      if (e instanceof NotAnImage) return reply.code(415).send({ error: 'not_an_image' });
      throw e;
    }
  });

  // Public: guest menus show these. Ids are random UUIDs and files never change, so cache for a year.
  app.get('/media/:id/:file', async (req, reply) => {
    const { id, file } = req.params as { id: string; file: string };
    const size = file.replace(/\.webp$/, '') as MediaSize;
    if (!z.string().uuid().safeParse(id).success || !MEDIA_SIZES.includes(size)) return reply.code(404).send({ error: 'not_found' });
    const data = await store.get(id, size);
    if (!data) return reply.code(404).send({ error: 'not_found' });
    return reply.header('content-type', 'image/webp').header('cache-control', 'public, max-age=31536000, immutable').header('x-content-type-options', 'nosniff').send(data);
  });
}
