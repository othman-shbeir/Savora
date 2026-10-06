import type { Locale } from '@savora/shared';

type Named = { nameEn: string | null; nameAr: string | null };

/** The name in the reader's language, else the other one. */
export const primaryName = (x: Named, locale: Locale) => (locale === 'ar' ? (x.nameAr ?? x.nameEn) : (x.nameEn ?? x.nameAr)) ?? '';

/** The name in the other language, when there is one, for the line under the main name. */
export const secondaryName = (x: Named, locale: Locale) => (locale === 'ar' ? (x.nameAr ? x.nameEn : null) : x.nameEn ? x.nameAr : null);

export const descriptionOf = (x: { descriptionEn: string | null; descriptionAr: string | null }, locale: Locale) =>
  locale === 'ar' ? (x.descriptionAr ?? x.descriptionEn) : (x.descriptionEn ?? x.descriptionAr);
