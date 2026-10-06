import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { StaffBilling, type StaffData } from '@/components/staff/staff-billing';
import { Overline } from '@/components/ui/card';
import { Logo } from '@/components/ui/logo';
import { apiServer, getMe } from '@/lib/api';
import { getDictionary, getLocale } from '../dictionaries';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).staff.title, robots: { index: false } };
}

/** Savora's own back office: confirm manual payments. Not found for anyone outside the team. */
export default async function StaffPage() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const me = await getMe();
  if (!me) redirect(`/${locale}/sign-in`);
  if (!me.user.staff) notFound();
  const res = await apiServer('/staff/billing');
  if (!res.ok) notFound();
  const data = (await res.json()) as StaffData;

  return (
    <div className="min-h-dvh bg-bg">
      <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-4">
        <Link href={`/${locale}/app`}>
          <Logo width={96} />
        </Link>
        <span className="rounded-full border border-dashed border-line-2 px-3 py-1 text-caption font-semibold text-muted">{t.nav.staff}</span>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-10">
        <Overline>{t.nav.staff}</Overline>
        <h1 className="mt-2.5 text-heading-l font-semibold tracking-[-0.02em]">{t.staff.title}</h1>
        <p className="mt-2 max-w-xl text-body-m text-muted">{t.staff.lead}</p>
        <div className="mt-8">
          <StaffBilling data={data} t={t.staff} tb={t.billing} locale={locale} />
        </div>
      </main>
    </div>
  );
}
