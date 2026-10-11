import type { Metadata } from 'next';

/** Private: kept out of search results even if a link to it is shared. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: LayoutProps<'/[lang]/auth'>) {
  return children;
}
