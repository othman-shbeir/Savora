import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-page';
import { PRIVACY } from '@/content/legal';
import { getDictionary, getLocale } from '../dictionaries';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: PRIVACY[locale].title, alternates: { canonical: `/${locale}/privacy`, languages: { en: '/en/privacy', ar: '/ar/privacy' } } };
}

export default async function Page() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const email = process.env.SUPPORT_EMAIL;
  return <LegalPage doc={PRIVACY[locale]} locale={locale} languageLabel={t.common.language} contact={email ? { label: t.legal.contact, email } : null} />;
}
