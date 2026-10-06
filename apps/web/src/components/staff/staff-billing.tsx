'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { usd, type Locale, type PlanId, type PlanRequest } from '@savora/shared';
import type { Dictionary } from '@/app/[lang]/dictionaries';
import { planName } from '@/lib/plan-name';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';

export type StaffData = {
  requests: Array<PlanRequest & { organization: { id: string; nameEn: string; plan: PlanId }; contactName: string | null; contactPhone: string | null; note: string | null }>;
  subscriptions: Array<{ organization: { id: string; nameEn: string }; plan: PlanId; status: string; periodEnd: string | null; cancelAtPeriodEnd: boolean }>;
};

/** Savora staff: match transfers to references, then activate or decline. */
export function StaffBilling({ data, t, tb, locale }: { data: StaffData; t: Dictionary['staff']; tb: Dictionary['billing']; locale: Locale }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const date = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—');
  const pending = data.requests.filter((r) => r.status === 'pending');
  const recent = data.requests.filter((r) => r.status === 'approved' || r.status === 'rejected').slice(0, 10);

  async function decide(id: string, action: 'approve' | 'reject', form: HTMLFormElement) {
    const f = new FormData(form);
    setBusy(id);
    await fetch(`/api/staff/billing/requests/${id}/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method: f.get('method'), note: f.get('note') }) }).catch(() => null);
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="grid gap-8">
      <section aria-labelledby="pending-h">
        <h2 id="pending-h" className="text-heading-s font-semibold">
          {t.pending} <span className="text-muted">· {pending.length}</span>
        </h2>
        {pending.length === 0 ? (
          <p className="mt-3 text-body-s text-muted">{t.none}</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {pending.map((r) => (
              <li key={r.id}>
                <Card className="p-5">
                  <form onSubmit={(e) => e.preventDefault()} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                    <dl className="grid gap-x-6 gap-y-2 text-body-s sm:grid-cols-3">
                      <div>
                        <dt className="text-caption text-muted">{t.colOrg}</dt>
                        <dd className="font-semibold">{r.organization.nameEn}</dd>
                      </div>
                      <div>
                        <dt className="text-caption text-muted">{t.colPlan}</dt>
                        <dd>
                          {planName(r.plan, tb)} · <span className="tabular-nums">{usd(r.amountCents)}</span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-caption text-muted">{t.colReference}</dt>
                        <dd dir="ltr" className="font-mono font-semibold">
                          {r.reference}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-caption text-muted">{t.colContact}</dt>
                        <dd dir="auto">{[r.contactName, r.contactPhone].filter(Boolean).join(' · ') || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-caption text-muted">{t.colRequested}</dt>
                        <dd>{date(r.createdAt)}</dd>
                      </div>
                      {r.note && (
                        <div>
                          <dt className="text-caption text-muted">{t.note}</dt>
                          <dd dir="auto">{r.note}</dd>
                        </div>
                      )}
                    </dl>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="grid gap-1 text-caption text-muted">
                        {t.method}
                        <select name="method" className="h-9 rounded-[9px] border border-line-2 bg-surface px-2 text-body-s text-ink">
                          <option value="bank_transfer">{tb.bank_transfer}</option>
                          <option value="cash">{tb.cash}</option>
                        </select>
                      </label>
                      <label className="grid gap-1 text-caption text-muted">
                        {t.note}
                        <input name="note" maxLength={300} className="h-9 w-48 rounded-[9px] border border-line-2 bg-surface px-2 text-body-s text-ink" />
                      </label>
                      <Button size="sm" disabled={busy === r.id} onClick={(e) => decide(r.id, 'approve', e.currentTarget.form!)}>
                        {t.approve}
                      </Button>
                      <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={(e) => decide(r.id, 'reject', e.currentTarget.form!)}>
                        {t.reject}
                      </Button>
                    </div>
                  </form>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="subs-h">
        <h2 id="subs-h" className="text-heading-s font-semibold">
          {t.subscriptions}
        </h2>
        <div className="mt-4 overflow-x-auto rounded-[20px] border border-line bg-surface">
          <table className="w-full min-w-[560px] text-body-s">
            <thead className="bg-surface-2 text-caption text-muted">
              <tr>
                {[t.colOrg, t.colPlan, t.colPeriodEnd, t.colStatus].map((h) => (
                  <th key={h} scope="col" className="px-5 py-3 text-start font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.subscriptions.map((s) => (
                <tr key={s.organization.id} className="border-t border-line">
                  <th scope="row" className="px-5 py-3 text-start font-semibold">
                    {s.organization.nameEn}
                  </th>
                  <td className="px-5 py-3">{planName(s.plan, tb)}</td>
                  <td className="px-5 py-3">{date(s.periodEnd)}</td>
                  <td className="px-5 py-3">
                    <Badge tone={s.status === 'active' ? (s.cancelAtPeriodEnd ? 'gold' : 'ok') : s.status === 'past_due' ? 'brand' : 'neutral'}>
                      {s.status === 'active' ? (s.cancelAtPeriodEnd ? tb.statusEnding : tb.statusActive) : s.status === 'past_due' ? tb.statusPastDue : s.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {recent.length > 0 && (
        <section aria-labelledby="recent-h">
          <h2 id="recent-h" className="text-title-m font-semibold">
            {t.recent}
          </h2>
          <ul className="mt-3 grid gap-1.5 text-body-s">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap gap-x-3 text-muted">
                <span dir="ltr" className="font-mono text-ink">
                  {r.reference}
                </span>
                <span>{r.organization.nameEn}</span>
                <span>{planName(r.plan, tb)}</span>
                <Badge tone={r.status === 'approved' ? 'ok' : 'neutral'}>{r.status}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
