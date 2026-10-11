import { z } from 'zod';
import type { Photo } from './menu';
import { can, type PlanId } from './plans';

// Menu themes: the look of the guest menu. Nine presets from the design, plus custom themes made
// with the Theme assistant. Every theme is checked for WCAG AA contrast before guests see it.

export type ThemeColors = {
  /** Page background behind the menu card. */
  bg: string;
  /** Card and panel background. */
  surface: string;
  /** Buttons, prices, the active section chip. */
  primary: string;
  /** Highlights such as "Today's special". */
  accent: string;
  /** Body text. */
  ink: string;
  /** Secondary text: descriptions, counts. */
  muted: string;
};

export type ThemeFont = 'sans' | 'serif';
export type ThemeTag = 'light' | 'dark' | 'warm' | 'bold';

export type Theme = {
  /** "auto", a preset id, or "custom:<uuid>". */
  ref: string;
  nameEn: string;
  nameAr: string;
  descEn: string;
  descAr: string;
  tier: 'free' | 'growth' | 'custom';
  colors: ThemeColors;
  font: ThemeFont;
  boldPrices: boolean;
  tags: ThemeTag[];
};

const preset = (ref: string, tier: 'free' | 'growth', nameEn: string, nameAr: string, descEn: string, descAr: string, c: string[], tags: ThemeTag[], font: ThemeFont = 'sans'): Theme => ({
  ref,
  tier,
  nameEn,
  nameAr,
  descEn,
  descAr,
  colors: { bg: c[0]!, surface: c[1]!, primary: c[2]!, accent: c[3]!, ink: c[4]!, muted: c[5]! },
  font,
  boldPrices: false,
  tags,
});

/** The gallery, in design order. The first three are Starter's essentials. */
export const PRESETS: Theme[] = [
  preset('auto', 'free', 'Auto-match', 'تلقائي', 'Follows your brand colours', 'يتبع ألوان علامتك', ['#F5F5F5', '#FFFFFF', '#DB1A1A', '#D9A441', '#242424', '#6E6E6E'], ['light', 'bold']),
  preset('roast', 'free', 'Roasted editorial', 'تحريري محمّص', 'Warm paper, quiet type', 'ورق دافئ وخط هادئ', ['#EFE6D8', '#F8F2E8', '#8C3B2A', '#B98B4E', '#2B211C', '#6E6156'], ['light', 'warm'], 'serif'),
  preset('dark', 'free', 'After-dark', 'بعد الغروب', 'Dim room, glowing prices', 'إضاءة خافتة وأسعار مضيئة', ['#111111', '#1C1C1C', '#FF6A5E', '#E3B45B', '#F2F2F2', '#A3A3A3'], ['dark', 'bold']),
  preset('olive', 'growth', 'Olive grove', 'بستان الزيتون', 'Sage, cream and soft gold', 'أخضر مريمي وكريمي وذهبي هادئ', ['#ECEEE2', '#F7F8F1', '#56663A', '#C4A15A', '#23261B', '#62675A'], ['light', 'warm']),
  preset('zaatar', 'growth', "Za'atar market", 'سوق الزعتر', 'Earthy greens with a spice kick', 'أخضر ترابي بلمسة توابل', ['#EBE6D6', '#F6F2E6', '#4B6547', '#B5542F', '#1F241E', '#62665A'], ['light', 'warm']),
  preset('rose', 'growth', 'Rosewater', 'ماء الورد', 'Blush pink, gentle contrast', 'وردي ناعم وتباين لطيف', ['#F8ECEC', '#FFF7F6', '#A84A61', '#D99AA5', '#3A2328', '#735B60'], ['light']),
  preset('citrus', 'growth', 'Citrus kiosk', 'كشك الحمضيات', 'Bright, quick, street-side', 'مشرق وسريع على الرصيف', ['#FFF3E0', '#FFFAF2', '#B4500B', '#2E7D5B', '#26201A', '#695E52'], ['light', 'bold']),
  preset('souk', 'growth', 'Midnight souk', 'سوق منتصف الليل', 'Deep navy and brass', 'كحلي عميق ونحاسي', ['#121729', '#1B2238', '#D6A64B', '#8EA2DC', '#EEF0F6', '#A2A8BB'], ['dark', 'bold']),
  preset('clay', 'growth', 'Stone & clay', 'حجر وطين', 'Terracotta on limestone', 'تيراكوتا على حجر جيري', ['#F1EAE3', '#FAF6F2', '#A04F35', '#6E8183', '#2E2622', '#6E6058'], ['light', 'warm']),
];

export const presetByRef = (ref: string | null | undefined) => PRESETS.find((p) => p.ref === ref);

/** Whether a plan may apply a theme. Starter: the three essentials. Growth: everything. */
export function themeAllowed(plan: PlanId, theme: Pick<Theme, 'tier'>) {
  if (theme.tier === 'free') return true;
  if (theme.tier === 'growth') return can(plan, 'themeGallery');
  return can(plan, 'themeAssistant');
}

// ---------- Contrast (WCAG 2.1) ----------

const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (s: string) => HEX.test(s);

const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => channel(v / 255));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

/** Contrast ratio between two colours, 1 to 21. */
export function contrast(a: string, b: string) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Label colour for buttons filled with the primary colour: white, the text colour or the
 *  background, whichever reads best (dark themes with a light primary need a dark label). */
export function onPrimary(c: ThemeColors) {
  return ['#FFFFFF', c.ink, c.bg].reduce((best, x) => (contrast(x, c.primary) > contrast(best, c.primary) ? x : best));
}

/** WCAG AA for normal text. */
export const AA = 4.5;

export type ContrastReport = { text: number; muted: number; prices: number; buttons: number; ok: boolean };

/** The pairs guests actually read: body text, descriptions, prices on cards, and button labels. */
export function checkTheme(c: ThemeColors): ContrastReport {
  const text = Math.min(contrast(c.ink, c.surface), contrast(c.ink, c.bg));
  const muted = contrast(c.muted, c.surface);
  const prices = contrast(c.primary, c.surface);
  const buttons = contrast(onPrimary(c), c.primary);
  return { text, muted, prices, buttons, ok: [text, muted, prices, buttons].every((r) => r >= AA) };
}

const toHex = (v: number[]) => `#${v.map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
/** Moves a colour towards black or white in small steps until it reaches the target contrast. */
function push(color: string, against: string, target: number) {
  const towardsDark = luminance(against) > 0.18;
  let c = rgb(color);
  for (let i = 0; i < 40 && contrast(toHex(c), against) < target; i++) c = c.map((x) => (towardsDark ? x * 0.92 : x + (255 - x) * 0.12));
  return toHex(c);
}

/** Nudges ink, muted and primary just far enough to pass AA, keeping their hue. Used on every
 *  theme the assistant proposes, so a beautiful but unreadable suggestion never reaches guests. */
export function fixContrast(c: ThemeColors): ThemeColors {
  const ink = push(push(c.ink, c.surface, AA + 0.2), c.bg, AA + 0.2);
  const muted = push(c.muted, c.surface, AA + 0.1);
  let primary = push(c.primary, c.surface, AA + 0.1);
  if (contrast(onPrimary({ ...c, ink, primary }), primary) < AA) primary = push(primary, '#FFFFFF', AA + 0.1);
  return { ...c, ink, muted, primary };
}

export const isDark = (c: Pick<ThemeColors, 'surface'>) => luminance(c.surface) < 0.2;

/** The guest menu's design tokens for a theme, as CSS custom properties. Prices sit on the card
 *  itself (no tinted chip), which is the pair checkTheme measures. */
export function themeVars(c: ThemeColors): Record<string, string> {
  const dark = isDark(c);
  const mix = (a: string, b: string, p: number) => `color-mix(in srgb, ${a} ${p}%, ${b})`;
  return {
    '--bg': c.bg,
    '--surface': c.surface,
    '--surface-2': mix(c.bg, c.surface, 55),
    '--ink': c.ink,
    '--ink-2': mix(c.ink, c.muted, 70),
    '--muted': c.muted,
    '--line': mix(c.muted, c.surface, 22),
    '--line-2': mix(c.muted, c.surface, 38),
    '--brand': c.primary,
    '--brand-hover': mix(c.primary, c.ink, 85),
    '--brand-soft': mix(c.primary, c.surface, 10),
    '--brand-fill': c.primary,
    '--brand-fill-hover': mix(c.primary, c.ink, 85),
    '--on-brand': onPrimary(c),
    '--accent': c.accent,
    '--price-bg': 'transparent',
    '--gold': dark ? '#e8ba63' : '#8a6416',
    '--gold-soft': mix(dark ? '#e8ba63' : '#d9a441', c.surface, 16),
    '--gold-ink': dark ? '#e8ba63' : '#8a6416',
    '--ok': dark ? '#5fbe8c' : '#2b774f',
    '--ok-soft': mix(dark ? '#5fbe8c' : '#2b774f', c.surface, 12),
    'color-scheme': dark ? 'dark' : 'light',
  };
}

// ---------- What the assistant may return ----------

const hex = z.string().regex(HEX);
export const ThemeColorsInput = z.object({ bg: hex, surface: hex, primary: hex, accent: hex, ink: hex, muted: hex });
export const CustomThemeInput = z.object({
  nameEn: z.string().trim().min(1).max(40),
  nameAr: z.string().trim().max(40).nullish().transform((v) => v || null),
  colors: ThemeColorsInput,
  font: z.enum(['sans', 'serif']).default('sans'),
  boldPrices: z.boolean().default(false),
});
export type CustomThemePayload = z.input<typeof CustomThemeInput>;

/** One message in a Theme assistant conversation, as the client keeps it. */
export type AssistantTurn =
  | { role: 'user'; text: string; photoId?: string | null }
  | { role: 'assistant'; text: string; options: Array<Pick<Theme, 'nameEn' | 'nameAr' | 'colors' | 'font' | 'boldPrices'> & { noteEn: string; noteAr: string }> };

export type AssistantOption = Extract<AssistantTurn, { role: 'assistant' }>['options'][number] & { contrast: ContrastReport; adjusted: boolean };

/** A theme as Menu themes lists it: whether the plan allows it, and how it reads. */
export type ThemeEntry = Theme & { allowed: boolean; contrast: ContrastReport };

/** GET /locations/:id/themes */
export type ThemesOverview = {
  plan: PlanId;
  /** What the owner picked; may be locked after a downgrade, in which case guests see `current`. */
  selectedRef: string;
  current: Theme;
  presets: ThemeEntry[];
  custom: ThemeEntry[];
  /** For the live preview. */
  brand: { nameEn: string; nameAr: string | null; taglineEn: string | null; taglineAr: string | null; logo: Photo | null };
  locations: number;
  canShare: boolean;
  canDesign: boolean;
  aiAvailable: boolean;
};
