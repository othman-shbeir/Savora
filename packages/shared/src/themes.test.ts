import { describe, expect, it } from 'vitest';
import { AA, checkTheme, contrast, CustomThemeInput, DEFAULT_STYLE, fixContrast, PRESETS, styleOf, themeAllowed } from './themes';

describe('contrast', () => {
  it('matches the WCAG reference values', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1);
  });
});

describe('presets', () => {
  it('every preset passes AA for text, descriptions, prices and buttons', () => {
    for (const p of PRESETS) {
      const r = checkTheme(p.colors);
      expect(r, p.ref).toMatchObject({ ok: true });
    }
  });
  it('has three free essentials and six Growth themes', () => {
    expect(PRESETS.filter((p) => p.tier === 'free').map((p) => p.ref)).toEqual(['auto', 'roast', 'dark']);
    expect(PRESETS.filter((p) => p.tier === 'growth')).toHaveLength(6);
  });
});

describe('plan rules', () => {
  it('lets Starter use the essentials only, Growth everything', () => {
    expect(themeAllowed('starter', { tier: 'free' })).toBe(true);
    expect(themeAllowed('starter', { tier: 'growth' })).toBe(false);
    expect(themeAllowed('starter', { tier: 'custom' })).toBe(false);
    expect(themeAllowed('growth', { tier: 'custom' })).toBe(true);
  });
});

describe('fixContrast', () => {
  it('rescues a pretty but unreadable palette while keeping its hues', () => {
    const pale = { bg: '#F3EADB', surface: '#FBF6EE', primary: '#E89A8F', accent: '#C08A35', ink: '#9A8F86', muted: '#C9BFB5' };
    expect(checkTheme(pale).ok).toBe(false);
    const fixed = fixContrast(pale);
    const r = checkTheme(fixed);
    expect(r.ok).toBe(true);
    expect(r.text).toBeGreaterThanOrEqual(AA);
    // Backgrounds and accent are left alone; red stays reddish.
    expect([fixed.bg, fixed.surface, fixed.accent]).toEqual([pale.bg, pale.surface, pale.accent]);
    const [r0, g0, b0] = [1, 3, 5].map((i) => parseInt(fixed.primary.slice(i, i + 2), 16));
    expect(r0!).toBeGreaterThan(g0!);
    expect(r0!).toBeGreaterThan(b0!);
  });
  it('works on dark themes by lightening text', () => {
    const dim = { bg: '#111111', surface: '#1C1C1C', primary: '#7A2E28', accent: '#E3B45B', ink: '#555555', muted: '#444444' };
    expect(checkTheme(fixContrast(dim)).ok).toBe(true);
  });
});

describe('theme style', () => {
  it('gives every preset the default look, so existing menus keep theirs', () => {
    for (const p of PRESETS) expect(styleOf(p)).toEqual({ ...DEFAULT_STYLE, font: p.font });
  });

  it('reads stored values defensively', () => {
    expect(styleOf({ font: 'geometric', corners: 'sharp', header: 'plain', layout: 'compact', boldPrices: true })).toEqual({ font: 'geometric', corners: 'sharp', header: 'plain', layout: 'compact', boldPrices: true });
    // A value from an older or newer version falls back instead of breaking the menu.
    expect(styleOf({ font: 'comic', corners: 7, header: null, boldPrices: 'yes' })).toEqual(DEFAULT_STYLE);
  });

  it('fills in the style when saving a theme that only has colours', () => {
    const colors = PRESETS[0]!.colors;
    expect(CustomThemeInput.parse({ nameEn: 'Mine', colors })).toMatchObject({ ...DEFAULT_STYLE, nameAr: null });
    expect(CustomThemeInput.safeParse({ nameEn: 'Mine', colors, layout: 'grid' }).success).toBe(false);
  });
});
