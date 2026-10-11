'use client';

/* eslint-disable @next/next/no-img-element -- photos are pre-sized WebP files from the API */
import Link from 'next/link';
import { useState } from 'react';
import type { Locale, PublicTour } from '@savora/shared';
import { formatPrice } from '@savora/shared/format';
import type { Dictionary } from '@/app/[lang]/dictionaries';
import { cx } from '@/lib/cx';
import { plural } from '@/lib/plural';
import { duration, TourViewer, useTourPlayer } from './tour-viewer';

type Text = Dictionary['guest'];
type Spot = PublicTour['scenes'][number]['spots'][number];

const pick = (en: string | null, ar: string | null, locale: Locale) => (locale === 'ar' ? (ar ?? en) : (en ?? ar)) ?? '';

/** The walk-through guests open from the menu: full screen, scene by scene, with tappable spots. */
export function GuestTour({
  tour,
  t,
  locale,
  menuHref,
  otherHref,
  onClose,
}: {
  tour: PublicTour;
  t: Text;
  locale: Locale;
  /** Back to the menu; dish links add the dish's anchor. */
  menuHref: string;
  /** The same tour in the other language (absent in the owner's preview). */
  otherHref?: string;
  /** In the owner's preview, closes it instead of leaving the page. */
  onClose?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState<Spot | null>(null);
  const player = useTourPlayer(tour.scenes, index, setIndex);
  const scene = tour.scenes[index]!;
  const name = pick(tour.name.en, tour.name.ar, locale);
  const sceneName = (s: PublicTour['scenes'][number], i: number) => pick(s.nameEn, s.nameAr, locale) || `${i + 1}`;
  const spotLabel = (s: Spot) => pick(s.labelEn, s.labelAr, locale) || (s.dish ? pick(s.dish.nameEn, s.dish.nameAr, locale) : '') || (s.kind === 'scene' ? sceneName(tour.scenes.find((x) => x.id === s.targetSceneId)!, tour.scenes.findIndex((x) => x.id === s.targetSceneId)) : '');
  const go = (i: number) => {
    setOpen(null);
    setIndex(i);
  };

  const back = onClose ? (
    <button type="button" onClick={onClose} aria-label={t.backToMenu} className={glassButton}>
      <BackIcon />
    </button>
  ) : (
    <Link href={menuHref} aria-label={t.backToMenu} className={glassButton}>
      <BackIcon />
    </Link>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#111] text-white">
      <TourViewer
        className="flex-1"
        scene={{ id: scene.id, url: scene.photo.url, width: scene.width, height: scene.height }}
        spots={scene.spots.map((s) => ({ id: s.id, x: s.x, y: s.y, kind: s.kind, label: spotLabel(s) }))}
        selectedSpotId={open?.id}
        onSpot={(id) => {
          const s = scene.spots.find((x) => x.id === id)!;
          player.stop();
          if (s.kind === 'scene') go(tour.scenes.findIndex((x) => x.id === s.targetSceneId));
          else setOpen(open?.id === id ? null : s);
        }}
        playing={player.playing}
        seconds={scene.seconds}
        label={sceneName(scene, index)}
      >
        <div className="absolute inset-x-0 top-0 flex items-center gap-3 p-4">
          {back}
          <div className="min-w-0 flex-1">
            <p className="truncate text-title-m font-semibold">{name}</p>
            <p className="truncate text-caption text-white/70">
              {t.tourTitle} · {sceneName(scene, index)}
            </p>
          </div>
          {otherHref && (
            <Link href={otherHref} hrefLang={locale === 'ar' ? 'en' : 'ar'} className="rounded-full bg-black/55 px-3 py-1.5 text-caption font-semibold backdrop-blur">
              {locale === 'ar' ? 'EN' : 'عربي'}
            </Link>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 grid gap-3 p-4">
          {open ? (
            <SpotSheet spot={open} t={t} locale={locale} currency={tour.currency} menuHref={menuHref} label={spotLabel(open)} onClose={() => setOpen(null)} />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-caption text-white/75">{t.tourHint}</span>
                <button type="button" onClick={player.playing ? player.stop : player.play} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-caption font-semibold text-[#1c1c1c]">
                  {player.playing ? <PauseIcon /> : <PlayIcon />}
                  {player.playing ? t.pauseTour : `${t.playTour} · ${duration(tour.scenes.reduce((s, x) => s + x.seconds, 0))}`}
                </button>
              </div>
              <ol aria-label={t.tourScenes} className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                {tour.scenes.map((s, i) => (
                  <li key={s.id} className="shrink-0">
                    <button type="button" onClick={() => go(i)} aria-current={i === index ? 'step' : undefined} className="block w-24 text-start">
                      <span className={cx('relative block h-14 overflow-hidden rounded-xl', i === index ? 'shadow-[0_0_0_2px_#fff]' : 'opacity-75')}>
                        <img src={s.photo.thumbUrl} alt="" className="size-full object-cover" />
                        {player.playing && i === index && <span className="absolute inset-x-0 bottom-0 h-1 origin-left animate-[grow_linear] bg-white rtl:origin-right" style={{ animationDuration: `${s.seconds}s` }} />}
                      </span>
                      <span className={cx('mt-1 block truncate text-[11px]', i === index ? 'font-semibold' : 'text-white/70')}>
                        {i + 1} · {sceneName(s, i)}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </TourViewer>
    </div>
  );
}

function SpotSheet({ spot, t, locale, currency, menuHref, label, onClose }: { spot: Spot; t: Text; locale: Locale; currency: string; menuHref: string; label: string; onClose: () => void }) {
  const d = spot.dish;
  const note = pick(spot.noteEn, spot.noteAr, locale);
  return (
    <section aria-live="polite" className="relative rounded-2xl bg-white p-4 text-[#242424] shadow-[0_18px_40px_rgb(0_0_0/0.35)]">
      <button type="button" onClick={onClose} aria-label={t.closeSpot} className="absolute end-3 top-3 grid size-8 place-items-center rounded-full text-[#6e6e6e] hover:bg-black/5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
      {d ? (
        <div className="flex items-center gap-3 pe-8">
          {d.photo && <img src={d.photo.thumbUrl} alt="" className="size-16 shrink-0 rounded-xl object-cover" />}
          <div className="min-w-0 flex-1">
            {label && label !== pick(d.nameEn, d.nameAr, locale) && <p className="text-overline font-semibold tracking-[0.1em] text-[#db1a1a] uppercase">{label}</p>}
            <p className="text-title-m font-semibold">{pick(d.nameEn, d.nameAr, locale)}</p>
            {pick(d.descriptionEn, d.descriptionAr, locale) && <p className="line-clamp-2 text-body-s text-[#6e6e6e]">{pick(d.descriptionEn, d.descriptionAr, locale)}</p>}
            {note && <p className="mt-1 text-body-s">{note}</p>}
          </div>
          <span dir="ltr" className="shrink-0 rounded-lg bg-[#fce8e8] px-2.5 py-1 font-mono text-body-s font-semibold text-[#b81414]">
            {formatPrice(d.priceMinor, currency)}
          </span>
        </div>
      ) : (
        <div className="pe-8">
          <p className="text-title-m font-semibold">{label}</p>
          {note && <p className="mt-1 text-body-s text-[#454545]">{note}</p>}
        </div>
      )}
      {d && (
        <Link href={`${menuHref}#d-${d.id.slice(0, 8)}`} className="mt-3 flex h-11 items-center justify-center rounded-xl bg-[#242424] text-body-s font-semibold text-white">
          {t.seeOnMenu}
        </Link>
      )}
    </section>
  );
}

/** The guest menu's way in: a dark card above the dishes. */
export function TourTeaserCard({ href, cover, scenes, seconds, t, locale }: { href: string; cover: string; scenes: number; seconds: number; t: Text; locale: Locale }) {
  return (
    <Link href={href} className="mt-4 flex items-center gap-3 rounded-2xl bg-[#1c1c1c] p-2.5 text-white transition-transform hover:-translate-y-0.5">
      <img src={cover} alt="" className="size-12 shrink-0 rounded-[10px] object-cover" />
      <span className="min-w-0 flex-1">
        <span className="block text-title-s font-semibold">
          {t.tourTitle}{' '}
          <span lang={locale === 'ar' ? 'en' : 'ar'} className="font-normal text-[#a6a6a6]">
            · {t.tourOther}
          </span>
        </span>
        <span className="block text-caption text-[#a6a6a6]">{plural(locale, scenes, t.scenesShort)} · {duration(seconds)}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#db1a1a] px-3 py-2 text-caption font-semibold">
        <CubeIcon />
        {t.stepInside}
      </span>
    </Link>
  );
}

const glassButton = 'grid size-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-[rgb(18_18_18/0.62)] backdrop-blur';
const BackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="rtl:-scale-x-100">
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);
const PlayIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="rtl:-scale-x-100">
    <polygon points="6 4 20 12 6 20 6 4" />
  </svg>
);
const PauseIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <rect x="5" y="4" width="5" height="16" rx="1" />
    <rect x="14" y="4" width="5" height="16" rx="1" />
  </svg>
);
export const CubeIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 2 3 7v10l9 5 9-5V7z" />
    <path d="M3 7l9 5 9-5M12 12v10" />
  </svg>
);
