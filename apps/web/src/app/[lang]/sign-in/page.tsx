import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { EmailSignIn } from '@/components/auth/email-sign-in';
import { LocaleSwitch } from '@/components/locale-switch';
import { Logo } from '@/components/ui/logo';
import { getMe } from '@/lib/api';
import { getDictionary, getLocale } from '../dictionaries';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).auth.title };
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default async function SignInPage({ searchParams }: PageProps<'/[lang]/sign-in'>) {
  const [t, locale, me, sp] = await Promise.all([getDictionary(), getLocale(), getMe().catch(() => null), searchParams]);
  if (me) redirect(`/${locale}/app`);
  const a = t.auth;

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel: the café, the promise. Hidden on phones where the form comes first. */}
      <section className="relative hidden overflow-hidden bg-[#1c1c1c] text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Image src="/images/cafe-room.jpg" alt="" fill priority sizes="50vw" className="object-cover opacity-35" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/50 to-black/85" />
        <div className="relative">
          <Logo width={118} />
        </div>
        <div className="relative max-w-md">
          <p className="text-overline font-semibold tracking-[0.11em] text-gold uppercase">{a.panelOverline}</p>
          <h1 className="mt-4 text-display font-bold tracking-[-0.03em]">
            {a.panelLine1}
            <span className="block text-[#ff4d4d]">{a.panelLine2}</span>
          </h1>
          <p className="mt-4 text-body-l text-white/75">{a.panelBody}</p>
        </div>
        <p className="relative text-caption text-white/50">© {new Date().getFullYear()} Savora</p>
      </section>

      <section className="flex flex-col px-5 py-6 sm:px-10 lg:px-12 lg:py-10">
        <div className="flex items-center justify-between gap-4">
          <span className="lg:invisible">
            <Logo width={104} />
          </span>
          <LocaleSwitch current={locale} label={t.common.language} />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px]">
            <h2 className="text-heading-l font-semibold tracking-[-0.02em]">{a.welcome}</h2>
            <p className="mt-2 text-body-m text-muted">{a.lead}</p>

            {sp.error === 'google' && (
              <p role="alert" className="mt-6 rounded-xl bg-brand-soft px-4 py-3 text-body-s text-brand">
                {a.googleFailed}
              </p>
            )}

            {sp.error === 'google_setup' && (
              <p role="alert" className="mt-6 rounded-xl bg-gold-soft px-4 py-3 text-body-s">
                {a.googleSetup}
              </p>
            )}

            <a
              href={`/api/auth/google/start?locale=${locale}`}
              className="mt-8 flex h-12 items-center justify-center gap-2.5 rounded-xl border border-line-2 bg-surface text-body-m font-semibold transition-colors hover:bg-surface-2"
            >
              <GoogleMark />
              {a.google}
            </a>
            <div className="my-6 flex items-center gap-3.5 text-caption text-muted">
              <span className="h-px flex-1 bg-line" />
              {a.or}
              <span className="h-px flex-1 bg-line" />
            </div>

            <EmailSignIn t={a} locale={locale} />
          </div>
        </div>

        <p className="text-center text-caption text-muted">
          {a.terms.split(/(\{terms\}|\{privacy\})/).map((part, i) =>
            part === '{terms}' ? (
              <Link key={i} href={`/${locale}/terms`} className="font-medium text-ink-2 underline underline-offset-2 hover:text-brand">
                {a.termsLink}
              </Link>
            ) : part === '{privacy}' ? (
              <Link key={i} href={`/${locale}/privacy`} className="font-medium text-ink-2 underline underline-offset-2 hover:text-brand">
                {a.privacyLink}
              </Link>
            ) : (
              part
            ),
          )}
        </p>
      </section>
    </div>
  );
}
