import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cx } from '@/lib/cx';

type Variant = 'primary' | 'secondary' | 'dark' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-[11px] font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45';
const variants: Record<Variant, string> = {
  primary: 'bg-brand-fill text-white shadow-[0_10px_22px_rgb(219_26_26/0.22)] hover:bg-brand-fill-hover',
  secondary: 'border border-line-2 bg-surface text-ink hover:bg-surface-2',
  dark: 'bg-ink text-surface hover:opacity-90',
  ghost: 'text-ink-2 hover:bg-surface-2',
};
const sizes: Record<Size, string> = { sm: 'h-9 px-3 text-caption', md: 'h-10 px-4 text-body-s', lg: 'h-12 px-5 text-body-m' };

type Common = { variant?: Variant; size?: Size; icon?: ReactNode };

export function Button({ variant = 'primary', size = 'md', icon, className, children, ...rest }: Common & ComponentProps<'button'>) {
  return (
    <button className={cx(base, variants[variant], sizes[size], className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = 'primary', size = 'md', icon, className, children, ...rest }: Common & ComponentProps<typeof Link>) {
  return (
    <Link className={cx(base, variants[variant], sizes[size], className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
