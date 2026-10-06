'use client';

import { useRef, useState } from 'react';
import { cx } from '@/lib/cx';

type Option = { value: string; label: string };

/** A single-choice control announced as a radio group. Arrow keys move between options
 *  and follow the reading direction, so in Arabic the left arrow moves forward. */
export function Segmented({
  options,
  value,
  defaultValue,
  onChange,
  label,
}: {
  options: Option[];
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  label: string;
}) {
  const [inner, setInner] = useState(defaultValue ?? options[0]?.value);
  const group = useRef<HTMLDivElement>(null);
  const current = value ?? inner;
  const select = (v: string) => {
    setInner(v);
    onChange?.(v);
  };

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, i: number) {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let step = keys[e.key];
    if (!step) return;
    e.preventDefault();
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && getComputedStyle(e.currentTarget).direction === 'rtl') step = -step;
    const n = (i + step + options.length) % options.length;
    const next = options[n];
    if (!next) return;
    select(next.value);
    (group.current?.children[n] as HTMLElement | undefined)?.focus();
  }

  return (
    <div ref={group} role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-line bg-surface-2 p-[3px]">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={current === o.value}
          tabIndex={current === o.value ? 0 : -1}
          onClick={() => select(o.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
          className={cx(
            'rounded-full px-3.5 py-1.5 text-caption font-semibold transition-colors',
            current === o.value ? 'bg-surface text-ink shadow-[0_1px_3px_rgb(36_36_36/0.12)]' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
