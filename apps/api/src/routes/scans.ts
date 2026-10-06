import { createHmac } from 'node:crypto';
import { schema, type Db } from '@savora/db';
import { buildReport, can, isRange } from '@savora/shared';
import { and, eq, gt, gte, lt, min, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth/session';
import type { Env } from '../env';
import { locationAccess } from '../lib/access';
import { locationPaused } from '../lib/billing';

const Scan = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/i),
  source: z.enum(['qr', 'link']).default('link'),
  lang: z.enum(['en', 'ar']).default('en'),
});

/** Reloads, language switches and back-and-forth within this window count as one menu open. */
const SAME_VISIT_MS = 30 * 60 * 1000;
/** Raw events only exist to spot those repeats, so they are dropped soon after. */
export const EVENT_RETENTION_MS = 48 * 60 * 60 * 1000;
/** Link previews and crawlers rarely run the page's script, but some do. */
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|headlesschrome|lighthouse/i;

/** A visitor key that can't be reversed or carried across days: the secret and the date salt it,
 *  and nothing about the guest is stored except this hash. */
function visitorKey(secret: string, locationId: string, ip: string, userAgent: string, now: Date) {
  return createHmac('sha256', `${secret}|${now.toISOString().slice(0, 10)}`).update(`${locationId}|${ip}|${userAgent}`).digest('base64url');
}

const hourStart = (d: Date) => new Date(Math.floor(d.getTime() / 3_600_000) * 3_600_000);

/** Deletes raw scan events past their retention. Counts are unaffected. */
export async function purgeScanEvents(db: Db, now = new Date()) {
  await db.delete(schema.scanEvents).where(lt(schema.scanEvents.occurredAt, new Date(now.getTime() - EVENT_RETENTION_MS)));
}

export function scanRoutes(app: FastifyInstance, db: Db, env: Env, clock: () => Date = () => new Date()) {
  // Sent by the guest page once it has loaded in a real browser. Always answers 204, so it reveals
  // nothing about which links exist or whether the open was counted.
  app.post('/public/scan', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    reply.code(204);
    const body = Scan.safeParse(req.body);
    const userAgent = String(req.headers['user-agent'] ?? '');
    if (!body.success || !userAgent || BOT.test(userAgent)) return reply.send();

    const [loc] = await db
      .select({ id: schema.locations.id, organizationId: schema.locations.organizationId, status: schema.locations.status })
      .from(schema.locations)
      .where(sql`lower(${schema.locations.slug}) = ${body.data.slug.toLowerCase()}`)
      .limit(1);
    if (!loc || loc.status !== 'live' || (await locationPaused(db, loc))) return reply.send();

    // The owner's team checking their own menu shouldn't inflate the numbers.
    if (req.user) {
      const [member] = await db
        .select({ u: schema.memberships.userId })
        .from(schema.memberships)
        .where(and(eq(schema.memberships.organizationId, loc.organizationId), eq(schema.memberships.userId, req.user.id)))
        .limit(1);
      if (member) return reply.send();
    }

    const now = clock();
    const key = visitorKey(env.SESSION_SECRET, loc.id, req.ip, userAgent, now);
    await db.transaction(async (tx) => {
      const [recent] = await tx
        .select({ id: schema.scanEvents.id })
        .from(schema.scanEvents)
        .where(and(eq(schema.scanEvents.locationId, loc.id), eq(schema.scanEvents.visitorKey, key), gt(schema.scanEvents.occurredAt, new Date(now.getTime() - SAME_VISIT_MS))))
        .limit(1);
      if (recent) return;
      await tx.insert(schema.scanEvents).values({ locationId: loc.id, visitorKey: key, occurredAt: now });
      const qr = body.data.source === 'qr' ? 1 : 0;
      const ar = body.data.lang === 'ar' ? 1 : 0;
      await tx
        .insert(schema.scanHourly)
        .values({ locationId: loc.id, hour: hourStart(now), scans: 1, qr, ar })
        .onConflictDoUpdate({
          target: [schema.scanHourly.locationId, schema.scanHourly.hour],
          set: { scans: sql`${schema.scanHourly.scans} + 1`, qr: sql`${schema.scanHourly.qr} + ${qr}`, ar: sql`${schema.scanHourly.ar} + ${ar}` },
        });
    });
    return reply.send();
  });

  app.get('/locations/:locationId/analytics', { preHandler: requireUser }, async (req, reply) => {
    const loc = await locationAccess(db, req, reply, (req.params as { locationId: string }).locationId);
    if (!loc) return;
    const [org] = await db.select({ plan: schema.organizations.plan }).from(schema.organizations).where(eq(schema.organizations.id, loc.organizationId)).limit(1);
    if (!can(org!.plan, 'analytics')) {
      // The screen shows what's waiting: scans have been counted all along.
      const [all] = await db.select({ n: sql<number>`coalesce(sum(${schema.scanHourly.scans}), 0)::int` }).from(schema.scanHourly).where(eq(schema.scanHourly.locationId, loc.id));
      return reply.code(402).send({ error: 'upgrade_required', feature: 'analytics', plan: 'growth', allTime: all?.n ?? 0 });
    }
    const range = (req.query as { range?: string }).range ?? '7d';
    if (!isRange(range)) return reply.code(400).send({ error: 'invalid', issues: ['range'] });

    const now = clock();
    // The range plus the 7 days before it (for the "typical day" comparison) and a day of slack
    // for time zones ahead of UTC.
    const since = new Date(now.getTime() - (30 + 9) * 86_400_000);
    const rows = await db
      .select({ hour: schema.scanHourly.hour, scans: schema.scanHourly.scans, qr: schema.scanHourly.qr, ar: schema.scanHourly.ar })
      .from(schema.scanHourly)
      .where(and(eq(schema.scanHourly.locationId, loc.id), gte(schema.scanHourly.hour, since)));
    const [all] = await db.select({ n: sql<number>`coalesce(sum(${schema.scanHourly.scans}), 0)::int` }).from(schema.scanHourly).where(eq(schema.scanHourly.locationId, loc.id));
    const [first] = await db.select({ at: min(schema.menuVersions.publishedAt) }).from(schema.menuVersions).where(eq(schema.menuVersions.locationId, loc.id));

    return buildReport({ rows, allTime: all?.n ?? 0, liveSince: first?.at ? new Date(first.at).toISOString() : null, range, timezone: loc.timezone, now });
  });
}
