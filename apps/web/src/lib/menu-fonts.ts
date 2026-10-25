import { Amiri, Baloo_Bhaijaan_2, Playfair_Display, Reem_Kufi } from 'next/font/google';

// Heading typefaces a menu theme can pick (ThemeFont in @savora/shared). Each covers Latin and
// Arabic. Nothing is preloaded: the browser downloads a font only when a menu's headings use it,
// so a guest menu in the default theme loads none of these.
const playfair = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-playfair', display: 'swap', preload: false });
const amiri = Amiri({ subsets: ['arabic'], weight: ['700'], variable: '--font-amiri', display: 'swap', preload: false });
const baloo = Baloo_Bhaijaan_2({ subsets: ['arabic', 'latin'], weight: ['600', '700'], variable: '--font-baloo', display: 'swap', preload: false });
const reemKufi = Reem_Kufi({ subsets: ['arabic', 'latin'], weight: ['600', '700'], variable: '--font-reem-kufi', display: 'swap', preload: false });

/** Class names that define the font variables; put them on the element that carries data-menu-font. */
export const menuFontVars = [playfair, amiri, baloo, reemKufi].map((f) => f.variable).join(' ');
