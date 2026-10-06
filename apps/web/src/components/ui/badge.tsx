import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

type Tone = 'ok' | 'gold' | 'brand' | 'neutral';
const tones: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok',
  gold: 'bg-gold-soft text-gold',
  brand: 'bg-brand-soft text-brand',
  neutral: 'border border-line bg-surface-2 text-muted',
};

/** Status is never colour alone: every badge carries a word, and a dot for scanning. */
export function Badge({ tone = 'neutral', dot = true, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption leading-none font-semibold whitespace-nowrap', tones[tone], className)}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
