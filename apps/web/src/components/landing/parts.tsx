/* eslint-disable @next/next/no-img-element -- small fixed-size SVG icons exported from the Figma file */
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

/** An icon exported from the landing frame in Figma, at its design size. */
export const Icon = ({ name, size, className }: { name: string; size: number; className?: string }) => (
  <img src={`/images/landing/icons/${name}.svg`} width={size} height={size} alt="" aria-hidden className={cx('shrink-0', className)} />
);

/** "—— PLACES ON SAVORA": a short rule and an uppercase label. */
export function Overline({ children, tone = 'brand', center = false, className }: { children: ReactNode; tone?: 'brand' | 'gold'; center?: boolean; className?: string }) {
  const color = tone === 'gold' ? 'text-[#d9a441]' : 'text-brand';
  return (
    <p className={cx('flex items-center gap-2.5 text-[11px] leading-[1.35] font-semibold tracking-[0.11em] uppercase', color, center && 'justify-center', className)}>
      <span aria-hidden className="h-px w-[26px] bg-current" />
      {children}
      {center && <span aria-hidden className="h-px w-[26px] bg-current" />}
    </p>
  );
}

/** Section headings: 44px, two tones, as in every landing section of the design. */
export function Heading({ id, first, second, className, inline = false }: { id?: string; first: string; second: string; className?: string; inline?: boolean }) {
  return (
    <h2 id={id} className={cx('text-[clamp(32px,4vw,44px)] leading-[1.14] font-semibold tracking-[-0.025em] text-ink rtl:leading-[1.3] rtl:tracking-normal', className)}>
      {first}
      {inline ? ' ' : <br />}
      <span className="text-brand">{second}</span>
    </h2>
  );
}

/** The EN/ع switch drawn inside the sample menus. */
export function LangPill({ active }: { active: 'en' | 'ar' }) {
  return (
    <span aria-hidden className="inline-flex h-[26.6px] shrink-0 items-center gap-1.5 rounded-full border border-[#d8d8d8] p-[3px] pe-2.5 text-[10px] leading-none font-semibold tracking-[0.02em]" dir="ltr">
      {active === 'en' ? (
        <>
          <span className="rounded-full bg-[#db1a1a] px-2 py-[4.5px] text-white">EN</span>
          <span className="font-arabic text-[#6b6b6b]">ع</span>
        </>
      ) : (
        <>
          <span className="rounded-full bg-[#db1a1a] px-2 py-[4.5px] font-arabic text-white">ع</span>
          <span className="text-[#6b6b6b]">EN</span>
        </>
      )}
    </span>
  );
}

export type Dish = { name: string; desc: string; price: string };

/** Sample dishes shown in the mock menus; real menus come from the API. */
export const SAMPLE_EN: Dish[] = [
  { name: 'Cardamom Latte', desc: 'Espresso, steamed milk, green cardamom', price: '₪20.00' },
  { name: 'Spanish Latte', desc: 'Cold brew, milk, sweet condensed milk', price: '₪22.00' },
  { name: 'Labneh Toast', desc: 'Whipped labneh, za’atar, olive oil', price: '₪25.00' },
];
export const SAMPLE_AR: Dish[] = [
  { name: 'لاتيه بالهيل', desc: 'إسبريسو، حليب مبخر، هيل أخضر', price: '₪20.00' },
  { name: 'لاتيه إسباني', desc: 'قهوة باردة، حليب مكثف محلى', price: '₪22.00' },
  { name: 'توست لبنة', desc: 'لبنة مخفوقة، زعتر، زيت زيتون', price: '₪25.00' },
];

/** One dish row of a mock menu: name and description, price at the end. Always light, like a guest menu. */
export function DishRow({ dish, last, dir = 'ltr', compact = false }: { dish: Dish; last?: boolean; dir?: 'ltr' | 'rtl'; compact?: boolean }) {
  return (
    <div dir={dir} className={cx('flex justify-between gap-3', compact ? 'py-2' : 'pt-2.5 pb-3', !last && 'border-b border-dashed border-[#d8d8d8]')}>
      <span className="min-w-0">
        <span className={cx('block text-[13px] leading-[1.4] font-semibold text-[#242424]', dir === 'rtl' && 'font-arabic font-bold')}>{dish.name}</span>
        {!compact && <span className={cx('mt-0.5 block text-[11px] leading-[1.45] text-[#6b6b6b]', dir === 'rtl' && 'font-arabic')}>{dish.desc}</span>}
      </span>
      <span dir="ltr" className="shrink-0 text-[12px] leading-[1.4] font-semibold text-[#db1a1a]">
        {dish.price}
      </span>
    </div>
  );
}
