import { describe, expect, it } from 'vitest';
import { formatPrice, ItemInput, menuHealth, parsePastedMenu, parsePrice, snapshotOf, type MenuCategory, type MenuItem } from './menu';

const item = (over: Partial<MenuItem> = {}): MenuItem => ({
  id: crypto.randomUUID(),
  categoryId: 'c1',
  nameEn: 'Cardamom Latte',
  nameAr: 'لاتيه بالهيل',
  descriptionEn: null,
  descriptionAr: null,
  priceMinor: 1800,
  available: true,
  photo: null,
  ...over,
});
const category = (items: MenuItem[], over: Partial<MenuCategory> = {}): MenuCategory => ({ id: 'c1', nameEn: 'Coffee', nameAr: 'قهوة', items, ...over });

describe('prices', () => {
  it('reads what owners type, in either digit system', () => {
    expect(parsePrice('18')).toBe(1800);
    expect(parsePrice('18.5')).toBe(1850);
    expect(parsePrice('18,50')).toBe(1850);
    expect(parsePrice('١٨')).toBe(1800);
    expect(parsePrice('₪ 22.00')).toBe(2200);
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('eighteen')).toBeNull();
    expect(parsePrice('1.234')).toBeNull();
  });
  it('formats with the currency symbol and western digits', () => {
    expect(formatPrice(1800, 'ILS')).toBe('₪18.00');
    expect(formatPrice(250, 'USD')).toBe('$2.50');
  });
});

describe('item validation', () => {
  it('needs a name in at least one language', () => {
    const base = { categoryId: crypto.randomUUID(), priceMinor: 1800 };
    expect(ItemInput.safeParse({ ...base, nameEn: '  ' }).success).toBe(false);
    expect(ItemInput.safeParse({ ...base, nameAr: 'لاتيه' }).success).toBe(true);
  });
  it('rejects negative and fractional minor units', () => {
    const base = { categoryId: crypto.randomUUID(), nameEn: 'Latte' };
    expect(ItemInput.safeParse({ ...base, priceMinor: -1 }).success).toBe(false);
    expect(ItemInput.safeParse({ ...base, priceMinor: 18.5 }).success).toBe(false);
  });
});

describe('menu health', () => {
  it('passes a complete bilingual menu', () => {
    const checks = menuHealth([category([item(), item({ nameEn: 'Spanish Latte', priceMinor: 2200 })])]);
    expect(checks.every((c) => c.ok)).toBe(true);
  });
  it('flags an empty menu', () => {
    expect(menuHealth([]).find((c) => c.key === 'items')!.ok).toBe(false);
  });
  it('counts names missing their Arabic', () => {
    const names = menuHealth([category([item({ nameAr: null, nameEn: 'Flat White' }), item()])]).find((c) => c.key === 'names')!;
    expect(names).toMatchObject({ ok: false, count: 1, missing: 'ar', examples: ['Flat White'] });
  });
  it('flags categories with nothing on show', () => {
    const checks = menuHealth([category([item()]), category([item({ available: false })], { id: 'c2', nameEn: 'Sweets' })]);
    expect(checks.find((c) => c.key === 'categories')).toMatchObject({ ok: false, count: 1, examples: ['Sweets'] });
  });
  it('flags free items and likely typos in prices', () => {
    const items = [item(), item({ priceMinor: 2000 }), item({ priceMinor: 1900 }), item({ nameEn: 'Typo', priceMinor: 180000 }), item({ nameEn: 'Free', priceMinor: 0 })];
    const prices = menuHealth([category(items)]).find((c) => c.key === 'prices')!;
    expect(prices.count).toBe(2);
    expect(prices.examples).toEqual(['Typo', 'Free']);
  });
});

describe('snapshot', () => {
  it('keeps only what guests can order', () => {
    const snap = snapshotOf([category([item({ available: false })], { id: 'a' }), category([item(), item({ available: false })], { id: 'b' })], 'ILS');
    expect(snap.categories.map((c) => c.id)).toEqual(['b']);
    expect(snap.categories[0]!.items).toHaveLength(1);
    expect(snap.categories[0]!.items[0]).not.toHaveProperty('available');
  });
});

describe('paste your menu', () => {
  it('reads headings, items, prices and descriptions', () => {
    const { categories } = parsePastedMenu(`COFFEE / قهوة
Cardamom Latte / لاتيه بالهيل ........ 18
espresso, steamed milk, green cardamom
Spanish Latte - لاتيه إسباني  ₪22

Bites
• Labneh Toast 25.00
Za'atar Croissant ١٦`);
    expect(categories).toHaveLength(2);
    expect(categories[0]).toMatchObject({ nameEn: 'COFFEE', nameAr: 'قهوة' });
    expect(categories[0]!.items[0]).toMatchObject({ nameEn: 'Cardamom Latte', nameAr: 'لاتيه بالهيل', priceMinor: 1800, descriptionEn: 'espresso, steamed milk, green cardamom' });
    expect(categories[0]!.items[1]).toMatchObject({ nameEn: 'Spanish Latte', nameAr: 'لاتيه إسباني', priceMinor: 2200 });
    expect(categories[1]!.items.map((i) => [i.nameEn, i.priceMinor])).toEqual([
      ['Labneh Toast', 2500],
      ["Za'atar Croissant", 1600],
    ]);
  });
  it('puts items before any heading into a default category, and Arabic-only names into Arabic', () => {
    const { categories } = parsePastedMenu('شاي بالنعناع 8\nKarak 10');
    expect(categories).toHaveLength(1);
    expect(categories[0]).toMatchObject({ nameEn: 'Menu', nameAr: 'القائمة' });
    expect(categories[0]!.items[0]).toMatchObject({ nameEn: null, nameAr: 'شاي بالنعناع', priceMinor: 800 });
  });
  it('drops headings with no items under them', () => {
    expect(parsePastedMenu('Drinks\nDesserts\n').categories).toEqual([]);
  });
});
