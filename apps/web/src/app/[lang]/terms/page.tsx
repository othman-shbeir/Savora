import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-page';
import { TERMS } from '@/content/legal';
import { getDictionary, getLocale } from '../dictionaries';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: TERMS[locale].title, alternates: { canonical: `/${locale}/terms`, languages: { en: '/en/terms', ar: '/ar/terms' } } };
}

export default async function Page() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const email = process.env.SUPPORT_EMAIL;
  return <LegalPage doc={TERMS[locale]} locale={locale} labels={t.common} contact={email ? { label: t.legal.contact, email } : null} />;
}
