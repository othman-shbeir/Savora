import { schema, type Db } from '@savora/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth/session';
import { locationLimit, monthlyCents, PLAN_ORDER, PLANS, pausedLocations, rank } from '@savora/shared';
import { membership } from '../lib/access';
import { syncSubscription } from '../lib/billing';
import { slugify, uniqueSlug } from '../lib/slug';

/** Everything the workspace shell needs: the user and each organization with its brands and locations. */
export async function loadWorkspace(db: Db, userId: string) {
  const orgs = await db
    .select({ id: schema.organizations.id, nameEn: schema.organizations.nameEn, nameAr: schema.organizations.nameAr, plan: schema.organizations.plan, role: schema.memberships.role })
    .from(schema.memberships)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.memberships.organizationId))
    .where(eq(schema.memberships.userId, userId))
    .orderBy(schema.organizations.createdAt);
  if (!orgs.length) return [];
  const ids = orgs.map((o) => o.id);
  const brands = await db.select().from(schema.brands).where(inArray(schema.brands.organizationId, ids)).orderBy(schema.brands.createdAt);
  const locs = await db.select().from(schema.locations).where(inArray(schema.locations.organizationId, ids)).orderBy(schema.locations.createdAt);
  return orgs.map((o) => {
    const paused = pausedLocations(locs.filter((l) => l.organizationId === o.id), o.plan);
    return {
    ...o,
    brands: brands
      .filter((b) => b.organizationId === o.id)
      .map((b) => ({
        id: b.id,
        nameEn: b.nameEn,
        nameAr: b.nameAr,
        taglineEn: b.taglineEn,
        taglineAr: b.taglineAr,
        locations: locs
          .filter((l) => l.brandId === b.id)
          .map((l) => ({ id: l.id, nameEn: l.nameEn, nameAr: l.nameAr, slug: l.slug, status: l.status, currency: l.currency, paused: paused.has(l.id) })),
      })),
    };
  });
}

const CreateOrganization = z.object({
  businessName: z.string().trim().min(2).max(80),
  businessNameAr: z.string().trim().max(80).optional().transform((v) => v || null),
  locationName: z.string().trim().min(2).max(80),
  locationNameAr: z.string().trim().max(80).optional().transform((v) => v || null),
  currency: z.enum(['ILS', 'JOD', 'USD']).default('ILS'),
});

const AddLocation = z.object({
  nameEn: z.string().trim().min(2).max(80),
  nameAr: z.string().trim().max(80).nullish().transform((v) => v || null),
  brandId: z.string().uuid().optional(),
});

export function workspaceRoutes(app: FastifyInstance, db: Db, opts: { isStaff: (req: FastifyRequest) => boolean; clock: () => Date; ai: boolean }) {
  app.get('/me', { preHandler: requireUser }, async (req) => {
    const user = req.user!;
    // Plans move with time (a paid month ends, a grace period runs out); settle them on the way in.
    const memberOf = await db.select({ id: schema.memberships.organizationId }).from(schema.memberships).where(eq(schema.memberships.userId, user.id));
    for (const m of memberOf) await syncSubscription(db, m.id, opts.clock());
    return { user: { ...user, staff: opts.isStaff(req) }, organizations: await loadWorkspace(db, user.id), features: { ai: opts.ai } };
  });

  // Another branch. Each plan has a location limit; past it the answer says which plan fits.
  app.post('/organizations/:orgId/locations', { preHandler: requireUser }, async (req, reply) => {
    const m = await membership(db, req, reply, (req.params as { orgId: string }).orgId, ['owner', 'admin']);
    if (!m) return;
    const body = AddLocation.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid', issues: body.error.issues.map((i) => i.path.join('.')) });
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, m.organizationId)).limit(1);
    const existing = await db.select({ id: schema.locations.id, currency: schema.locations.currency, timezone: schema.locations.timezone }).from(schema.locations).where(eq(schema.locations.organizationId, m.organizationId));
    if (existing.length >= locationLimit(org!.plan)) {
      const fits = PLAN_ORDER.find((p) => rank(p) > rank(org!.plan) && PLANS[p].maxLocations > existing.length) ?? null;
      return reply.code(402).send({ error: 'upgrade_required', feature: 'locations', plan: fits, max: PLANS[org!.plan].maxLocations });
    }
    const brands = await db.select().from(schema.brands).where(eq(schema.brands.organizationId, m.organizationId));
    const brand = brands.find((b) => b.id === body.data.brandId) ?? brands[0];
    if (!brand) return reply.code(400).send({ error: 'invalid', issues: ['brandId'] });
    const slug = await uniqueSlug(slugify(`${brand.nameEn} ${body.data.nameEn}`), async (s) => {
      const [hit] = await db.select({ id: schema.locations.id }).from(schema.locations).where(sql`lower(${schema.locations.slug}) = ${s}`).limit(1);
      return Boolean(hit);
    });
    // New branches start with the first branch's currency and time zone.
    const [loc] = await db
      .insert(schema.locations)
      .values({ organizationId: m.organizationId, brandId: brand.id, nameEn: body.data.nameEn, nameAr: body.data.nameAr, slug, currency: existing[0]?.currency ?? 'ILS', timezone: existing[0]?.timezone ?? 'Asia/Hebron' })
      .returning();
    return reply.code(201).send({ id: loc!.id, slug, monthlyCents: monthlyCents(org!.plan, existing.length + 1) });
  });

  // Onboarding: a new owner names their business and first location in one step.
  app.post('/organizations', { preHandler: requireUser }, async (req, reply) => {
    const body = CreateOrganization.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid', issues: body.error.issues.map((i) => i.path.join('.')) });
    const b = body.data;
    const result = await db.transaction(async (tx) => {
      const [org] = await tx.insert(schema.organizations).values({ nameEn: b.businessName, nameAr: b.businessNameAr }).returning();
      await tx.insert(schema.memberships).values({ organizationId: org!.id, userId: req.user!.id, role: 'owner' });
      const [brand] = await tx.insert(schema.brands).values({ organizationId: org!.id, nameEn: b.businessName, nameAr: b.businessNameAr }).returning();
      const slug = await uniqueSlug(slugify(b.businessName), async (s) => {
        const [hit] = await tx.select({ id: schema.locations.id }).from(schema.locations).where(sql`lower(${schema.locations.slug}) = ${s}`).limit(1);
        return Boolean(hit);
      });
      const [loc] = await tx
        .insert(schema.locations)
        .values({ organizationId: org!.id, brandId: brand!.id, nameEn: b.locationName, nameAr: b.locationNameAr, slug, currency: b.currency })
        .returning();
      return { organizationId: org!.id, locationId: loc!.id, slug };
    });
    return reply.code(201).send(result);
  });

  // Overview numbers for one organization.
  app.get('/organizations/:orgId/overview', { preHandler: requireUser }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    if (!(await membership(db, req, reply, orgId))) return;
    const [org] = (await loadWorkspace(db, req.user!.id)).filter((o) => o.id === orgId);
    const locations = org!.brands.flatMap((b) => b.locations);
    // Items guests can order right now in each location's draft.
    const counts = await db
      .select({ locationId: schema.menuItems.locationId, n: sql<number>`count(*)::int` })
      .from(schema.menuItems)
      .innerJoin(schema.locations, eq(schema.locations.id, schema.menuItems.locationId))
      .where(and(eq(schema.locations.organizationId, orgId), eq(schema.menuItems.available, true)))
      .groupBy(schema.menuItems.locationId);
    const itemsByLocation = Object.fromEntries(locations.map((l) => [l.id, counts.find((c) => c.locationId === l.id)?.n ?? 0]));
    const scans = await db
      .select({ locationId: schema.scanHourly.locationId, n: sql<number>`sum(${schema.scanHourly.scans})::int` })
      .from(schema.scanHourly)
      .innerJoin(schema.locations, eq(schema.locations.id, schema.scanHourly.locationId))
      .where(eq(schema.locations.organizationId, orgId))
      .groupBy(schema.scanHourly.locationId);
    const scansByLocation = Object.fromEntries(locations.map((l) => [l.id, scans.find((c) => c.locationId === l.id)?.n ?? 0]));
    return {
      organization: org,
      itemsByLocation,
      scansByLocation,
      stats: {
        locations: locations.length,
        live: locations.filter((l) => l.status === 'live').length,
        menuItems: Object.values(itemsByLocation).reduce((a, b) => a + b, 0),
        totalScans: Object.values(scansByLocation).reduce((a, b) => a + b, 0),
      },
    };
  });
}
