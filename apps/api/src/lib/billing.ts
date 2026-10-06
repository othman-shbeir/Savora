import { randomInt } from 'node:crypto';
import { schema, type Db } from '@savora/db';
import { addMonth, pausedLocations, settle, type PaymentInstructions, type PlanId } from '@savora/shared';
import { and, eq, isNotNull, like, sql } from 'drizzle-orm';
import type { Env } from '../env';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * How a plan gets paid for. Today there is one provider, "manual": the owner asks for a plan,
 * pays by bank transfer or cash, and Savora staff confirm it. A card provider (Paddle, PayTabs…)
 * will implement the same two steps, returning a checkout URL instead of instructions and
 * confirming through its webhook instead of a staff click.
 */
export type BillingProvider = {
  name: string;
  /** What the owner does next after asking for a plan. */
  checkout: (input: { reference: string; amountCents: number }) => { kind: 'instructions'; payment: PaymentInstructions } | { kind: 'redirect'; url: string };
};

export function manualProvider(env: Env): BillingProvider {
  const payment: PaymentInstructions = {
    bankName: env.BILLING_BANK_NAME || null,
    accountName: env.BILLING_ACCOUNT_NAME || null,
    iban: env.BILLING_IBAN || null,
    contactPhone: env.BILLING_CONTACT_PHONE || null,
  };
  return { name: 'manual', checkout: () => ({ kind: 'instructions', payment }) };
}

/** Short, unambiguous code for the bank transfer description: SV-7K3QP (no 0/O, 1/I). */
export function paymentReference() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return `SV-${Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join('')}`;
}

/** Next invoice number for the year: SV-2026-0001, SV-2026-0002… */
export async function nextInvoiceNumber(tx: Tx | Db, now: Date) {
  const prefix = `SV-${now.getUTCFullYear()}-`;
  const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.invoices).where(like(schema.invoices.number, `${prefix}%`));
  return `${prefix}${String((row?.n ?? 0) + 1).padStart(4, '0')}`;
}

/** Brings one organization's plan up to date with time: ends cancelled plans, starts the grace
 *  period, and falls back to Starter after it. Returns the plan in force. */
export async function syncSubscription(db: Db | Tx, organizationId: string, now: Date): Promise<PlanId> {
  const [sub] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.organizationId, organizationId)).limit(1);
  const [org] = await db.select({ plan: schema.organizations.plan }).from(schema.organizations).where(eq(schema.organizations.id, organizationId)).limit(1);
  if (!sub) return org?.plan ?? 'starter';
  const next = settle({ plan: sub.plan, status: sub.status, periodEnd: sub.periodEnd, cancelAtPeriodEnd: sub.cancelAtPeriodEnd }, now);
  if (next.plan !== sub.plan || next.status !== sub.status || next.cancelAtPeriodEnd !== sub.cancelAtPeriodEnd || (next.periodEnd?.getTime() ?? null) !== (sub.periodEnd?.getTime() ?? null)) {
    await db
      .update(schema.subscriptions)
      .set({ plan: next.plan, status: next.status, periodEnd: next.periodEnd, cancelAtPeriodEnd: next.cancelAtPeriodEnd, updatedAt: now })
      .where(eq(schema.subscriptions.organizationId, organizationId));
  }
  if (org && org.plan !== next.plan) await db.update(schema.organizations).set({ plan: next.plan }).where(eq(schema.organizations.id, organizationId));
  return next.plan;
}

/** The hourly sweep: settles every paid subscription. */
export async function settleAll(db: Db, now = new Date()) {
  const subs = await db.select({ id: schema.subscriptions.organizationId }).from(schema.subscriptions).where(isNotNull(schema.subscriptions.periodEnd));
  for (const s of subs) await syncSubscription(db, s.id, now);
}

/** Activates a plan for one paid month, starting now or where the current paid period ends. */
export async function activate(tx: Tx, organizationId: string, plan: PlanId, now: Date) {
  const [sub] = await tx.select().from(schema.subscriptions).where(eq(schema.subscriptions.organizationId, organizationId)).limit(1);
  // Renewing the same plan before it runs out extends it; anything else starts today.
  const start = sub && sub.plan === plan && sub.periodEnd && sub.periodEnd > now ? sub.periodEnd : now;
  const periodEnd = addMonth(start);
  await tx
    .insert(schema.subscriptions)
    .values({ organizationId, plan, status: 'active', provider: 'manual', periodEnd, cancelAtPeriodEnd: false, updatedAt: now })
    .onConflictDoUpdate({ target: schema.subscriptions.organizationId, set: { plan, status: 'active', provider: 'manual', periodEnd, cancelAtPeriodEnd: false, updatedAt: now } });
  await tx.update(schema.organizations).set({ plan }).where(eq(schema.organizations.id, organizationId));
  return { periodStart: start, periodEnd };
}

/** Locations of an organization that are paused because the plan allows fewer. */
export async function pausedIn(db: Db | Tx, organizationId: string, plan: PlanId) {
  const locs = await db.select({ id: schema.locations.id, createdAt: schema.locations.createdAt }).from(schema.locations).where(eq(schema.locations.organizationId, organizationId));
  return pausedLocations(locs, plan);
}

/** Whether one location is within its organization's plan. */
export async function locationPaused(db: Db, location: { id: string; organizationId: string }) {
  const [org] = await db.select({ plan: schema.organizations.plan }).from(schema.organizations).where(and(eq(schema.organizations.id, location.organizationId))).limit(1);
  return (await pausedIn(db, location.organizationId, org?.plan ?? 'starter')).has(location.id);
}
