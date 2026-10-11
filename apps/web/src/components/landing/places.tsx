import Image from 'next/image';
import Link from 'next/link';
import type { Dictionary } from '@/app/[lang]/dictionaries';
import { cx } from '@/lib/cx';
import { Heading, Overline } from './parts';

type Text = Dictionary['landing'];
type Tile = { key: keyof Text['places']; src: string; area: string; big?: boolean };

// Grid areas mirror the Figma mosaic: the room tall on the left, two rows of photos beside it.
const TILES: Tile[] = [
  { key: 'room', src: '/images/landing/room.jpg', area: 'lg:col-start-1 lg:row-span-2 col-span-2 lg:col-span-1 h-[420px] lg:h-auto', big: true },
  { key: 'light', src: '/images/landing/cardamom-latte.jpg', area: 'lg:col-start-2 lg:row-start-1 col-span-2 sm:col-span-1' },
  { key: 'flatWhite', src: '/images/landing/flat-white.jpg', area: 'lg:col-start-3 lg:col-span-2 lg:row-start-1' },
  { key: 'plate', src: '/images/landing/honey-toast.jpg', area: 'lg:col-start-2 lg:row-start-2' },
  { key: 'tartine', src: '/images/landing/pistachio-tartine.jpg', area: 'lg:col-start-3 lg:row-start-2' },
  { key: 'cake', src: '/images/landing/cardamom-cake.jpg', area: 'lg:col-start-4 lg:row-start-2' },
];

/** "The room, the plate, the light.": six photos from one place, all on one live menu. */
export function Places({ l, exampleHref }: { l: Text; exampleHref: string | null }) {
  return (
    <section id="examples" aria-labelledby="places-h" className="mx-auto max-w-[1240px] scroll-mt-6 px-5 pb-24 sm:px-8 lg:pb-[100px]">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Overline>{l.placesOverline}</Overline>
          <Heading id="places-h" first={l.placesTitle1} second={l.placesTitle2} inline className="mt-3.5" />
          <p className="mt-3 max-w-[450px] text-[15px] leading-[1.65] text-muted">{l.placesLead}</p>
        </div>
        {exampleHref && (
          <Link href={exampleHref} className="inline-flex h-[43.8px] items-center gap-2.5 rounded-xl border border-line-2 bg-surface px-[18px] text-[14px] font-semibold text-ink transition-colors hover:border-ink">
            {l.placesCta}
            <span aria-hidden className="text-brand rtl:-scale-x-100">
              →
            </span>
          </Link>
        )}
      </div>

      <ul className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-[480.7fr_282fr_182.7fr_182.7fr] lg:grid-rows-[300px_300px]">
        {TILES.map(({ key, src, area, big }) => {
          const p = l.places[key] as { tag?: string; title: string; kind: string; alt: string; onMenu?: string };
          return (
            <li key={key} className={cx('relative h-[260px] overflow-hidden rounded-[22px] lg:h-auto', area)}>
              <Image src={src} alt={p.alt} fill sizes={big ? '(min-width: 1024px) 480px, 100vw' : '(min-width: 1024px) 380px, 50vw'} className="object-cover" />
              <span aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgb(0_0_0/0.62))]" />
              {p.tag && (
                <span className="absolute start-4 top-4 flex h-[28.3px] items-center gap-2 rounded-full bg-white/92 ps-3 pe-3.5 text-[11px] font-semibold tracking-[0.01em] text-[#242424]">
                  <span className="size-1.5 rounded-full bg-[#db1a1a]" />
                  {p.tag}
                </span>
              )}
              {key === 'light' ? (
                <div className="absolute inset-x-3.5 bottom-3.5 rounded-2xl bg-white px-3.5 py-3 shadow-[0_12px_15px_rgb(0_0_0/0.25)]">
                  <p className="flex justify-between gap-2 text-[13px] leading-[1.4] font-semibold text-[#242424]">
                    {p.title}
                    <span dir="ltr" className="text-[12px] text-[#db1a1a]">
                      ₪20.00
                    </span>
                  </p>
                  <p className="mt-0.5 flex justify-between gap-2 text-[11px] text-[#6b6b6b]">
                    {p.kind}
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.02em] text-[#2b774f]">
                      <span className="size-1.5 rounded-full bg-current" />
                      {p.onMenu}
                    </span>
                  </p>
                </div>
              ) : (
                <div className="absolute inset-x-[18px] bottom-4">
                  <p className={cx('leading-[1.4] font-semibold text-white', big ? 'text-[20px]' : 'text-[14px]')}>{p.title}</p>
                  <p className="mt-1 text-[10px] font-semibold tracking-[0.1em] text-white/80 uppercase rtl:tracking-normal">{p.kind}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-4 flex flex-wrap justify-between gap-2 text-[12px] text-muted">
        <span>{l.placesCaption}</span>
        <span className="text-[11px]">{l.photoCredit}</span>
      </p>
    </section>
  );
}
