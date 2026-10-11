import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { fill, PLAN_ORDER, locationLimit, PLANS, rank } from '@savora/shared';
import { AddLocationForm } from '@/components/add-location-form';
import { AppShell } from '@/components/app-shell';
import { ButtonLink } from '@/components/ui/button';
import { Card, Overline } from '@/components/ui/card';
import { planName } from '@/lib/plan-name';
import { plural } from '@/lib/plural';
import { requireWorkspace } from '@/lib/workspace';
import { getDictionary, getLocale } from '../../../dictionaries';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).locations.title };
}

/** Add a branch, or, when the plan is full, say which plan fits. */
export default async function NewLocationPage() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const { org, shell } = await requireWorkspace(locale);
  if (org.role === 'editor') redirect(`/${locale}/app`);
  const l = t.locations;
  const count = org.brands.reduce((n, b) => n + b.locations.length, 0);
  const max = locationLimit(org.plan);
  const next = PLAN_ORDER.find((p) => rank(p) > rank(org.plan) && PLANS[p].maxLocations > count);

  return (
    <AppShell t={t} locale={locale} workspace={shell}>
      <Overline>{Number.isFinite(max) ? fill(t.billing.usage, { n: count, max }) : fill(t.billing.usageUnlimited, { n: count })}</Overline>
      <h1 className="mt-2.5 text-heading-l font-semibold tracking-[-0.02em]">{l.title}</h1>
      <p className="mt-2 max-w-xl text-body-m text-muted">{l.body}</p>
      <Card className="mt-7 max-w-2xl p-6">
        {count < max ? (
          <AddLocationForm orgId={org.id} t={l} locale={locale} />
        ) : (
          <div className="grid gap-3">
            <h2 className="text-heading-s font-semibold">{fill(l.limitTitle, { max: plural(locale, max, t.billing.locations) })}</h2>
            <p className="text-body-m text-muted">{next ? fill(l.limitBody, { plan: planName(next, t.billing) }) : l.limitTop}</p>
            {next && (
              <ButtonLink href={`/${locale}/app/billing`} className="mt-2 justify-self-start">
                {l.seePlans}
              </ButtonLink>
            )}
          </div>
        )}
      </Card>
    </AppShell>
  );
}
