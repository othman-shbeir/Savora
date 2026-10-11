import Link from 'next/link';
import { PLANS, usd, type PlanId } from '@savora/shared';
import type { Dictionary } from '@/app/[lang]/dictionaries';
import { cx } from '@/lib/cx';
import { planName } from '@/lib/plan-name';
import { Heading, Icon, Overline } from './parts';

/** The three plans, priced from the same table the billing screen uses. */
export function Pricing({ t, href }: { t: Dictionary; href: string }) {
  const l = t.landing;
  const plans: Array<{ id: PlanId; price: string }> = [
    { id: 'starter', price: l.free },
    { id: 'growth', price: usd(PLANS.growth.priceCents) },
    { id: 'multi_location', price: usd(PLANS.multi_location.priceCents) },
  ];
  return (
    <section id="pricing" aria-labelledby="pricing-h" className="mx-auto max-w-[1240px] scroll-mt-6 px-5 pb-24 sm:px-8 lg:pb-[110px]">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Overline>{l.pricingOverline}</Overline>
          <Heading id="pricing-h" first={l.pricingTitle1} second={l.pricingTitle2} className="mt-3.5 max-w-[580px]" />
        </div>
        <p className="max-w-[300px] text-[14px] leading-[1.6] text-muted">{l.pricingLead}</p>
      </div>
      <ul className="mt-9 grid gap-4 md:grid-cols-3">
        {plans.map(({ id, price }, i) => {
          const p = l.plans[id];
          const first = i === 0;
          return (
            <li
              key={id}
              className={cx(
                'flex flex-col rounded-2xl bg-surface p-[26px]',
                first ? 'border border-brand shadow-[0_18px_23px_rgb(36_36_36/0.1),0_2px_3px_rgb(36_36_36/0.06)]' : 'border border-line shadow-[0_10px_15px_rgb(36_36_36/0.06),0_1px_1px_rgb(36_36_36/0.04)]',
              )}
            >
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="text-[11px] font-semibold tracking-[0.11em] text-brand">0{i + 1}</span>
                <span className={cx('text-[10px] font-semibold tracking-[0.1em] uppercase rtl:tracking-normal', first ? 'rounded-full bg-brand-fill px-2.5 py-1 text-white' : 'text-muted')}>{p.tag}</span>
              </div>
              <h3 className="mt-5 text-[11px] font-semibold tracking-[0.11em] text-brand uppercase rtl:tracking-normal">{planName(id, t.billing)}</h3>
              <p className="mt-2.5 flex flex-wrap items-baseline gap-2">
                <span className="text-[36px] leading-[1.1] font-semibold tracking-[-0.02em]">{price}</span>
                <span className="text-[12px] font-medium text-muted">{p.unit}</span>
              </p>
              <p className="mt-3 min-h-[40px] text-[13px] leading-[1.55] text-muted">{p.desc}</p>
              <div className="my-5 h-px bg-line" />
              <ul className="grid gap-3">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-[13px] leading-[1.55] text-ink-2">
                    <Icon name={first ? 'check-red' : 'check-gold'} size={14} />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-[22px]">
                <Link
                  href={href}
                  className={cx(
                    'flex h-[46px] items-center justify-center rounded-[11px] text-[14px] font-semibold transition-colors',
                    first ? 'bg-brand-fill text-white hover:bg-brand-fill-hover' : 'border border-line-2 text-ink hover:border-ink',
                  )}
                >
                  {p.cta}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mx-auto mt-6 max-w-[660px] text-center text-[12px] text-muted">{l.pricingNote}</p>
    </section>
  );
}
