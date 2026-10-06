'use client';

import { useState } from 'react';
import { cx } from '@/lib/cx';

/** On/off switch. Uncontrolled with defaultChecked, or controlled with checked + onChange. */
export function Switch({
  label,
  checked,
  defaultChecked = false,
  disabled,
  onChange,
}: {
  label: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onChange?: (on: boolean) => void;
}) {
  const [own, setOwn] = useState(defaultChecked);
  const on = checked ?? own;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        if (checked === undefined) setOwn(!on);
        onChange?.(!on);
      }}
      className={cx('relative inline-flex h-[22px] w-[38px] shrink-0 rounded-full transition-colors disabled:opacity-50', on ? 'bg-ok' : 'bg-line-2')}
    >
      <span className={cx('absolute top-[3px] size-4 rounded-full bg-white shadow transition-[inset-inline-start]', on ? 'start-[19px]' : 'start-[3px]')} />
    </button>
  );
}
