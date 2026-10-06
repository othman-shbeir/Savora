// Savora is bilingual from the start: every guest-facing string exists in English and Arabic.
export const LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function dirOf(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/** A string stored in both languages. Arabic may be missing while a menu is a draft. */
export type Bilingual = { en: string; ar?: string | null };

/** Picks the text for a locale, falling back to English when the Arabic is not written yet. */
export function pick(value: Bilingual, locale: Locale): string {
  return locale === 'ar' && value.ar ? value.ar : value.en;
}
