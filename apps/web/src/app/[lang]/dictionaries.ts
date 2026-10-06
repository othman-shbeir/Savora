import { lang } from 'next/root-params';
import { notFound } from 'next/navigation';
import { isLocale, type Locale } from '@savora/shared';

const dictionaries = {
  en: () => import('./dictionaries/en.json').then((m) => m.default),
  ar: () => import('./dictionaries/ar.json').then((m) => m.default),
};

export type Dictionary = Awaited<ReturnType<(typeof dictionaries)['en']>>;

/** The current locale from the URL; 404s for anything that is not /en or /ar. */
export async function getLocale(): Promise<Locale> {
  const l = await lang();
  if (!isLocale(l)) notFound();
  return l;
}

export async function getDictionary(): Promise<Dictionary> {
  return dictionaries[await getLocale()]();
}
