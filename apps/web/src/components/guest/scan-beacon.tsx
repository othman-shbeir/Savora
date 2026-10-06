'use client';

import { useEffect, useRef } from 'react';
import type { Locale } from '@savora/shared';

/** Tells Savora the menu was opened, once per page load, from a real browser. No cookies, no
 *  identifiers: the API counts it and keeps no record of who it was. */
export function ScanBeacon({ slug, locale }: { slug: string; locale: Locale }) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return; // development mode runs effects twice
    sent.current = true;
    const url = new URL(window.location.href);
    const source = url.searchParams.get('s') === 'qr' ? 'qr' : 'link';
    fetch('/api/public/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, source, lang: locale }),
      keepalive: true,
    }).catch(() => {});
    // A guest who shares the page passes on a clean link, counted as a link, not as a scan.
    if (url.searchParams.has('s')) {
      url.searchParams.delete('s');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
  }, [slug, locale]);

  return null;
}
