import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { OnboardingForm } from '@/components/onboarding-form';
import { SignOutButton } from '@/components/sign-out-button';
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
      {/* Someone who never creates a workspace (or Savora staff) can still leave or reach the back office. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Logo width={112} />
        <div className="flex items-center gap-4 text-caption text-muted">
          {me.user.staff && (
            <Link href={`/${locale}/staff`} className="font-semibold text-ink-2 hover:text-ink">
              {t.nav.staff}
            </Link>
          )}
          <span dir="ltr">{me.user.email}</span>
          <SignOutButton label={t.shell.signOut} locale={locale} />
        </div>
      </div>
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
