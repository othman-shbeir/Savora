import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OnboardingForm } from '@/components/onboarding-form';
import { Overline } from '@/components/ui/card';
import { Logo } from '@/components/ui/logo';
import { getMe } from '@/lib/api';
import { getDictionary, getLocale } from '../dictionaries';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).welcome.title };
}

export default async function WelcomePage() {
  const [t, locale, me] = await Promise.all([getDictionary(), getLocale(), getMe()]);
  if (!me) redirect(`/${locale}/sign-in`);
  if (me.organizations.length) redirect(`/${locale}/app`);
  return (
    <main className="mx-auto grid min-h-dvh max-w-2xl content-center gap-8 px-5 py-12">
      <Logo width={112} />
      <div>
        <Overline>{t.welcome.overline}</Overline>
        <h1 className="mt-2.5 text-heading-l font-semibold tracking-[-0.02em]">{t.welcome.title}</h1>
        <p className="mt-2 text-body-m text-muted">{t.welcome.lead}</p>
      </div>
      <div className="rounded-[20px] border border-line bg-surface p-6 shadow-card">
        <OnboardingForm t={t.welcome} locale={locale} />
      </div>
    </main>
  );
}
