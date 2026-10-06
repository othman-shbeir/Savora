import type { ComponentProps } from 'react';
import { cx } from '@/lib/cx';

export function Card({ className, ...rest }: ComponentProps<'section'>) {
  return <section className={cx('rounded-[20px] border border-line bg-surface shadow-card', className)} {...rest} />;
}

/** Small uppercase label above a heading, like "SCAN ACTIVITY". */
export function Overline({ className, ...rest }: ComponentProps<'p'>) {
  return <p className={cx('text-overline font-semibold tracking-[0.11em] text-brand uppercase', className)} {...rest} />;
}
