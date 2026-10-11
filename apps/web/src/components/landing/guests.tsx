import Image from 'next/image';
import type { ReactNode } from 'react';
import type { Dictionary } from '@/app/[lang]/dictionaries';
import { cx } from '@/lib/cx';
import { DishRow, Icon, LangPill, Overline, SAMPLE_EN } from './parts';

type Text = Dictionary['landing'];

/** A glass card on the dark panel. `link` draws the dashed connector towards the phone on wide screens. */
function Card({ icon, iconBg, overline, title, body, children, link }: { icon: ReactNode; iconBg: string; overline: string; title: string; body: string; children: ReactNode; link: 'end' | 'start' }) {
  return (
    <div className="relative rounded-[20px] border border-white/9 bg-white/4 p-[22px]">
      <span aria-hidden className={cx('absolute top-1/2 hidden h-px w-14 border-t border-dashed border-[rgb(217_164_65/0.55)] lg:block', link === 'end' ? 'start-full' : 'end-full')} />
      <span aria-hidden className={cx('absolute top-1/2 hidden size-2 -translate-y-1/2 rounded-full bg-[#d9a441] lg:block', link === 'end' ? 'start-[calc(100%+52px)]' : 'end-[calc(100%+52px)]')} />
      <p className="flex items-center gap-3">
        <span className={cx('grid size-10 place-items-center rounded-xl', iconBg)}>{icon}</span>
        <span className="text-[11px] font-semibold tracking-[0.11em] text-[#d9a441] uppercase rtl:tracking-normal">{overline}</span>
      </p>
      <h3 className="mt-4 text-[20px] leading-[1.35] font-semibold tracking-[-0.01em] text-[#f5f5f5]">{title}</h3>
      <p className="mt-1.5 text-[13px] leading-[1.55] text-[#a6a6a6]">{body}</p>
      <div className="mt-5 border-t border-white/9 pt-4">{children}</div>
    </div>
  );
}

/** "Guests never see the dashboard": the guest menu on a phone, between what makes it work. */
export function Guests({ l }: { l: Text }) {
  return (
    <section aria-labelledby="guests-h" className="mx-auto max-w-[1240px] px-5 pb-24 sm:px-8 lg:pb-[104px]">
      <div className="relative overflow-hidden rounded-[32px] bg-[#1c1c1c] px-5 pt-14 pb-12 sm:px-16 sm:pt-[72px] sm:pb-20">
        <span aria-hidden className="absolute top-[258px] left-1/2 size-[760px] -translate-x-1/2 rounded-full border border-white/6" />
        <span aria-hidden className="absolute top-[358px] left-1/2 size-[560px] -translate-x-1/2 rounded-full border border-dashed border-white/8" />
        <span aria-hidden className="absolute top-[438px] left-1/2 size-[400px] -translate-x-1/2 rounded-full bg-[rgb(219_26_26/0.1)]" />

        <div className="relative text-center">
          <Overline tone="gold" center>
            {l.guestsOverline}
          </Overline>
          <h2 id="guests-h" className="mx-auto mt-4 max-w-[700px] text-[clamp(30px,4vw,44px)] leading-[1.14] font-semibold tracking-[-0.025em] text-[#f5f5f5] rtl:leading-[1.35] rtl:tracking-normal">
            {l.guestsTitle}
            <span className="block text-[#ff4d4d]">{l.guestsAccent}</span>
          </h2>
        </div>

        <div className="relative mt-16 grid items-start gap-6 lg:grid-cols-[318px_1fr_318px] lg:gap-0">
          <div className="grid gap-6 lg:gap-[120px]">
            <Card icon={<Icon name="refresh-red" size={18} />} iconBg="bg-[rgb(255_77_77/0.14)]" overline={l.current.overline} title={l.current.title} body={l.current.body} link="end">
              <p className="flex items-center justify-between">
                <span className="flex h-[24.3px] items-center gap-1.5 rounded-full bg-[rgb(95_190_140/0.14)] ps-2.5 pe-3 text-[11px] font-semibold text-[#5fbe8c]">
                  <span className="size-1.5 rounded-full bg-current" />
                  {l.current.chip}
                </span>
                <span dir="ltr" className="text-[14px] font-semibold">
                  <span className="text-[#f5f5f5]">₪18</span> <span className="text-[#6e6e6e]">→</span> <span className="text-[#ff4d4d]">₪20</span>
                </span>
              </p>
            </Card>
            <Card icon={<Icon name="qr-red" size={18} />} iconBg="bg-[rgb(255_77_77/0.14)]" overline={l.yours.overline} title={l.yours.title} body={l.yours.body} link="end">
              <p className="flex items-center gap-3">
                <span className="grid size-[38px] place-items-center rounded-[9px] bg-[#f5f5f5]">
                  <Icon name="qr-ink-lg" size={26} />
                </span>
                <span>
                  <span className="block text-[12px] leading-[1.4] font-semibold text-[#f5f5f5]" dir="ltr">
                    saltandstem.menu
                  </span>
                  <span className="block text-[11px] text-[#969696]">{l.yours.printed}</span>
                </span>
              </p>
            </Card>
          </div>

          <Phone />

          <div className="grid gap-5 lg:mt-[134px]">
            <Card icon={<Icon name="globe-gold" size={18} />} iconBg="bg-[rgb(217_164_65/0.16)]" overline={l.local.overline} title={l.local.title} body={l.local.body} link="start">
              <span aria-hidden className="inline-flex items-center gap-4 rounded-full border border-white/9 bg-white/6 p-1 pe-4" dir="ltr">
                <span className="rounded-full bg-[#db1a1a] px-3.5 py-1.5 text-[12px] font-semibold text-white">{l.local.en}</span>
                <span className="font-arabic text-[12px] font-bold text-[#cfcfcf]">{l.local.ar}</span>
              </span>
            </Card>
            <p className="flex items-center gap-3 rounded-2xl border border-dashed border-white/9 px-4 py-3.5">
              <span className="grid size-8 place-items-center rounded-full bg-[rgb(95_190_140/0.14)]">
                <span className="size-2 rounded-full bg-[#5fbe8c]" />
              </span>
              <span>
                <span className="block text-[13px] leading-[1.4] font-semibold text-[#f5f5f5]">{l.liveTitle}</span>
                <span className="block text-[11px] text-[#969696]">{l.liveBody}</span>
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The guest menu on a phone. Always a light guest menu, whatever the page theme. */
function Phone() {
  return (
    <div aria-hidden lang="en" className="relative mx-auto w-[300px] rounded-[50px] border border-[#3a3a3a] bg-[#0b0b0b] p-2.5 shadow-[0_40px_90px_rgb(0_0_0/0.55)] lg:mt-2.5" dir="ltr">
      <div className="relative overflow-hidden rounded-[40px] bg-white pb-5">
        <span className="absolute top-[9px] left-1/2 h-[25px] w-[88px] -translate-x-1/2 rounded-full bg-[#0b0b0b]" />
        <div className="flex h-10 items-end justify-between px-6 pb-0.5">
          <span className="text-[13px] font-semibold text-[#242424]">9:41</span>
          <span className="h-[9px] w-4 rounded-[2px] border border-[#242424]" />
        </div>
        <div className="relative mx-3 mt-2 h-[150px] overflow-hidden rounded-[24px]">
          <Image src="/images/landing/cardamom-latte.jpg" alt="" fill sizes="255px" className="object-cover" />
          <span className="absolute bottom-3 left-3 flex h-[23px] items-center gap-1.5 rounded-full bg-white px-2.5 text-[10px] font-semibold text-[#242424]">
            <span className="size-1.5 rounded-full bg-[#2b774f]" />
            Open now
          </span>
        </div>
        <div className="flex items-center gap-3 px-[18px] pt-6 pb-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full border border-[#db1a1a] text-[14px] font-bold text-[#db1a1a]">S</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[18px] leading-[1.4] font-semibold text-[#242424]">Salt &amp; Stem</span>
            <span className="block text-[11px] leading-[1.45] text-[#6b6b6b]">Good coffee, slow mornings.</span>
          </span>
          <LangPill active="en" />
        </div>
        <div className="flex gap-1.5 px-[18px]">
          <span className="rounded-full border border-[#db1a1a] bg-[#fef3f3] px-3 py-1 text-[12px] font-semibold text-[#db1a1a]">Coffee</span>
          <span className="rounded-full border border-[#d8d8d8] px-3 py-1 text-[12px] font-semibold text-[#6b6b6b]">Bites</span>
          <span className="rounded-full border border-[#d8d8d8] px-3 py-1 text-[12px] font-semibold text-[#6b6b6b]">Cold</span>
        </div>
        <div className="mx-[18px] mt-3 flex justify-between border-b border-[#e7e7e7] pt-2 pb-1.5">
          <span className="text-[10px] font-semibold tracking-[0.1em] text-[#db1a1a] uppercase">House favorites</span>
          <span className="font-arabic text-[11px] text-[#6b6b6b]">المفضلة لدينا</span>
        </div>
        <div className="px-[18px]">
          {SAMPLE_EN.map((d, i) => (
            <DishRow key={d.name} dish={d} last={i === SAMPLE_EN.length - 1} />
          ))}
        </div>
        <p className="mt-2 text-center text-[11px] text-[#6b6b6b]">
          A live menu by <strong className="font-semibold text-[#db1a1a]">Savora</strong>
        </p>
      </div>
    </div>
  );
}
