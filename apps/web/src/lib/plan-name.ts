import type { PlanId } from '@savora/shared';

/** The plan's name in the reader's language. Plain module, so server and client code can share it. */
export const planName = (p: PlanId, t: { planStarter: string; planGrowth: string; planMulti: string }) => (p === 'starter' ? t.planStarter : p === 'growth' ? t.planGrowth : t.planMulti);
