import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fill, type Locale } from '@savora/shared';
import { GuestTour } from '@/components/tour/guest-tour';
import { getPublicTour } from '@/lib/api';
import { getDictionary, getLocale } from '../../../dictionaries';

type Props = PageProps<'/[lang]/r/[slug]/tour'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, t, locale] = await Promise.all([params, getDictionary(), getLocale()]);
  const tour = await getPublicTour(slug);
  if (!tour) return { title: t.guest.missingTitle, robots: { index: false } };
  const name = (locale === 'ar' && tour.name.ar) || tour.name.en;
  return { title: { absolute: fill(t.guest.tourPageTitle, { name }) }, alternates: { languages: { en: `/en/r/${tour.slug}/tour`, ar: `/ar/r/${tour.slug}/tour` } } };
}

/** The Virtual trial guests open from the menu card. */
export default async function GuestTourPage({ params }: Props) {
  const [{ slug }, t, locale] = await Promise.all([params, getDictionary(), getLocale()]);
  const tour = await getPublicTour(slug);
  if (!tour) notFound();
  const other: Locale = locale === 'ar' ? 'en' : 'ar';
  return <GuestTour tour={tour} t={t.guest} locale={locale} menuHref={`/${locale}/r/${tour.slug}`} otherHref={`/${other}/r/${tour.slug}/tour`} />;
}
