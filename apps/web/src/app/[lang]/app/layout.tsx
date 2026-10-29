import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import { requireWorkspace } from '@/lib/workspace';
import { getDictionary, getLocale } from '../dictionaries';

/** Private: kept out of search results even if a link to it is shared. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** The sidebar is drawn here, once, so moving between workspace pages only swaps the page beside it
 *  (and shows that page's loading screen at once) instead of redrawing the whole screen. Changes
 *  that rename things in it call router.refresh(), which re-renders this layout too. */
export default async function Layout({ children }: LayoutProps<'/[lang]/app'>) {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const { shell } = await requireWorkspace(locale);
  return (
    <AppShell t={t} locale={locale} workspace={shell}>
      {children}
    </AppShell>
  );
}
