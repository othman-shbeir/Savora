import { describe, expect, it } from 'vitest';
import { addMonth, can, monthlyCents, pausedLocations, planFor, settle, usd, type Subscription } from './plans';

describe('plans', () => {
  it('unlocks features by plan', () => {
    expect(can('starter', 'analytics')).toBe(false);
    expect(can('growth', 'analytics')).toBe(true);
    expect(can('growth', 'sharedTheme')).toBe(false);
    expect(can('multi_location', 'sharedTheme')).toBe(true);
    expect(planFor('guestLinks')).toBe('growth');
    expect(planFor('sharedTheme')).toBe('multi_location');
  });
  it('prices Growth per location and the others flat', () => {
    expect(monthlyCents('starter', 1)).toBe(0);
    expect(monthlyCents('growth', 3)).toBe(2700);
    expect(monthlyCents('growth', 0)).toBe(900);
    expect(monthlyCents('multi_location', 5)).toBe(2900);
    expect([usd(900), usd(2750), usd(0)]).toEqual(['$9', '$27.50', '$0']);
  });
  it('keeps the oldest locations live and pauses the rest', () => {
    const locs = [
      { id: 'c', createdAt: '2026-03-01' },
      { id: 'a', createdAt: '2026-01-01' },
      { id: 'b', createdAt: '2026-02-01' },
    ];
    expect([...pausedLocations(locs, 'starter')].sort()).toEqual(['b', 'c']);
    expect(pausedLocations(locs, 'growth').size).toBe(0);
  });
});

describe('subscription timeline', () => {
  const sub = (over: Partial<Subscription> = {}): Subscription => ({ plan: 'growth', status: 'active', periodEnd: new Date('2026-11-01T00:00:00Z'), cancelAtPeriodEnd: false, ...over });

  it('stays active within the paid period', () => {
    expect(settle(sub(), new Date('2026-10-20T00:00:00Z'))).toEqual(sub());
  });
  it('gives a week of grace after an unpaid period, then falls back to Starter', () => {
    expect(settle(sub(), new Date('2026-11-03T00:00:00Z')).status).toBe('past_due');
    expect(settle(sub(), new Date('2026-11-03T00:00:00Z')).plan).toBe('growth');
    expect(settle(sub(), new Date('2026-11-09T00:00:00Z'))).toMatchObject({ plan: 'starter', status: 'canceled', periodEnd: null });
  });
  it('ends a cancelled plan exactly at the end of its period', () => {
    expect(settle(sub({ cancelAtPeriodEnd: true }), new Date('2026-10-31T23:59:00Z')).plan).toBe('growth');
    expect(settle(sub({ cancelAtPeriodEnd: true }), new Date('2026-11-01T00:00:00Z')).plan).toBe('starter');
  });
  it('adds calendar months, clamping short months', () => {
    expect(addMonth(new Date('2026-10-15T09:00:00Z')).toISOString()).toBe('2026-11-15T09:00:00.000Z');
    expect(addMonth(new Date('2027-01-31T00:00:00Z')).toISOString()).toBe('2027-02-28T00:00:00.000Z');
  });
});
