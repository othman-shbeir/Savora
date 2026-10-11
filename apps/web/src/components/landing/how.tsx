import Image from 'next/image';
import type { ReactNode } from 'react';
import { fill } from '@savora/shared';
import type { Dictionary } from '@/app/[lang]/dictionaries';
import { cx } from '@/lib/cx';
import { Heading, Icon, Overline } from './parts';

type Text = Dictionary['landing'];
const card = 'rounded-[26px] border border-line bg-surface p-2.5 shadow-[0_10px_15px_rgb(36_36_36/0.06),0_1px_1px_rgb(36_36_36/0.04)]';

function StepMeta({ n, time, label }: { n: number; time: string; label: string }) {
  return (
    <p className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2">
        <span className="grid size-[30px] place-items-center rounded-full bg-brand-fill text-[13px] font-semibold text-white">0{n}</span>
        <span className="text-[11px] font-semibold tracking-[0.11em] text-brand uppercase rtl:tracking-normal">{fill(label, { n: `0${n}` })}</span>
      </span>
      <span className="flex items-center gap-1.5 text-[12px] text-muted">
        <Icon name="clock-muted" size={14} />
        {time}
      </span>
    </p>
  );
}

function Photo({ src, alt, children, className }: { src: string; alt: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('relative h-[300px] overflow-hidden rounded-[18px]', className)}>
      <Image src={src} alt={alt} fill sizes="(min-width: 1024px) 660px, 100vw" className="object-cover" />
      {children}
    </div>
  );
}

const overlay = 'absolute rounded-2xl border border-[#e7e7e7] bg-white shadow-[0_18px_23px_rgb(36_36_36/0.1),0_2px_3px_rgb(36_36_36/0.06)]';

/** "From a photo to a menu your place can own": three steps, each with a glimpse of the app. */
export function How({ l }: { l: Text }) {
  const [s1, s2, s3] = l.steps as [Text['steps'][number], Text['steps'][number], Text['steps'][number]];
  return (
    <section id="how" aria-labelledby="how-h" className="mx-auto max-w-[1240px] scroll-mt-6 px-5 pb-24 sm:px-8 lg:pb-[110px]">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Overline>{l.howOverline}</Overline>
          <Heading id="how-h" first={l.howTitle1} second={l.howTitle2} className="mt-3.5" />
        </div>
        <div className="max-w-[360px]">
          <p className="text-[15px] leading-[1.65] text-muted">{l.howLead}</p>
          <p className="mt-4 inline-flex h-[34.4px] items-center gap-2 rounded-full border border-line-2 bg-surface px-3.5 text-[12px] font-semibold text-ink">
            <Icon name="clock-red" size={14} />
            {l.howTime}
          </p>
        </div>
      </div>

      <ol className="mt-12 grid gap-5 lg:grid-cols-[674fr_482fr]">
        <li className={card}>
          <Photo src="/images/landing/menu-photo.jpg" alt={s1.alt}>
            <div className={cx(overlay, 'bottom-[18px] start-[18px] w-[268px] p-4')}>
              <p className="flex items-center gap-2.5">
                <span className="grid size-[30px] place-items-center rounded-full bg-[#e9f3ed]">
                  <Icon name="check-ok" size={15} />
                </span>
                <span>
                  <span className="block text-[13px] leading-[1.4] font-semibold text-[#242424]">{l.readTitle}</span>
                  <span className="block text-[12px] text-[#6b6b6b]">{l.readBody}</span>
                </span>
              </p>
              <span aria-hidden className="mt-3 block h-1.5 rounded-full bg-[#db1a1a]" />
            </div>
          </Photo>
          <div className="px-4 pt-[22px] pb-5">
            <StepMeta n={1} time={s1.time} label={l.stepLabel} />
            <h3 className="mt-4 text-[20px] leading-[1.35] font-semibold tracking-[-0.01em]">{s1.title}</h3>
            <p className="mt-2 max-w-[442px] text-[14px] leading-[1.6] text-muted">{s1.body}</p>
          </div>
        </li>
        <li className={card}>
          <Photo src="/images/landing/menu-editor.jpg" alt={s2.alt}>
            <div className={cx(overlay, 'bottom-[18px] start-[18px] w-[262px] px-4 pt-3 pb-2')}>
              <p className="flex items-center justify-between border-b border-[#e7e7e7] pb-1.5">
                <span className="text-[10px] font-semibold tracking-[0.1em] text-[#6b6b6b] uppercase">{l.editorLabel}</span>
                <span className="flex items-center gap-1 text-[10px] font-semibold text-[#8a6416]">
                  <Icon name="pencil-gold" size={12} />
                  {l.editorEditing}
                </span>
              </p>
              {[
                { en: 'Cardamom Latte', ar: 'لاتيه بالهيل', price: '₪20.00', on: true },
                { en: 'Spanish Latte', ar: 'لاتيه إسباني', price: '₪22.00', on: false },
              ].map((d, i) => (
                <div key={d.en} className={cx('flex items-center justify-between py-2.5', i === 0 && 'border-b border-dashed border-[#d8d8d8]')}>
                  <span>
                    <span className="block text-[13px] leading-[1.4] font-semibold text-[#242424]">{d.en}</span>
                    <span className="block font-arabic text-[12px] text-[#6b6b6b]">{d.ar}</span>
                  </span>
                  <span dir="ltr" className={cx('rounded-lg border px-2.5 py-1 text-[12px] font-semibold text-[#db1a1a]', d.on ? 'border-[#db1a1a] bg-[#fef3f3]' : 'border-[#d8d8d8]')}>
                    {d.price}
                  </span>
                </div>
              ))}
            </div>
          </Photo>
          <div className="px-4 pt-[22px] pb-5">
            <StepMeta n={2} time={s2.time} label={l.stepLabel} />
            <h3 className="mt-4 text-[20px] leading-[1.35] font-semibold tracking-[-0.01em]">{s2.title}</h3>
            <p className="mt-2 max-w-[402px] text-[14px] leading-[1.6] text-muted">{s2.body}</p>
          </div>
        </li>
        <li className={cx(card, 'grid gap-4 lg:col-span-2 lg:grid-cols-[477fr_668fr] lg:gap-2.5')}>
          <div className="flex flex-col justify-center px-4 py-6 lg:px-[18px]">
            <StepMeta n={3} time={s3.time} label={l.stepLabel} />
            <h3 className="mt-4 text-[24px] leading-[1.3] font-semibold tracking-[-0.015em]">{s3.title}</h3>
            <p className="mt-2 max-w-[384px] text-[15px] leading-[1.65] text-muted">{s3.body}</p>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
              {l.qrChecks.map((c) => (
                <li key={c} className="flex items-center gap-2 text-[12px] font-medium text-ink-2">
                  <span className="grid size-[22px] place-items-center rounded-full bg-brand-soft">
                    <Icon name="check-red-sm" size={12} />
                  </span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
          <Photo src="/images/landing/qr-table.jpg" alt={s3.alt}>
            <div className={cx(overlay, 'start-[18px] top-[18px] w-[203px] p-4')}>
              <span className="inline-flex h-[21px] items-center gap-1.5 rounded-full bg-[#e9f3ed] px-2.5 text-[10px] font-semibold text-[#2b774f]">
                <span className="size-1.5 rounded-full bg-current" />
                {l.statLive}
              </span>
              <div className="mt-2 flex items-end justify-between">
                <span>
                  <span className="block text-[28px] leading-[1.15] font-semibold text-[#242424]">37</span>
                  <span className="block text-[12px] text-[#6b6b6b]">{l.statLabel}</span>
                </span>
                <span aria-hidden className="flex h-10 items-end gap-1" dir="ltr">
                  {[14, 22, 18, 30, 26, 38, 34].map((h, i) => (
                    <span key={i} className={cx('w-2 rounded-[3px]', i === 5 ? 'bg-[#db1a1a]' : 'bg-[#faf1e0]')} style={{ height: h }} />
                  ))}
                </span>
              </div>
            </div>
          </Photo>
        </li>
      </ol>
    </section>
  );
}
