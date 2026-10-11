import { schema, type Db } from '@savora/db';
import {
  can,
  checkTheme,
  photoOf,
  CustomThemeInput,
  fixContrast,
  ImportInput,
  isDark,
  isHex,
  presetByRef,
  PRESETS,
  themeAllowed,
  type AssistantOption,
  type AssistantTurn,
  type ImportPayload,
  type PlanId,
  type Theme,
  type ThemesOverview,
} from '@savora/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import sharp from 'sharp';
import { z } from 'zod';
import { requireUser } from '../auth/session';
import { locationAccess, membership } from '../lib/access';
import { AiBusy, AiRefused, AiTooLong, type AiFile, type AiProvider } from '../lib/ai';
import type { MediaStore } from '../lib/media';

type Location = typeof schema.locations.$inferSelect;
type CustomRow = typeof schema.customThemes.$inferSelect;

const customTheme = (r: CustomRow): Theme => ({
  ref: `custom:${r.id}`,
  nameEn: r.nameEn,
  nameAr: r.nameAr ?? r.nameEn,
  descEn: 'Made with the Theme assistant',
  descAr: 'صُمّم مع مساعد المظاهر',
  tier: 'custom',
  colors: r.colors,
  font: r.font === 'serif' ? 'serif' : 'sans',
  boldPrices: r.boldPrices,
  tags: [isDark(r.colors) ? 'dark' : 'light'],
});

async function orgPlan(db: Db, organizationId: string): Promise<PlanId> {
  const [org] = await db.select({ plan: schema.organizations.plan }).from(schema.organizations).where(eq(schema.organizations.id, organizationId)).limit(1);
  return org?.plan ?? 'starter';
}

/** The theme a location shows. One the plan no longer covers falls back to Auto-match for guests;
 *  the choice itself is kept, so upgrading again restores it. */
export async function resolveTheme(db: Db, loc: Pick<Location, 'organizationId' | 'themeRef'>, plan?: PlanId): Promise<Theme> {
  const p = plan ?? (await orgPlan(db, loc.organizationId));
  let theme: Theme | undefined = presetByRef(loc.themeRef);
  if (!theme && loc.themeRef.startsWith('custom:')) {
    const id = loc.themeRef.slice(7);
    if (z.string().uuid().safeParse(id).success) {
      const [row] = await db.select().from(schema.customThemes).where(and(eq(schema.customThemes.id, id), eq(schema.customThemes.organizationId, loc.organizationId))).limit(1);
      theme = row ? customTheme(row) : undefined;
    }
  }
  return theme && themeAllowed(p, theme) ? theme : PRESETS[0]!;
}

const aiFailure = (reply: FastifyReply, e: unknown) => {
  if (e instanceof AiRefused) return reply.code(422).send({ error: 'ai_declined' });
  if (e instanceof AiTooLong) return reply.code(422).send({ error: 'too_long' });
  if (e instanceof AiBusy) return reply.code(503).send({ error: 'ai_busy' });
  throw e;
};

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Photos are shrunk to 2,000 px JPEG (plenty to read a menu, a fraction of the tokens); PDFs go
 *  as they are. Anything else is refused. */
async function prepare(data: Buffer): Promise<AiFile | null> {
  if (data.subarray(0, 5).toString() === '%PDF-') return { mediaType: 'application/pdf', data };
  try {
    const jpeg = await sharp(data, { limitInputPixels: 80_000_000 }).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    return { mediaType: 'image/jpeg', data: jpeg };
  } catch {
    return null;
  }
}

const cut = (s: string | null, n: number) => (s ? s.trim().slice(0, n) || null : null);

const Assistant = z.object({
  locationId: z.string().uuid(),
  locale: z.enum(['en', 'ar']).default('en'),
  turns: z
    .array(
      z.union([
        z.object({ role: z.literal('user'), text: z.string().trim().min(1).max(600), photoId: z.string().uuid().nullish() }),
        z.object({
          role: z.literal('assistant'),
          text: z.string().max(1200),
          options: z.array(z.object({ nameEn: z.string().max(60), nameAr: z.string().max(60), noteEn: z.string().max(300), noteAr: z.string().max(300), colors: z.record(z.string(), z.string()), font: z.enum(['sans', 'serif']), boldPrices: z.boolean() })).max(3),
        }),
      ]),
    )
    .min(1)
    .max(16),
});

export function themeRoutes(app: FastifyInstance, db: Db, store: MediaStore, ai: AiProvider | null) {
  const auth = { preHandler: requireUser };
  // Each AI call costs real money; keep a generous but firm ceiling per person.
  const aiLimit = { rateLimit: { max: 30, timeWindow: '1 hour', keyGenerator: (req: { user?: { id: string } | null; ip: string }) => req.user?.id ?? req.ip } };

  // ---------- Read a menu from photos or a PDF ----------

  app.post('/locations/:locationId/menu/read', { ...auth, config: aiLimit }, async (req, reply) => {
    const loc = await locationAccess(db, req, reply, (req.params as { locationId: string }).locationId);
    if (!loc) return;
    if (!can(await orgPlan(db, loc.organizationId), 'menuImport')) return reply.code(402).send({ error: 'upgrade_required', feature: 'menuImport', plan: 'growth' });
    if (!ai) return reply.code(503).send({ error: 'ai_unavailable' });

    const files: AiFile[] = [];
    try {
      for await (const part of req.files({ limits: { files: MAX_FILES, fileSize: MAX_FILE_BYTES } })) {
        const data = await part.toBuffer();
        const prepared = await prepare(data);
        if (!prepared) return reply.code(415).send({ error: 'not_a_menu_file' });
        files.push(prepared);
      }
    } catch {
      return reply.code(413).send({ error: 'too_large' });
    }
    if (!files.length) return reply.code(400).send({ error: 'invalid' });
    if (files.filter((f) => f.mediaType === 'application/pdf').length > 1) return reply.code(400).send({ error: 'one_pdf' });

    let read;
    try {
      read = await ai.readMenu({ files, currency: loc.currency });
    } catch (e) {
      return aiFailure(reply, e);
    }
    // Turn the reading into the same shape "Paste your menu" produces, so the owner reviews it in
    // the same dialog. Items the model couldn't name are dropped; missing prices become 0 so the
    // health check flags them.
    const categories: ImportPayload['categories'] = read.categories
      .map((c) => ({
        nameEn: cut(c.nameEn, 80),
        nameAr: cut(c.nameAr, 80),
        items: c.items
          .map((i) => ({
            nameEn: cut(i.nameEn, 80),
            nameAr: cut(i.nameAr, 80),
            descriptionEn: cut(i.descriptionEn, 240),
            descriptionAr: cut(i.descriptionAr, 240),
            priceMinor: i.price !== null && Number.isFinite(i.price) && i.price >= 0 ? Math.min(Math.round(i.price * 100), 10_000_000) : 0,
          }))
          .filter((i) => i.nameEn || i.nameAr)
          .slice(0, 200),
      }))
      .filter((c) => (c.nameEn || c.nameAr) && c.items.length)
      .slice(0, 40);
    const valid = ImportInput.safeParse({ categories });
    if (!valid.success || !categories.length) return reply.code(422).send({ error: 'nothing_found', notes: read.notes.slice(0, 3) });
    return {
      categories: valid.data.categories,
      notes: read.notes.slice(0, 3),
      // Prices are read as printed; say so when they look like another currency.
      currencyMismatch: read.currency !== null && read.currency !== loc.currency ? read.currency : null,
    };
  });

  // ---------- Themes ----------

  app.get('/locations/:locationId/themes', auth, async (req, reply) => {
    const loc = await locationAccess(db, req, reply, (req.params as { locationId: string }).locationId);
    if (!loc) return;
    const plan = await orgPlan(db, loc.organizationId);
    const custom = (await db.select().from(schema.customThemes).where(eq(schema.customThemes.organizationId, loc.organizationId)).orderBy(schema.customThemes.createdAt)).map(customTheme);
    const locations = await db.select({ id: schema.locations.id }).from(schema.locations).where(eq(schema.locations.organizationId, loc.organizationId));
    const [brand] = await db.select().from(schema.brands).where(eq(schema.brands.id, loc.brandId)).limit(1);
    const body: ThemesOverview = {
      plan,
      selectedRef: loc.themeRef,
      current: await resolveTheme(db, loc, plan),
      presets: PRESETS.map((t) => ({ ...t, allowed: themeAllowed(plan, t), contrast: checkTheme(t.colors) })),
      custom: custom.map((t) => ({ ...t, allowed: themeAllowed(plan, t), contrast: checkTheme(t.colors) })),
      brand: { nameEn: brand!.nameEn, nameAr: brand!.nameAr, taglineEn: brand!.taglineEn, taglineAr: brand!.taglineAr, logo: photoOf(brand!.logoPhotoId) },
      locations: locations.length,
      canShare: can(plan, 'sharedTheme'),
      canDesign: can(plan, 'themeAssistant'),
      aiAvailable: Boolean(ai),
    };
    return body;
  });

  app.put('/locations/:locationId/theme', auth, async (req, reply) => {
    const loc = await locationAccess(db, req, reply, (req.params as { locationId: string }).locationId, ['owner', 'admin']);
    if (!loc) return;
    const body = z.object({ ref: z.string().max(60), everywhere: z.boolean().default(false) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    const plan = await orgPlan(db, loc.organizationId);
    const ref = body.data.ref;
    let theme: Theme | undefined = presetByRef(ref);
    if (!theme && ref.startsWith('custom:') && z.string().uuid().safeParse(ref.slice(7)).success) {
      const [row] = await db.select().from(schema.customThemes).where(and(eq(schema.customThemes.id, ref.slice(7)), eq(schema.customThemes.organizationId, loc.organizationId))).limit(1);
      theme = row ? customTheme(row) : undefined;
    }
    if (!theme) return reply.code(400).send({ error: 'invalid', issues: ['ref'] });
    if (!themeAllowed(plan, theme)) return reply.code(402).send({ error: 'upgrade_required', feature: theme.tier === 'custom' ? 'themeAssistant' : 'themeGallery', plan: 'growth' });
    if (body.data.everywhere) {
      if (!can(plan, 'sharedTheme')) return reply.code(402).send({ error: 'upgrade_required', feature: 'sharedTheme', plan: 'multi_location' });
      await db.update(schema.locations).set({ themeRef: ref }).where(eq(schema.locations.organizationId, loc.organizationId));
    } else {
      await db.update(schema.locations).set({ themeRef: ref }).where(eq(schema.locations.id, loc.id));
    }
    return { ok: true, ref };
  });

  app.post('/organizations/:orgId/themes', auth, async (req, reply) => {
    const m = await membership(db, req, reply, (req.params as { orgId: string }).orgId, ['owner', 'admin']);
    if (!m) return;
    if (!can(await orgPlan(db, m.organizationId), 'themeAssistant')) return reply.code(402).send({ error: 'upgrade_required', feature: 'themeAssistant', plan: 'growth' });
    const body = CustomThemeInput.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid', issues: body.error.issues.map((i) => i.path.join('.')) });
    // Saved themes are always readable, whatever was sent.
    const colors = fixContrast(body.data.colors);
    const [row] = await db
      .insert(schema.customThemes)
      .values({ organizationId: m.organizationId, nameEn: body.data.nameEn, nameAr: body.data.nameAr, colors, font: body.data.font, boldPrices: body.data.boldPrices, createdBy: req.user!.id })
      .returning();
    return reply.code(201).send(customTheme(row!));
  });

  app.delete('/organizations/:orgId/themes/:id', auth, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const m = await membership(db, req, reply, orgId, ['owner', 'admin']);
    if (!m) return;
    if (!z.string().uuid().safeParse(id).success) return reply.code(404).send({ error: 'not_found' });
    const done = await db.transaction(async (tx) => {
      const [row] = await tx.delete(schema.customThemes).where(and(eq(schema.customThemes.id, id), eq(schema.customThemes.organizationId, m.organizationId))).returning();
      if (row) await tx.update(schema.locations).set({ themeRef: 'auto' }).where(and(eq(schema.locations.organizationId, m.organizationId), eq(schema.locations.themeRef, `custom:${id}`)));
      return Boolean(row);
    });
    return done ? { ok: true } : reply.code(404).send({ error: 'not_found' });
  });

  // The Theme assistant: the client keeps the conversation and sends it back each turn.
  app.post('/organizations/:orgId/themes/assistant', { ...auth, config: aiLimit }, async (req, reply) => {
    const m = await membership(db, req, reply, (req.params as { orgId: string }).orgId);
    if (!m) return;
    if (!can(await orgPlan(db, m.organizationId), 'themeAssistant')) return reply.code(402).send({ error: 'upgrade_required', feature: 'themeAssistant', plan: 'growth' });
    if (!ai) return reply.code(503).send({ error: 'ai_unavailable' });
    const body = Assistant.safeParse(req.body);
    if (!body.success || body.data.turns.at(-1)?.role !== 'user') return reply.code(400).send({ error: 'invalid' });

    const [loc] = await db.select().from(schema.locations).where(and(eq(schema.locations.id, body.data.locationId), eq(schema.locations.organizationId, m.organizationId))).limit(1);
    if (!loc) return reply.code(404).send({ error: 'not_found' });
    const [brand] = await db.select().from(schema.brands).where(eq(schema.brands.id, loc.brandId)).limit(1);
    const current = await resolveTheme(db, loc);

    // Photos come from the organization's own uploads.
    const turns = [];
    for (const t of body.data.turns) {
      if (t.role === 'user' && t.photoId) {
        const [owned] = await db.select({ id: schema.media.id }).from(schema.media).where(and(eq(schema.media.id, t.photoId), eq(schema.media.organizationId, m.organizationId))).limit(1);
        const data = owned ? await store.get(t.photoId, 'full') : null;
        turns.push({ ...t, photo: data ? ({ mediaType: 'image/webp', data } as AiFile) : null });
      } else turns.push(t as AssistantTurn);
    }

    let design;
    try {
      design = await ai.designThemes({ brand: { nameEn: brand!.nameEn, nameAr: brand!.nameAr, taglineEn: brand!.taglineEn, current: current.colors }, locale: body.data.locale, turns });
    } catch (e) {
      return aiFailure(reply, e);
    }
    // Whatever comes back is checked here: malformed colours are dropped and every palette is
    // nudged to AA before an owner can pick it.
    const options: AssistantOption[] = design.options
      .filter((o) => Object.values(o.colors).every(isHex))
      .slice(0, 3)
      .map((o) => {
        const colors = fixContrast(o.colors);
        const adjusted = (['ink', 'muted', 'primary'] as const).some((k) => colors[k].toUpperCase() !== o.colors[k].toUpperCase());
        return {
          nameEn: o.nameEn.slice(0, 40),
          nameAr: o.nameAr.slice(0, 40),
          noteEn: body.data.locale === 'en' ? o.note : '',
          noteAr: body.data.locale === 'ar' ? o.note : '',
          colors,
          font: o.font,
          boldPrices: o.boldPrices,
          contrast: checkTheme(colors),
          adjusted,
        };
      });
    if (!options.length) return reply.code(422).send({ error: 'ai_declined' });
    return { reply: design.reply, options };
  });
}
