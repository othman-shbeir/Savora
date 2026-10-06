'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fill, GRACE_DAYS, monthlyCents, PLANS, rank, usd, type BillingOverview, type Locale, type PlanId } from '@savora/shared';
import type { Dictionary } from '@/app/[lang]/dictionaries';
import { cx } from '@/lib/cx';
import { planName } from '@/lib/plan-name';
import { plural } from '@/lib/plural';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, Overline } from '../ui/card';
import { Dialog } from '../ui/dialog';
import { Field, TextArea } from '../ui/field';

type Text = Dictionary['billing'];

const dateFmt = (locale: Locale) => new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en', { day: 'numeric', month: 'long', year: 'numeric' });

const ICON = {
  check: <polyline points="20 6 9 17 4 12" />,
  leaf: (
    <>
      <path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14" />
      <path d="M5 19l7-7" />
    </>
  ),
  qr: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM17 17h4v4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" />
      <polyline points="9 12 11 14 15 10" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.5 9.5c-.5-1-1.4-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2-.5-2.5-1.5M12 6.5v1.5M12 16v1.5" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
};
const Icon = ({ d, size = 16, className }: { d: React.ReactNode; size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
    {d}
  </svg>
);

/** Plans & billing: the plan in force, what's waiting, the three plans, and every invoice. */
export function BillingScreen({ b, t, locale, orgId, userName }: { b: BillingOverview; t: Text; locale: Locale; orgId: string; userName: string | null }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ kind: 'upgrade'; plan: PlanId } | { kind: 'manage' } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const date = (iso: string | null) => (iso ? dateFmt(locale).format(new Date(iso)) : '');
  const name = (x: { nameEn: string; nameAr: string | null }) => (locale === 'ar' && x.nameAr) || x.nameEn;
  const list = (xs: string[]) => xs.join(locale === 'ar' ? '، ' : ', ');
  const sub = b.subscription;
  const paid = b.plan !== 'starter';
  const ending = paid && sub?.cancelAtPeriodEnd;
  const pastDue = sub?.status === 'past_due';
  const graceEnd = sub?.periodEnd ? new Date(new Date(sub.periodEnd).getTime() + GRACE_DAYS * 86_400_000).toISOString() : null;
  const chips = b.plan === 'starter' ? t.chipsStarter : b.plan === 'growth' ? t.chipsGrowth : t.chipsMulti;

  async function post(path: string, body?: unknown, method = 'POST') {
    setBusy(true);
    const res = await fetch(`/api/organizations/${orgId}/billing${path}`, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    setBusy(false);
    if (res?.ok) router.refresh();
    return res;
  }

  const cta = (p: PlanId) => {
    const disabled = (label: React.ReactNode, tone: 'muted' | 'ok' = 'muted') => (
      <span className={cx('mt-5 flex h-12 items-center justify-center gap-2 rounded-xl border text-body-s font-semibold', tone === 'ok' ? 'border-line-2 bg-surface-2 text-ink-2' : 'border-dashed border-line-2 text-muted')}>{label}</span>
    );
    if (p === b.plan)
      return disabled(
        <>
          <Icon d={ICON.check} className="text-ok" />
          {t.ctaCurrent}
        </>,
        'ok',
      );
    if (b.pending?.plan === p) return disabled(t.ctaPending);
    if (p === 'starter') {
      if (ending) return disabled(fill(t.endsOn, { date: date(sub!.periodEnd) }));
      return (
        <Button variant="secondary" size="lg" className="mt-5 w-full" disabled={!b.canManage} title={b.canManage ? undefined : t.ownerOnly} onClick={() => setDialog({ kind: 'manage' })}>
          {t.ctaStarter}
        </Button>
      );
    }
    // A paid plan must fit every branch; Starter is always allowed (extra branches pause).
    if (b.locations > PLANS[p].maxLocations) return disabled(fill(t.ctaTooMany, { max: plural(locale, PLANS[p].maxLocations, t.locations) }));
    const label = rank(p) > rank(b.plan) ? (p === 'growth' ? t.ctaGrowth : t.ctaMulti) : fill(t.ctaSwitch, { plan: planName(p, t) });
    return (
      <Button variant={p === 'growth' ? 'primary' : 'secondary'} size="lg" className="mt-5 w-full" disabled={!b.canManage} title={b.canManage ? undefined : t.ownerOnly} onClick={() => setDialog({ kind: 'upgrade', plan: p })}>
        {label} <span aria-hidden>{locale === 'ar' ? '←' : '→'}</span>
      </Button>
    );
  };

  const cards: Array<{ p: PlanId; dark?: boolean; price: string; unit: string; desc: string; feats: string[]; badge: React.ReactNode; tone: string; note?: string }> = [
    { p: 'starter', price: t.free, unit: t.noCard, desc: t.descStarter, feats: t.featStarter, badge: b.plan === 'starter' ? <Badge tone="ok">{t.badgeCurrent}</Badge> : null, tone: 'bg-ok-soft text-ok' },
    {
      p: 'growth',
      dark: true,
      price: usd(PLANS.growth.priceCents),
      unit: t.perLocationMonth,
      desc: t.descGrowth,
      feats: t.featGrowth,
      badge: b.plan === 'growth' ? <Badge tone="ok">{t.badgeCurrent}</Badge> : <span className="rounded-full bg-brand px-2.5 py-1 text-[11px] font-semibold text-white">{t.badgeGrowth}</span>,
      tone: 'bg-[rgb(255_77_77/0.18)] text-[#ff6b6b]',
      note: fill(t.growthLimit, { total: usd(monthlyCents('growth', b.locations)) }),
    },
    {
      p: 'multi_location',
      price: usd(PLANS.multi_location.priceCents),
      unit: t.perMonth,
      desc: t.descMulti,
      feats: t.featMulti,
      badge: b.plan === 'multi_location' ? <Badge tone="ok">{t.badgeCurrent}</Badge> : <Badge tone="gold" dot={false}>{t.badgeMulti}</Badge>,
      tone: 'bg-gold-soft text-gold',
    },
  ];

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <Overline>{t.overline}</Overline>
          <h1 className="mt-2.5 text-heading-l font-semibold tracking-[-0.02em] sm:text-heading-xl">{t.title}</h1>
          <p className="mt-2 max-w-xl text-body-m text-muted">{t.lead}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <a href="#history" className="inline-flex h-10 items-center gap-2 px-2 text-body-s font-semibold text-ink-2 hover:text-ink">
            <Icon d={ICON.receipt} />
            {t.history}
          </a>
          {paid && (
            <Button variant="secondary" disabled={!b.canManage} title={b.canManage ? undefined : t.ownerOnly} onClick={() => setDialog({ kind: 'manage' })}>
              {t.manage}
            </Button>
          )}
        </div>
      </header>

      {/* The plan in force. */}
      <Card className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4 px-6 py-5">
        <div className="flex items-center gap-4">
          <span className="grid size-12 place-items-center rounded-xl bg-ok-soft text-ok">
            <Icon d={ICON.leaf} size={20} />
          </span>
          <div>
            <p className="flex items-center gap-2 text-overline font-semibold tracking-[0.1em] text-muted uppercase">
              {t.yourPlan}
              <Badge tone={pastDue ? 'brand' : ending ? 'gold' : 'ok'}>{pastDue ? t.statusPastDue : ending ? t.statusEnding : t.statusActive}</Badge>
            </p>
            <p className="mt-0.5 text-heading-s font-semibold">{planName(b.plan, t)}</p>
          </div>
        </div>
        <ul className="flex min-w-0 flex-1 flex-wrap gap-2 border-line md:border-s md:ps-6">
          {chips.map((c) => (
            <li key={c} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-caption text-ink-2">
              <Icon d={ICON.check} size={12} className="text-ok" />
              {c}
            </li>
          ))}
          <li className="inline-flex items-center rounded-full bg-surface-2 px-3 py-1 text-caption text-muted">{fill(t.usage, { n: b.locations, max: PLANS[b.plan].maxLocations })}</li>
        </ul>
        <div className="text-end">
          <p className="flex items-baseline justify-end gap-1">
            <span className="text-heading-m font-semibold tabular-nums">{usd(b.monthlyCents)}</span>
            <span className="text-body-s text-muted">{t.perMonth}</span>
          </p>
          <p className="text-caption text-muted">
            {!paid ? t.noCharge : pastDue ? fill(t.pastDue, { date: date(sub!.periodEnd), grace: date(graceEnd) }) : ending ? fill(t.endsOn, { date: date(sub!.periodEnd) }) : fill(t.renews, { date: date(sub?.periodEnd ?? null) })}
          </p>
        </div>
      </Card>

      {!b.canManage && <p className="mt-3 text-caption text-muted">{t.ownerOnly}</p>}

      {b.pending && (
        <section aria-labelledby="pending-h" className="mt-5 rounded-[20px] border border-gold bg-gold-soft p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-2xl">
              <h2 id="pending-h" className="text-title-m font-semibold">
                {fill(t.pendingTitle, { plan: planName(b.pending.plan, t) })}
              </h2>
              <p className="mt-1 text-body-s text-ink-2">{fill(t.pendingBody, { amount: usd(b.pending.amountCents) })}</p>
            </div>
            {b.canManage && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => post(`/requests/${b.pending!.id}`, undefined, 'DELETE')}>
                {t.cancelRequest}
              </Button>
            )}
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-surface p-3">
              <dt className="text-caption text-muted">{t.reference}</dt>
              <dd className="mt-1 flex items-center justify-between gap-2">
                <span dir="ltr" className="font-mono text-title-m font-semibold tracking-wider">
                  {b.pending.reference}
                </span>
                <button
                  type="button"
                  className="text-caption font-semibold text-brand"
                  onClick={async () => {
                    await navigator.clipboard?.writeText(b.pending!.reference).catch(() => {});
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  }}
                >
                  {copied ? t.copied : t.copy}
                </button>
              </dd>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <dt className="text-caption text-muted">{t.amount}</dt>
              <dd className="mt-1 text-title-m font-semibold tabular-nums">
                {usd(b.pending.amountCents)} <span className="text-caption font-normal text-muted">{t.perMonth}</span>
              </dd>
            </div>
            {b.payment.bankName || b.payment.iban ? (
              <div className="rounded-xl bg-surface p-3 sm:col-span-2">
                <dt className="text-caption text-muted">{[b.payment.bankName && t.bank, b.payment.accountName && t.accountName, b.payment.iban && t.iban].filter(Boolean).join(' · ')}</dt>
                <dd className="mt-1 text-body-s font-semibold">
                  {[b.payment.bankName, b.payment.accountName].filter(Boolean).join(' · ')}
                  {b.payment.iban && (
                    <span dir="ltr" className="mt-0.5 block font-mono text-caption">
                      {b.payment.iban}
                    </span>
                  )}
                </dd>
              </div>
            ) : (
              <div className="rounded-xl bg-surface p-3 text-body-s text-muted sm:col-span-2">{t.noBankYet}</div>
            )}
          </dl>
          {b.payment.contactPhone && (
            <a href={`https://wa.me/${b.payment.contactPhone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(b.pending.reference)}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-body-s font-semibold text-ok hover:underline">
              {t.whatsapp}
            </a>
          )}
        </section>
      )}

      {!b.pending && b.lastDecision?.status === 'rejected' && (
        <p role="status" className="mt-5 rounded-xl bg-brand-soft px-4 py-3 text-body-s text-brand">
          {b.lastDecision.decisionNote ? fill(t.declined, { note: b.lastDecision.decisionNote }) : t.declinedNoNote}
        </p>
      )}
      {b.paused.length > 0 && (
        <section className="mt-5 rounded-[20px] border border-brand bg-brand-soft p-5">
          <h2 className="text-title-s font-semibold">{fill(t.pausedTitle, { names: list(b.paused.map(name)) })}</h2>
          <p className="mt-1 text-body-s text-ink-2">{fill(t.pausedBody, { max: plural(locale, PLANS[b.plan].maxLocations, t.locations) })}</p>
        </section>
      )}

      {/* Compare plans */}
      <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Overline>{t.compareOverline}</Overline>
          <h2 className="mt-1.5 text-heading-m font-semibold tracking-[-0.02em]">{t.compareTitle}</h2>
        </div>
        <p className="max-w-sm text-body-s text-muted md:text-end">{t.compareBody}</p>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {cards.map((c) => (
          <section
            key={c.p}
            aria-labelledby={`plan-${c.p}`}
            className={cx('flex flex-col rounded-[22px] p-6', c.dark ? 'bg-[#1c1c1c] text-[#f5f5f5] shadow-[0_24px_48px_rgb(28_28_28/0.22)]' : 'border border-line bg-surface shadow-card')}
          >
            <div className="flex min-h-6 items-center justify-between gap-3">
              <h3 id={`plan-${c.p}`} className={cx('text-overline font-semibold tracking-[0.12em] uppercase', c.dark ? 'text-[#ff6b6b]' : 'text-muted')}>
                {planName(c.p, t)}
              </h3>
              {c.badge}
            </div>
            <p className="mt-4 flex items-baseline gap-2">
              <span className="text-heading-xl font-bold tracking-[-0.03em]">{c.price}</span>
              <span className={cx('text-body-s', c.dark ? 'text-[#a6a6a6]' : 'text-muted')}>{c.unit}</span>
            </p>
            <p className={cx('mt-2 min-h-10 text-body-s', c.dark ? 'text-[#bdbdbd]' : 'text-muted')}>{c.desc}</p>
            {c.note && <p className="mt-1 text-caption text-[#a6a6a6]">{c.note}</p>}
            {cta(c.p)}
            <div className={cx('my-5 h-px', c.dark ? 'bg-white/12' : 'bg-line')} />
            <p className={cx('text-overline font-semibold tracking-[0.1em] uppercase', c.dark ? 'text-[#8a8a8a]' : 'text-muted')}>{t.included}</p>
            <ul className="mt-3 grid gap-2.5">
              {c.feats.map((f) => (
                <li key={f} className={cx('flex items-start gap-2.5 text-body-s', c.dark ? 'text-[#e6e6e6]' : 'text-ink-2')}>
                  <span className={cx('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full', c.tone)}>
                    <Icon d={ICON.check} size={11} />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <Card className="mt-5 grid gap-y-4 py-5 md:grid-cols-3">
        {(
          [
            [ICON.qr, t.promise1Title, t.promise1Body],
            [ICON.shield, t.promise2Title, t.promise2Body],
            [ICON.coin, t.promise3Title, t.promise3Body],
          ] as const
        ).map(([icon, title, body], i) => (
          <div key={i} className={cx('flex items-start gap-3.5 px-6', i < 2 && 'md:border-e md:border-line')}>
            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-ink-2">
              <Icon d={icon} />
            </span>
            <div>
              <p className="text-body-s font-semibold">{title}</p>
              <p className="mt-0.5 text-caption text-muted">{body}</p>
            </div>
          </div>
        ))}
      </Card>

      {/* History */}
      <section id="history" aria-labelledby="history-h" className="mt-10 scroll-mt-6">
        <h2 id="history-h" className="text-heading-s font-semibold">
          {t.historyTitle}
        </h2>
        {b.invoices.length === 0 ? (
          <p className="mt-3 text-body-s text-muted">{t.noInvoices}</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-[20px] border border-line bg-surface shadow-card">
            <table className="w-full min-w-[640px] text-body-s">
              <thead className="bg-surface-2 text-caption text-muted">
                <tr>
                  {[t.colInvoice, t.colPeriod, t.colPlan, t.colAmount, t.colStatus].map((h) => (
                    <th key={h} scope="col" className="px-5 py-3 text-start font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.invoices.map((i) => (
                  <tr key={i.id} className="border-t border-line">
                    <th scope="row" className="px-5 py-3 text-start font-mono font-medium" dir="ltr">
                      {i.number}
                    </th>
                    <td className="px-5 py-3 text-muted">{i.periodStart ? `${date(i.periodStart)} – ${date(i.periodEnd)}` : date(i.createdAt)}</td>
                    <td className="px-5 py-3">
                      {planName(i.plan, t)} <span className="text-muted">· {plural(locale, i.locations, t.locations)}</span>
                    </td>
                    <td className="px-5 py-3 font-semibold tabular-nums">{usd(i.amountCents)}</td>
                    <td className="px-5 py-3">
                      <Badge tone={i.status === 'paid' ? 'ok' : i.status === 'due' ? 'gold' : 'neutral'}>{t[i.status]}</Badge>
                      {i.method && <span className="ms-2 text-caption text-muted">{i.method === 'cash' ? t.cash : i.method === 'bank_transfer' ? t.bank_transfer : i.method}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dialog?.kind === 'upgrade' && <UpgradeDialog plan={dialog.plan} b={b} t={t} locale={locale} userName={userName} onClose={() => setDialog(null)} onSend={(body) => post('/requests', body)} />}
      <Dialog open={dialog?.kind === 'manage'} onClose={() => setDialog(null)} title={ending ? fill(t.keep, { plan: planName(b.plan, t) }) : t.downTitle} closeLabel={t.close} size="sm">
        {ending ? (
          <div className="grid gap-4">
            <p className="text-body-s">{fill(t.endsBanner, { date: date(sub!.periodEnd) })}</p>
            <Button disabled={busy} onClick={async () => (await post('/cancel', { resume: true }))?.ok && setDialog(null)}>
              {fill(t.keep, { plan: planName(b.plan, t) })}
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <p className="text-body-s">{fill(t.downBody, { plan: planName(b.plan, t), date: date(sub?.periodEnd ?? null) })}</p>
            <ul className="grid gap-2 text-body-s text-ink-2">
              <li>• {t.down1}</li>
              <li>• {t.down2}</li>
              {b.branches.length > 1 && <li>• {fill(t.downPaused, { names: list(b.branches.slice(PLANS.starter.maxLocations).map(name)) })}</li>}
              <li className="font-semibold text-ink">{t.downKeep}</li>
            </ul>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setDialog(null)}>
                {fill(t.keep, { plan: planName(b.plan, t) })}
              </Button>
              <Button disabled={busy} onClick={async () => (await post('/cancel', {}))?.ok && setDialog(null)}>
                {t.downConfirm}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

/** Ask for a paid plan: what it costs for this group, how manual payment works, who to call. */
function UpgradeDialog({ plan, b, t, locale, userName, onClose, onSend }: { plan: PlanId; b: BillingOverview; t: Text; locale: Locale; userName: string | null; onClose: () => void; onSend: (body: object) => Promise<Response | null> }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const amount = monthlyCents(plan, b.locations);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await onSend({ plan, contactName: f.get('contactName'), contactPhone: f.get('contactPhone'), note: f.get('note') });
    setBusy(false);
    if (res?.ok) return onClose();
    const body = res ? await res.json().catch(() => ({})) : {};
    setError(body.error === 'too_many_locations' ? fill(t.tooMany, { max: plural(locale, body.max, t.locations) }) : t.failed);
  }

  return (
    <Dialog open onClose={onClose} title={fill(t.upgradeTitle, { plan: planName(plan, t) })} closeLabel={t.close}>
      <form onSubmit={submit} className="grid gap-4">
        <div className="flex items-baseline justify-between gap-4 rounded-xl bg-surface-2 p-4">
          <span className="text-body-s font-semibold">{fill(t.summary, { plan: planName(plan, t), locations: plural(locale, b.locations, t.locations) })}</span>
          <span className="text-heading-s font-semibold tabular-nums">
            {usd(amount)} <span className="text-caption font-normal text-muted">{t.perMonth}</span>
          </span>
        </div>
        <div>
          <p className="text-body-s font-semibold">{t.howTitle}</p>
          <p className="mt-1 text-caption text-muted">{t.howBody}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field name="contactName" label={t.contactName} defaultValue={userName ?? ''} maxLength={80} />
          <Field name="contactPhone" label={t.contactPhone} type="tel" maxLength={30} placeholder="+970 59 555 0142" />
        </div>
        <TextArea name="note" label={t.note} maxLength={300} />
        {error && (
          <p role="alert" className="rounded-xl bg-brand-soft px-4 py-3 text-body-s text-brand">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? t.submitting : fill(t.submit, { plan: planName(plan, t) })}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
