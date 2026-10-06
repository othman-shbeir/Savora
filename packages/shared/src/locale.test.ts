import { describe, expect, it } from 'vitest';
import { dirOf, isLocale, pick } from './locale';

describe('locale helpers', () => {
  it('knows the supported locales', () => {
    expect(isLocale('ar')).toBe(true);
    expect(isLocale('fr')).toBe(false);
  });
  it('maps Arabic to right-to-left', () => {
    expect(dirOf('ar')).toBe('rtl');
    expect(dirOf('en')).toBe('ltr');
  });
  it('falls back to English when the Arabic is missing', () => {
    expect(pick({ en: 'Cardamom Latte', ar: 'لاتيه بالهيل' }, 'ar')).toBe('لاتيه بالهيل');
    expect(pick({ en: 'Cardamom Latte', ar: null }, 'ar')).toBe('Cardamom Latte');
  });
});
