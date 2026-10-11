import Image from 'next/image';
import Link from 'next/link';
import type { Dictionary } from '@/app/[lang]/dictionaries';
import { DishRow, Icon, LangPill, SAMPLE_AR, SAMPLE_EN } from './parts';

type Text = Dictionary['landing'];

/** "Your menu, with a point of view." with the two sample menus (Arabic behind, English in front). */
export function Hero({ l, start, startLabel, exampleHref }: { l: Text; start: string; startLabel: string; exampleHref: string | null }) {
  return (
    <section aria-labelledby="hero-h" className="mx-auto grid max-w-[1240px] items-center gap-12 px-5 pt-14 pb-20 sm:px-8 lg:grid-cols-[minmax(0,1fr)_580px] lg:gap-6 lg:pt-[76px] lg:pb-[108px]">
      <div>
        <p className="inline-flex h-[34.6px] items-center gap-2.5 rounded-full border border-line bg-surface ps-2 pe-3.5">
          <span dir="ltr" className="rounded-full bg-brand-soft px-2 py-[3px] text-[10px] leading-[1.3] font-semibold tracking-[0.02em] text-brand">
            EN + <span className="font-arabic font-bold">عربي</span>
          </span>
          <span className="text-caption font-medium text-ink-2">{l.badge}</span>
        </p>
        <h1 id="hero-h" className="mt-6 max-w-[520px] text-[clamp(44px,5vw,64px)] leading-[1.08] font-bold tracking-[-0.03em] text-ink rtl:leading-[1.25] rtl:tracking-normal">
          {l.title1}
          <span className="block max-w-[380px] text-brand rtl:max-w-none">{l.title2}</span>
        </h1>
        <p className="mt-5 max-w-[480px] text-[17px] leading-[1.7] text-muted">{l.lead}</p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link href={start} className="inline-flex h-[49.5px] items-center gap-2.5 rounded-xl bg-brand-fill px-6 text-[15px] font-semibold text-white shadow-[0_10px_13px_rgb(219_26_26/0.26)] transition-colors hover:bg-brand-fill-hover">
            {startLabel}
            <Icon name="arrow-white" size={16} className="rtl:-scale-x-100" />
          </Link>
          {exampleHref && (
            <Link href={exampleHref} className="inline-flex h-[53.6px] items-center gap-2.5 rounded-xl border border-line-2 bg-surface ps-5 pe-6 text-[15px] font-semibold text-ink transition-colors hover:border-ink">
              <span className="grid size-[22px] place-items-center rounded-full bg-brand-soft">
                <Icon name="play-red" size={9} className="rtl:-scale-x-100" />
              </span>
              {l.ctaExample}
            </Link>
          )}
        </div>
        <div className="mt-10 flex max-w-[480px] items-center gap-3.5 border-t border-line pt-6">
          <span aria-hidden className="flex" dir="ltr">
            <span className="grid size-[30px] place-items-center rounded-full border-[1.6px] border-bg bg-ink font-arabic text-[11px] font-bold text-bg">ن</span>
            <span className="-ms-2 grid size-[30px] place-items-center rounded-full border-[1.6px] border-bg bg-brand-fill text-[11px] font-bold text-white">A</span>
            <span className="-ms-2 grid size-[30px] place-items-center rounded-full border-[1.6px] border-bg bg-[#d9a441] font-arabic text-[11px] font-bold text-[#242424]">س</span>
          </span>
          <span className="text-[13px] leading-[1.55] text-muted">{l.audience}</span>
        </div>
      </div>

      {/* The composition from the design, at its exact size; scaled down as a whole on phones. */}
      <div aria-hidden className="relative mx-auto h-[340px] w-[352px] sm:h-[560px] sm:w-[580px]">
        <div className="absolute top-0 left-0 h-[560px] w-[580px] origin-top-left scale-[0.607] sm:scale-100" dir="ltr">
          <span className="absolute top-[4px] left-[20px] size-[540px] rounded-full border border-dashed border-line-2" />
          <span className="absolute top-[54px] left-[70px] size-[440px] rounded-full bg-brand-soft" />

          {/* Arabic menu, behind */}
          <div dir="rtl" lang="ar" className="absolute top-[8px] left-[300px] w-[280px] rounded-[24px] border border-[#e7e7e7] bg-white px-[18px] pt-[18px] pb-1 shadow-[0_18px_23px_rgb(36_36_36/0.1),0_2px_3px_rgb(36_36_36/0.06)]">
            <div className="flex items-center justify-between">
              <span className="font-arabic text-[18px] leading-[1.4] font-bold text-[#242424]">سولت آند ستيم</span>
              <LangPill active="ar" />
            </div>
            <p className="font-arabic text-[12px] text-[#6b6b6b]">قهوة جيدة، صباحات هادئة</p>
            <div className="mt-3.5 flex justify-between border-b border-[#e7e7e7] pb-1.5 font-arabic">
              <span className="text-[12px] font-bold text-[#db1a1a]">المفضلة لدينا</span>
              <span className="text-[11px] text-[#6b6b6b]">٣ أصناف</span>
            </div>
            {SAMPLE_AR.map((d, i) => (
              <DishRow key={d.name} dish={d} dir="rtl" last={i === SAMPLE_AR.length - 1} />
            ))}
          </div>

          {/* English menu, in front */}
          <div lang="en" className="absolute top-[80px] left-[40px] w-[300px] rounded-[26px] border border-[#e7e7e7] bg-white p-2.5 pb-3 shadow-[0_18px_23px_rgb(36_36_36/0.1),0_2px_3px_rgb(36_36_36/0.06)]">
            <div className="relative h-[120px] overflow-hidden rounded-[18px]">
              <Image src="/images/landing/room.jpg" alt="" fill sizes="280px" className="object-cover" priority />
              <span className="absolute top-2.5 left-2.5 flex h-[23px] items-center gap-1.5 rounded-full bg-white px-2.5 text-[10px] font-semibold tracking-[0.02em] text-[#242424]">
                <span className="size-1.5 rounded-full bg-[#db1a1a]" />
                saltandstem.menu
              </span>
            </div>
            <div className="mt-3.5 flex items-center gap-2.5 px-2.5">
              <span className="grid size-[34px] shrink-0 place-items-center rounded-full border border-[#db1a1a] text-[12px] font-bold text-[#db1a1a]">S&amp;S</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] leading-[1.45] font-semibold text-[#242424]">Salt &amp; Stem</span>
                <span className="block text-[11px] leading-[1.45] text-[#6b6b6b]">Good coffee, slow mornings.</span>
              </span>
              <LangPill active="en" />
            </div>
            <div className="mx-2.5 mt-3.5 flex items-baseline justify-between border-b border-[#e7e7e7] pb-1">
              <span className="text-[10px] font-semibold tracking-[0.1em] text-[#db1a1a] uppercase">House favorites</span>
              <span className="text-[11px] text-[#6b6b6b]">03</span>
            </div>
            <div className="px-2.5">
              {SAMPLE_EN.map((d, i) => (
                <DishRow key={d.name} dish={d} last={i === SAMPLE_EN.length - 1} />
              ))}
            </div>
            <p className="mt-1 text-center text-[11px] text-[#6b6b6b]">
              A live menu by <strong className="font-semibold text-[#db1a1a]">Savora</strong>
            </p>
          </div>

          <div className="absolute top-[2px] left-0 flex h-[56px] items-center gap-2.5 rounded-2xl border border-line bg-surface ps-2.5 pe-4 shadow-[0_18px_23px_rgb(36_36_36/0.1),0_2px_3px_rgb(36_36_36/0.06)]">
            <span className="grid size-[30px] place-items-center rounded-[9px] bg-[#d9a441]">
              <Icon name="check-ink" size={14} />
            </span>
            <span>
              <span className="block text-[13px] leading-[1.4] font-semibold text-ink">{l.chipReadyTitle}</span>
              <span className="block text-[11px] leading-[1.45] text-muted">{l.chipReadyBody}</span>
            </span>
          </div>

          <div className="absolute top-[464px] left-[315px] flex h-[64px] items-center gap-3 rounded-[18px] bg-[#1c1c1c] ps-3 pe-4 shadow-[0_18px_20px_rgb(28_28_28/0.3)]">
            <span className="grid size-10 place-items-center rounded-[10px] bg-white">
              <Icon name="qr-ink" size={24} />
            </span>
            <span>
              <span className="block text-[13px] leading-[1.4] font-semibold text-[#f5f5f5]">{l.chipQrTitle}</span>
              <span className="block text-[12px] leading-[1.5] text-[#a6a6a6]">{l.chipQrBody}</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
