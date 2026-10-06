import type { Metadata } from 'next';
import { Poppins, Tajawal } from 'next/font/google';
import { cookies } from 'next/headers';
import { dirOf, LOCALES } from '@savora/shared';
import { getDictionary, getLocale } from './dictionaries';
import '../globals.css';

const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-poppins', display: 'swap' });
const tajawal = Tajawal({ subsets: ['arabic'], weight: ['400', '500', '700', '800'], variable: '--font-tajawal', display: 'swap' });

/** Set by the theme switch and read here, so pages arrive already themed: no light flash for
 *  dark-mode users, and no inline script (React warns whenever the root layout re-renders one). */
const THEME_COOKIE = 'savora-theme';

export async function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: { default: t.meta.title, template: `%s · ${t.meta.title}` }, description: t.meta.description };
}

export default async function RootLayout({ children }: LayoutProps<'/[lang]'>) {
  const locale = await getLocale();
  const saved = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = saved === 'light' || saved === 'dark' ? saved : undefined;
  return (
    <html lang={locale} dir={dirOf(locale)} data-theme={theme} className={`${poppins.variable} ${tajawal.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
