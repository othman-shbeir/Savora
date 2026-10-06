'use client';

import { useRouter } from 'next/navigation';
import type { LocationOption } from '@/lib/workspace';

/** Picks which location the workspace shows. The choice is remembered in a cookie for a year. */
export function LocationSwitcher({ options, current, label, pausedLabel }: { options: LocationOption[]; current?: string; label: string; pausedLabel: string }) {
  const router = useRouter();
  return (
    <select
      aria-label={label}
      value={current}
      onChange={(e) => {
        document.cookie = `savora_loc=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
      className="mt-2.5 h-10 w-full rounded-[10px] border border-line-2 bg-surface px-2.5 text-body-s"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
          {o.paused ? ` · ${pausedLabel}` : ''}
        </option>
      ))}
    </select>
  );
}
