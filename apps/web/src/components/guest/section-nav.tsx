'use client';

import { useEffect, useRef, useState } from 'react';
import { cx } from '@/lib/cx';

/** Sticky category chips. The chip for the section being read lights up, and stays in view. */
export function SectionNav({ sections, label }: { sections: Array<{ id: string; label: string }>; label: string }) {
  const [active, setActive] = useState(sections[0]?.id);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    // The section being read is the last one whose top has passed under the sticky bar. At the
    // very bottom the last section wins, even when it is too short to reach the bar.
    let frame = 0;
    const update = () => {
      frame = 0;
      const bar = 88;
      let current = sections[0]?.id;
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= bar) current = s.id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = sections.at(-1)?.id ?? current;
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [sections]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-id="${active}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  if (sections.length < 2) return null;
  return (
    <nav aria-label={label} className="sticky top-0 z-20 -mx-5 mt-5 border-b border-line bg-surface/95 px-5 py-3 backdrop-blur">
      <ul ref={listRef} className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
        {sections.map((s) => (
          <li key={s.id} data-id={s.id} className="shrink-0">
            <a
              href={`#${s.id}`}
              aria-current={active === s.id ? 'true' : undefined}
              className={cx(
                'inline-flex h-9 items-center rounded-[var(--r-pill,9999px)] border px-4 text-body-s font-semibold whitespace-nowrap transition-colors',
                active === s.id ? 'border-brand bg-brand-fill text-[var(--on-brand,#fff)]' : 'border-line-2 bg-surface text-ink-2 hover:border-ink',
              )}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
