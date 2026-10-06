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

/** Light / Dark / System. "System" removes the override so the OS setting applies. */
export function ThemeSwitch({ labels }: { labels: { theme: string; light: string; dark: string; system: string } }) {
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
        { value: 'light', label: labels.light },
        { value: 'dark', label: labels.dark },
        { value: 'system', label: labels.system },
      ]}
    />
  );
}
