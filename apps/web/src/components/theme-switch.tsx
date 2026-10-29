'use client';

import { useSyncExternalStore } from 'react';
import { Segmented } from './ui/segmented';

type Mode = 'system' | 'light' | 'dark';

// The source of truth is the data-theme attribute on <html> (rendered by the layout from a cookie),
// so the control reads it directly instead of copying it into state.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}
function readMode(): Mode {
  const t = document.documentElement.getAttribute('data-theme');
  return t === 'light' || t === 'dark' ? t : 'system';
}

const icon = (d: React.ReactNode) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);
const ICONS = {
  light: icon(
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>,
  ),
  dark: icon(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />),
  system: icon(
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>,
  ),
};

/** Light / Dark / System. "System" removes the override so the OS setting applies. `compact`
 *  shows icons (named for screen readers and on hover), to sit in page headers. */
export function ThemeSwitch({ labels, compact }: { labels: { theme: string; light: string; dark: string; system: string }; compact?: boolean }) {
  const mode = useSyncExternalStore(subscribe, readMode, () => 'system' as Mode);

  function apply(next: string) {
    const root = document.documentElement;
    if (next === 'light' || next === 'dark') root.setAttribute('data-theme', next);
    else root.removeAttribute('data-theme');
    // A cookie rather than localStorage, so the server renders the next page in this theme.
    document.cookie =
      next === 'light' || next === 'dark' ? `savora-theme=${next}; path=/; max-age=31536000; samesite=lax` : 'savora-theme=; path=/; max-age=0; samesite=lax';
  }

  return (
    <Segmented
      label={labels.theme}
      value={mode}
      onChange={apply}
      options={[
        { value: 'light', label: labels.light, icon: compact ? ICONS.light : undefined },
        { value: 'dark', label: labels.dark, icon: compact ? ICONS.dark : undefined },
        { value: 'system', label: labels.system, icon: compact ? ICONS.system : undefined },
      ]}
    />
  );
}
