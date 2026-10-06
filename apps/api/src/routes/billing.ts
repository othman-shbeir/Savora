import { schema, type Db } from '@savora/db';
import { monthlyCents, PLAN_ORDER, PLANS, type BillingOverview, type Invoice, type PlanRequest } from '@savora/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth/session';
import type { Env } from '../env';
import { membership } from '../lib/access';
import { activate, nextInvoiceNumber, paymentReference, pausedIn, syncSubscription, type BillingProvider } from '../lib/billing';

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const toRequest = (r: typeof schema.planRequests.$inferSelect): PlanRequest => ({
  id: r.id,
  plan: r.plan,
  locations: r.locations,
  amountCents: r.amountCents,
  reference: r.reference,
  status: r.status,
  createdAt: r.createdAt.toISOString(),
  decisionNote: r.decisionNote,
});
const toInvoice = (i: typeof schema.invoices.$inferSelect): Invoice => ({
  id: i.id,
  number: i.number,
  plan: i.plan,
  locations: i.locations,
  amountCents: i.amountCents,
  currency: i.currency,
  periodStart: iso(i.periodStart),
  periodEnd: iso(i.periodEnd),
  status: i.status,
  method: i.method,
  paidAt: iso(i.paidAt),
  createdAt: i.createdAt.toISOString(),
});

const PlanChoice = z.object({
  plan: z.enum(['growth', 'multi_location']),
  contactName: z.string().trim().max(80).nullish().transform((v) => v || null),
  contactPhone: z.string().trim().max(30).nullish().transform((v) => v || null),
  note: z.string().trim().max(300).nullish().transform((v) => v || null),
});
const Decision = z.object({ method: z.enum(['bank_transfer', 'cash']).default('bank_transfer'), note: z.string().trim().max(300).nullish().transform((v) => v || null) });

export function billingRoutes(app: FastifyInstance, db: Db, env: Env, provider: BillingProvider, clock: () => Date) {
  const auth = { preHandler: requireUser };
  const staff = env.SAVORA_STAFF_EMAILS;
  const isStaff = (req: FastifyRequest) => Boolean(req.user && staff.includes(req.user.email.toLowerCase()));
  const requireStaff = async (req: FastifyRequest, reply: FastifyReply) => {
    await requireUser(req, reply);
    if (!reply.sent && !isStaff(req)) return reply.code(404).send({ error: 'not_found' });
  };

  async function overview(orgId: string, role: string): Promise<BillingOverview> {
    const now = clock();
    const plan = await syncSubscription(db, orgId, now);
    const [sub] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.organizationId, orgId)).limit(1);
    const locs = await db
      .select({ id: schema.locations.id, nameEn: schema.locations.nameEn, nameAr: schema.locations.nameAr })
      .from(schema.locations)
      .where(eq(schema.locations.organizationId, orgId))
      .orderBy(schema.locations.createdAt);
    const paused = await pausedIn(db, orgId, plan);
    const requests = await db.select().from(schema.planRequests).where(eq(schema.planRequests.organizationId, orgId)).orderBy(desc(schema.planRequests.createdAt)).limit(5);
    const invoices = await db.select().from(schema.invoices).where(eq(schema.invoices.organizationId, orgId)).orderBy(desc(schema.invoices.createdAt)).limit(24);
    const pending = requests.find((r) => r.status === 'pending');
    const decided = requests.find((r) => r.status === 'approved' || r.status === 'rejected');
    const checkout = provider.checkout({ reference: pending?.reference ?? '', amountCents: pending?.amountCents ?? 0 });
    return {
      plan,
      subscription: sub ? { status: sub.status, periodEnd: iso(sub.periodEnd), cancelAtPeriodEnd: sub.cancelAtPeriodEnd, provider: sub.provider } : null,
      locations: locs.length,
      branches: locs,
      paused: locs.filter((l) => paused.has(l.id)),
      monthlyCents: monthlyCents(plan, locs.length),
      pending: pending ? toRequest(pending) : null,
      lastDecision: decided ? toRequest(decided) : null,
      invoices: invoices.map(toInvoice),
      payment: checkout.kind === 'instructions' ? checkout.payment : { bankName: null, accountName: null, iban: null, contactPhone: null },
      canManage: role === 'owner',
    };
  }

  app.get('/organizations/:orgId/billing', auth, async (req, reply) => {
    const m = await membership(db, req, reply, (req.params as { orgId: string }).orgId);
    if (!m) return;
    return overview(m.organizationId, m.role);
  });

  // Ask for a paid plan. Billing is the owner's call. One pending request at a time: a new one
  // replaces the old, and its invoice is voided.
  app.post('/organizations/:orgId/billing/requests', auth, async (req, reply) => {
    const m = await membership(db, req, reply, (req.params as { orgId: string }).orgId, ['owner']);
    if (!m) return;
    const body = PlanChoice.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid', issues: body.error.issues.map((i) => i.path.join('.')) });
    const now = clock();
    const n = (await db.select({ id: schema.locations.id }).from(schema.locations).where(eq(schema.locations.organizationId, m.organizationId))).length;
    const plan = body.data.plan;
    if (n > PLANS[plan].maxLocations) return reply.code(409).send({ error: 'too_many_locations', max: PLANS[plan].maxLocations });
    const amountCents = monthlyCents(plan, n);
    const reference = paymentReference();
    const created = await db.transaction(async (tx) => {
      const old = await tx.select({ id: schema.planRequests.id }).from(schema.planRequests).where(and(eq(schema.planRequests.organizationId, m.organizationId), eq(schema.planRequests.status, 'pending')));
      if (old.length) {
        const ids = old.map((o) => o.id);
        await tx.update(schema.planRequests).set({ status: 'canceled', decidedAt: now }).where(inArray(schema.planRequests.id, ids));
        await tx.update(schema.invoices).set({ status: 'void' }).where(and(inArray(schema.invoices.requestId, ids), eq(schema.invoices.status, 'due')));
      }
      const [request] = await tx
        .insert(schema.planRequests)
        .values({ organizationId: m.organizationId, plan, locations: n, amountCents, reference, contactName: body.data.contactName, contactPhone: body.data.contactPhone, note: body.data.note, requestedBy: req.user!.id, createdAt: now })
        .returning();
      await tx.insert(schema.invoices).values({ organizationId: m.organizationId, number: await nextInvoiceNumber(tx, now), plan, locations: n, amountCents, status: 'due', requestId: request!.id, createdAt: now });
      return request!;
    });
    req.log.info({ org: m.organizationId, plan, reference }, 'plan requested');
    return reply.code(201).send({ request: toRequest(created), next: provider.checkout({ reference, amountCents }) });
  });

  app.delete('/organizations/:orgId/billing/requests/:id', auth, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const m = await membership(db, req, reply, orgId, ['owner']);
    if (!m) return;
    if (!z.string().uuid().safeParse(id).success) return reply.code(404).send({ error: 'not_found' });
    const done = await db.transaction(async (tx) => {
      const [r] = await tx
        .update(schema.planRequests)
        .set({ status: 'canceled', decidedAt: clock() })
        .where(and(eq(schema.planRequests.id, id), eq(schema.planRequests.organizationId, m.organizationId), eq(schema.planRequests.status, 'pending')))
        .returning();
      if (r) await tx.update(schema.invoices).set({ status: 'void' }).where(and(eq(schema.invoices.requestId, r.id), eq(schema.invoices.status, 'due')));
      return Boolean(r);
    });
    return done ? { ok: true } : reply.code(404).send({ error: 'not_found' });
  });

  // Back to Starter at the end of the paid month (nothing is refunded, nothing is deleted), or
  // change your mind before then.
  app.post('/organizations/:orgId/billing/cancel', auth, async (req, reply) => {
    const m = await membership(db, req, reply, (req.params as { orgId: string }).orgId, ['owner']);
    if (!m) return;
    const resume = (req.body as { resume?: boolean } | undefined)?.resume === true;
    const [sub] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.organizationId, m.organizationId)).limit(1);
    if (!sub || sub.plan === 'starter') return reply.code(409).send({ error: 'no_paid_plan' });
    await db.update(schema.subscriptions).set({ cancelAtPeriodEnd: !resume, updatedAt: clock() }).where(eq(schema.subscriptions.organizationId, m.organizationId));
    return overview(m.organizationId, m.role);
  });

  // ---------- Savora staff: confirm payments ----------

  app.get('/staff/billing', { preHandler: requireStaff }, async () => {
    const rows = await db
      .select({ request: schema.planRequests, org: { id: schema.organizations.id, nameEn: schema.organizations.nameEn, plan: schema.organizations.plan } })
      .from(schema.planRequests)
      .innerJoin(schema.organizations, eq(schema.organizations.id, schema.planRequests.organizationId))
      .orderBy(desc(schema.planRequests.createdAt))
      .limit(100);
    const subs = await db
      .select({ sub: schema.subscriptions, org: { id: schema.organizations.id, nameEn: schema.organizations.nameEn } })
      .from(schema.subscriptions)
      .innerJoin(schema.organizations, eq(schema.organizations.id, schema.subscriptions.organizationId))
      .orderBy(schema.subscriptions.periodEnd);
    return {
      requests: rows.map((r) => ({ ...toRequest(r.request), organization: r.org, contactName: r.request.contactName, contactPhone: r.request.contactPhone, note: r.request.note })),
      subscriptions: subs.map((s) => ({ organization: s.org, plan: s.sub.plan, status: s.sub.status, periodEnd: iso(s.sub.periodEnd), cancelAtPeriodEnd: s.sub.cancelAtPeriodEnd })),
      plans: PLAN_ORDER,
    };
  });

  app.post('/staff/billing/requests/:id/approve', { preHandler: requireStaff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = Decision.safeParse(req.body ?? {});
    if (!body.success || !z.string().uuid().safeParse(id).success) return reply.code(400).send({ error: 'invalid' });
    const now = clock();
    const result = await db.transaction(async (tx) => {
      const [r] = await tx.select().from(schema.planRequests).where(eq(schema.planRequests.id, id)).limit(1);
      if (!r || r.status !== 'pending') return null;
      const { periodStart, periodEnd } = await activate(tx, r.organizationId, r.plan, now);
      await tx.update(schema.planRequests).set({ status: 'approved', decidedAt: now, decidedBy: req.user!.id, decisionNote: body.data.note }).where(eq(schema.planRequests.id, r.id));
      await tx.update(schema.invoices).set({ status: 'paid', method: body.data.method, paidAt: now, periodStart, periodEnd }).where(and(eq(schema.invoices.requestId, r.id), eq(schema.invoices.status, 'due')));
      return { organizationId: r.organizationId, plan: r.plan, periodEnd: periodEnd.toISOString() };
    });
    if (!result) return reply.code(409).send({ error: 'not_pending' });
    req.log.info({ ...result, by: req.user!.email }, 'plan activated');
    return result;
  });

  app.post('/staff/billing/requests/:id/reject', { preHandler: requireStaff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = Decision.safeParse(req.body ?? {});
    if (!body.success || !z.string().uuid().safeParse(id).success) return reply.code(400).send({ error: 'invalid' });
    const done = await db.transaction(async (tx) => {
      const [r] = await tx
        .update(schema.planRequests)
        .set({ status: 'rejected', decidedAt: clock(), decidedBy: req.user!.id, decisionNote: body.data.note })
        .where(and(eq(schema.planRequests.id, id), eq(schema.planRequests.status, 'pending')))
        .returning();
      if (r) await tx.update(schema.invoices).set({ status: 'void' }).where(and(eq(schema.invoices.requestId, r.id), eq(schema.invoices.status, 'due')));
      return Boolean(r);
    });
    return done ? { ok: true } : reply.code(409).send({ error: 'not_pending' });
  });

  return { isStaff };
}
