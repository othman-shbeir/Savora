// Plans and what each one unlocks. One table, read by the API (to enforce) and the screens (to
// explain and to show locks), so the two can never disagree.

export const PLAN_ORDER = ['starter', 'growth', 'multi_location'] as const;
export type PlanId = (typeof PLAN_ORDER)[number];

export type Feature =
  | 'analytics' // the Scan analytics screen (scans are counted on every plan)
  | 'menuImport' // photo & PDF import (Phase 7)
  | 'revisionHistory' // earlier published versions
  | 'guestLinks' // Order and Reservation buttons on the guest menu
  | 'themeGallery' // every theme, not just the essentials (Phase 7)
  | 'themeAssistant' // custom themes with the assistant (Phase 7)
  | 'sharedTheme' // one theme across every branch (Phase 7)
  | 'virtualTrial' // the 3D walk-through (Phase 8)
  | 'priorityHelp';

export type PlanSpec = {
  /** USD cents a month: per location on Growth, flat otherwise. */
  priceCents: number;
  perLocation: boolean;
  maxLocations: number;
  features: readonly Feature[];
};

const GROWTH: readonly Feature[] = ['analytics', 'menuImport', 'revisionHistory', 'guestLinks', 'themeGallery', 'themeAssistant', 'virtualTrial', 'priorityHelp'];

export const PLANS: Record<PlanId, PlanSpec> = {
  starter: { priceCents: 0, perLocation: false, maxLocations: 1, features: [] },
  // From four locations, Multi-location costs less than Growth, so Growth stops at three.
  growth: { priceCents: 900, perLocation: true, maxLocations: 3, features: GROWTH },
  multi_location: { priceCents: 2900, perLocation: false, maxLocations: 5, features: [...GROWTH, 'sharedTheme'] },
};

/** Starter's themes: the three essentials of the gallery. */
export const STARTER_THEME_COUNT = 3;

// Read by the API and the web app (the NEXT_PUBLIC_ prefix makes it visible to browser code too).
declare const process: { env: Record<string, string | undefined> };

/** Plans can be switched off while testing: NEXT_PUBLIC_PLANS_ENABLED=false unlocks every feature for
 *  every place, removes location limits and pauses nothing. Billing screens still work. On unless
 *  explicitly switched off, so a missing setting never gives everything away in production. */
export const plansEnabled = () => process.env.NEXT_PUBLIC_PLANS_ENABLED !== 'false';

export const can = (plan: PlanId, feature: Feature) => !plansEnabled() || PLANS[plan].features.includes(feature);

/** How many locations a plan allows; unlimited while plans are switched off. */
export const locationLimit = (plan: PlanId) => (plansEnabled() ? PLANS[plan].maxLocations : Number.POSITIVE_INFINITY);

/** The cheapest plan that unlocks a feature, for "Upgrade to …" prompts. */
export const planFor = (feature: Feature): PlanId => PLAN_ORDER.find((p) => PLANS[p].features.includes(feature))!;

export const rank = (plan: PlanId) => PLAN_ORDER.indexOf(plan);

/** Monthly price in USD cents for a number of locations. */
export function monthlyCents(plan: PlanId, locations: number) {
  const p = PLANS[plan];
  return p.perLocation ? p.priceCents * Math.max(1, locations) : p.priceCents;
}

/** "$9", "$27.50": whole dollars without decimals. */
export const usd = (cents: number) => `$${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}`;

// ---------- Subscription timeline ----------

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled';

export type Subscription = {
  plan: PlanId;
  status: SubscriptionStatus;
  /** End of the paid period; null on Starter. */
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

/** After a period ends unpaid, the plan keeps working this long before falling back to Starter. */
export const GRACE_DAYS = 7;

/** Where a subscription stands at a moment: a paid period still running, a cancelled one that has
 *  ended (back to Starter), or an unpaid one in grace and then lapsed (back to Starter). */
export function settle(sub: Subscription, now: Date): Subscription {
  if (sub.plan === 'starter' || !sub.periodEnd || now < sub.periodEnd) return sub;
  if (sub.cancelAtPeriodEnd) return { plan: 'starter', status: 'canceled', periodEnd: null, cancelAtPeriodEnd: false };
  const graceEnd = new Date(sub.periodEnd.getTime() + GRACE_DAYS * 86_400_000);
  if (now < graceEnd) return { ...sub, status: 'past_due' };
  return { plan: 'starter', status: 'canceled', periodEnd: null, cancelAtPeriodEnd: false };
}

/** One month on, the same day of the month (clamped: 31 Jan → 28 Feb). */
export function addMonth(d: Date) {
  const next = new Date(d);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, last));
  return next;
}

/** Which locations stay live: the oldest ones, up to the plan's limit. The rest pause, and
 *  nothing is deleted. */
export function pausedLocations<T extends { id: string; createdAt: Date | string }>(locations: T[], plan: PlanId): Set<string> {
  const sorted = [...locations].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return new Set(sorted.slice(locationLimit(plan)).map((l) => l.id));
}

// ---------- What the billing screen reads ----------

export type Invoice = {
  id: string;
  number: string;
  plan: PlanId;
  locations: number;
  amountCents: number;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
  status: 'due' | 'paid' | 'void';
  method: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type PlanRequest = {
  id: string;
  plan: PlanId;
  locations: number;
  amountCents: number;
  reference: string;
  status: 'pending' | 'approved' | 'rejected' | 'canceled';
  createdAt: string;
  decisionNote: string | null;
};

/** How to pay while billing is manual. Empty fields are left out of the instructions. */
export type PaymentInstructions = { bankName: string | null; accountName: string | null; iban: string | null; contactPhone: string | null };

export type BillingOverview = {
  plan: PlanId;
  subscription: { status: SubscriptionStatus; periodEnd: string | null; cancelAtPeriodEnd: boolean; provider: string } | null;
  locations: number;
  /** Every branch, oldest first: the order in which they stay live on a smaller plan. */
  branches: Array<{ id: string; nameEn: string; nameAr: string | null }>;
  /** Locations past the plan's limit, paused for guests. */
  paused: Array<{ id: string; nameEn: string; nameAr: string | null }>;
  monthlyCents: number;
  pending: PlanRequest | null;
  lastDecision: PlanRequest | null;
  invoices: Invoice[];
  payment: PaymentInstructions;
  canManage: boolean;
};
