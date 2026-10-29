import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
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
  const { org, me } = await requireWorkspace(locale);
  const billing = await getBilling(org.id);
  if (!billing) notFound();
  return (
    <>
      <BillingScreen b={billing} t={t.billing} locale={locale} orgId={org.id} userName={me.user.name} />
    </>
  );
}
