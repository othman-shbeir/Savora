import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { BillingScreen } from '@/components/billing/billing-screen';
import { getBilling } from '@/lib/api';
import { requireWorkspace } from '@/lib/workspace';
import { getDictionary, getLocale } from '../../dictionaries';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).nav.billing };
}

/** The organization's plan, pending upgrade, plan comparison and invoices. */
export default async function BillingPage() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const { org, me, shell } = await requireWorkspace(locale);
  const billing = await getBilling(org.id);
  if (!billing) notFound();
  return (
    <AppShell t={t} locale={locale} active="billing" workspace={shell}>
      <BillingScreen b={billing} t={t.billing} locale={locale} orgId={org.id} userName={me.user.name} />
    </AppShell>
  );
}
