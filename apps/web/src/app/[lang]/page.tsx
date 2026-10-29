import type { Metadata } from 'next';
import Link from 'next/link';
import { PLANS } from '@savora/shared';
import { Closing, Footer } from '@/components/landing/closing';
import { Guests } from '@/components/landing/guests';
import { Hero } from '@/components/landing/hero';
import { How } from '@/components/landing/how';
import { Places } from '@/components/landing/places';
import { Pricing } from '@/components/landing/pricing';
import { PageToggles } from '@/components/page-toggles';
import { Logo } from '@/components/ui/logo';
import { getMe, getPublicMenu } from '@/lib/api';
import { jsonLdText } from '@/lib/menu-jsonld';
import { SITE_ORIGIN } from '@/lib/site';
import { getDictionary, getLocale } from './dictionaries';

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  return {
    title: { absolute: t.landing.metaTitle },
    description: t.landing.metaDescription,
    alternates: { canonical: `/${locale}`, languages: { en: '/en', ar: '/ar', 'x-default': '/en' } },
    openGraph: { title: t.landing.metaTitle, description: t.landing.metaDescription, url: `/${locale}`, siteName: 'Savora', locale: locale === 'ar' ? 'ar' : 'en', type: 'website' },
  };
}

/** A live menu to show visitors. Production sets EXAMPLE_MENU_SLUG to a real published menu. */
const EXAMPLE_SLUG = process.env.EXAMPLE_MENU_SLUG ?? 'saltandstem';

/** The public home page, as designed in Figma (Savora / Landing). */
export default async function Home() {
  const [t, locale, me, example] = await Promise.all([getDictionary(), getLocale(), getMe().catch(() => null), getPublicMenu(EXAMPLE_SLUG).catch(() => null)]);
  const l = t.landing;
  const signedIn = Boolean(me);
  const start = signedIn ? `/${locale}/app` : `/${locale}/sign-in`;
  const exampleHref = example?.status === 'ok' ? `/${locale}/r/${example.menu.slug}` : null;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Savora',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: `${SITE_ORIGIN}/${locale}`,
    description: l.metaDescription,
    inLanguage: ['en', 'ar'],
    offers: (['starter', 'growth', 'multi_location'] as const).map((id) => ({ '@type': 'Offer', name: id, price: (PLANS[id].priceCents / 100).toFixed(2), priceCurrency: 'USD' })),
  };

  return (
    <div className="min-h-dvh overflow-x-clip bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(jsonLd) }} />
      <header className="border-b border-line">
        <div className="mx-auto grid h-[72px] max-w-[1240px] grid-cols-[1fr_auto] items-center gap-4 px-5 sm:px-8 lg:grid-cols-[1fr_auto_1fr]">
          <Link href={`/${locale}`} className="justify-self-start">
            <Logo width={112} />
          </Link>
          <nav aria-label={l.nav.label} className="hidden items-center gap-9 text-[14px] font-medium text-ink-2 lg:flex">
            <a href="#examples" className="hover:text-ink">
              {l.nav.examples}
            </a>
            <a href="#how" className="hover:text-ink">
              {l.nav.how}
            </a>
            <a href="#pricing" className="hover:text-ink">
              {l.nav.pricing}
            </a>
          </nav>
          <div className="flex items-center justify-end gap-2">
            <PageToggles locale={locale} labels={t.common} />
            {!signedIn && (
              <Link href={`/${locale}/sign-in`} className="hidden rounded-[10px] px-4 py-3 text-[14px] font-semibold whitespace-nowrap text-ink hover:text-brand md:inline-flex">
                {l.nav.signIn}
              </Link>
            )}
            <Link href={start} className="hidden rounded-[10px] bg-brand-fill px-5 py-3 text-[14px] font-semibold whitespace-nowrap text-white shadow-[0_6px_9px_rgb(219_26_26/0.22)] transition-colors hover:bg-brand-fill-hover sm:inline-flex">
              {signedIn ? l.nav.workspace : l.nav.start}
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        <Hero l={l} start={start} startLabel={signedIn ? l.nav.workspace : l.ctaStart} exampleHref={exampleHref} />
        <Places l={l} exampleHref={exampleHref} />
        <Guests l={l} />
        <How l={l} />
        <Pricing t={t} href={signedIn ? `/${locale}/app/billing` : `/${locale}/sign-in`} />
        <Closing l={l} start={start} startLabel={signedIn ? l.nav.workspace : l.closingCta} exampleHref={exampleHref} />
      </main>
      <Footer l={l} locale={locale} signedIn={signedIn} />
    </div>
  );
}
