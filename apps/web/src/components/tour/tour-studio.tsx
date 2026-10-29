'use client';

/* eslint-disable @next/next/no-img-element -- photos are pre-sized WebP files from the API */
import { useRef, useState } from 'react';
import { fill, formatPrice, tourSeconds, type Locale, type PublicTour, type SpotPayload, type TourDraft, type TourIssue, type TourSpot } from '@savora/shared';
import type { Dictionary } from '@/app/[lang]/dictionaries';
import { cx } from '@/lib/cx';
import { primaryName } from '@/lib/menu-text';
import { plural } from '@/lib/plural';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { CubeIcon, GuestTour } from './guest-tour';
import { sceneLabel, SceneDialog, SpotDialog } from './tour-dialogs';
import { duration, TourViewer, useTourPlayer } from './tour-viewer';

const ICON = {
  upload: (
    <>
      <path d="M12 16V4" />
      <polyline points="7 9 12 4 17 9" />
      <path d="M5 20h14" />
    </>
  ),
  check: <polyline points="20 6 9 17 4 12" />,
  alert: (
    <>
      <path d="M12 3 2 20h20L12 3z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  play: <polygon points="7 4 20 12 7 20 7 4" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>
  ),
  trash: <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />,
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  tip: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0 0 12 3z" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
};
const Icon = ({ d, size = 16, className, strokeWidth = 2 }: { d: React.ReactNode; size?: number; className?: string; strokeWidth?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
    {d}
  </svg>
);
const glass = 'border border-white/15 bg-[rgb(18_18_18/0.62)] shadow-[0_10px_24px_rgb(0_0_0/0.28)] backdrop-blur';
const isSpot = (s: TourSpot | { x: number; y: number }): s is TourSpot => 'id' in s;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

/** Virtual trial: build a walk-through from photos, tag spots, and publish it to the guest menu. */
export function TourStudio({
  initial,
  t,
  guestText,
  locale,
  locationName,
  place,
  canPublish,
}: {
  initial: TourDraft;
  t: Dictionary;
  guestText: Dictionary['guest'];
  locale: Locale;
  locationName: string;
  place: { en: string; ar: string | null };
  canPublish: boolean;
}) {
  const v = t.tour;
  const [draft, setDraft] = useState(initial);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [busy, setBusy] = useState<null | 'upload' | 'publish'>(null);
  const [dialog, setDialog] = useState<{ kind: 'scene' } | { kind: 'spot'; spot: TourSpot | { x: number; y: number } } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const viewerBox = useRef<HTMLElement>(null);

  const scenes = draft.scenes;
  const at = Math.min(index, Math.max(0, scenes.length - 1));
  const scene = scenes[at];
  const player = useTourPlayer(scenes, at, setIndex);
  const name = (locale === 'ar' && place.ar) || place.en;
  const allSpots = scenes.flatMap((s, si) => s.spots.map((p) => ({ ...p, si })));
  const issues = scenes.map((s, i) => ({ s, i })).filter(({ s }) => s.quality.issues.length);
  const dishOf = (id: string | null) => draft.dishes.find((d) => d.id === id);
  const spotName = (p: TourSpot) =>
    primaryName({ nameEn: p.labelEn, nameAr: p.labelAr }, locale) ||
    (p.kind === 'dish' ? primaryName(dishOf(p.itemId) ?? { nameEn: null, nameAr: null }, locale) : p.kind === 'scene' ? sceneLabel(scenes.find((s) => s.id === p.targetSceneId) ?? { nameEn: null, nameAr: null }, scenes.findIndex((s) => s.id === p.targetSceneId), v, locale) : '');

  function say(text: string, tone: 'ok' | 'error' = 'ok') {
    clearTimeout(noticeTimer.current);
    setNotice({ text, tone });
    noticeTimer.current = setTimeout(() => setNotice(null), 5000);
  }
  const errorText = (code: unknown) => (typeof code === 'string' && code in v.errors ? v.errors[code as keyof typeof v.errors] : v.failed);

  /** Sends a change; the API answers with the whole draft, which replaces ours. */
  async function call(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown | FormData) {
    const form = body instanceof FormData;
    const res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined || form ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : form ? (body as FormData) : JSON.stringify(body),
    }).catch(() => null);
    const data = res?.headers.get('content-type')?.includes('json') ? await res.json() : null;
    if (!res?.ok) {
      say(errorText(data?.error), 'error');
      return null;
    }
    setDraft(data as TourDraft);
    return data as TourDraft;
  }

  async function addPhotos(files: File[]) {
    if (!files.length) return;
    if (files.length > 10) return say(v.errors.too_many_files, 'error');
    const body = new FormData();
    for (const f of files) body.append('file', f);
    setBusy('upload');
    const before = scenes.length;
    const next = await call('POST', `/locations/${draft.location.id}/tour/scenes`, body);
    setBusy(null);
    if (next) {
      setIndex(before);
      setSelected(null);
      say(plural(locale, next.scenes.length - before, v.uploaded));
    }
  }

  async function publish() {
    setBusy('publish');
    const next = await call('POST', `/locations/${draft.location.id}/tour/publish`);
    setBusy(null);
    if (next) say(v.publishedToast);
  }

  // ---------- Steps ----------
  const named = scenes.length >= 2 && scenes.every((s) => s.nameEn || s.nameAr);
  const done = [scenes.length >= 2, named, allSpots.length > 0, Boolean(draft.published) && !draft.hasChanges];
  const current = Math.max(0, done.indexOf(false));
  const steps = (
    <div className="min-w-[180px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] text-muted">{fill(v.step, { n: done.every(Boolean) ? 4 : current + 1 })}</span>
        <span className="text-caption font-semibold">{v.steps[done.every(Boolean) ? 3 : current]}</span>
      </div>
      <ol aria-label={v.stepsLabel} className="mt-1.5 flex gap-1">
        {v.steps.map((label, i) => (
          <li key={label} aria-label={label} aria-current={i === current && !done.every(Boolean) ? 'step' : undefined} className={cx('h-[5px] w-[38px] rounded-full', done[i] ? 'bg-ok' : i === current ? 'bg-brand-fill' : 'bg-line-2')} />
        ))}
      </ol>
    </div>
  );

  const ready = draft.checks.filter((c) => c.required).every((c) => c.ok);
  const live = Boolean(draft.published);
  const publishLabel = busy === 'publish' ? v.publishing : live && !draft.hasChanges ? v.published : live ? v.update : v.publish;
  const publishButton = (className?: string, size?: 'md' | 'lg') => (
    <Button size={size} variant={live && !draft.hasChanges ? 'secondary' : 'primary'} className={cx(className, live && !draft.hasChanges && 'disabled:opacity-100')} onClick={publish} disabled={!canPublish || !ready || busy !== null || (live && !draft.hasChanges)} title={!canPublish ? v.ownerOnly : !ready ? v.errors.not_ready : undefined}>
      {live && !draft.hasChanges && <Icon d={ICON.check} size={14} strokeWidth={3} className="text-ok" />}
      {publishLabel}
    </Button>
  );

  // Draft as guests would see it, for the preview. Only the photo tour: the 3D walk-through is
  // published on its own, and the guest tour doesn't show it.
  const preview: PublicTour = {
    slug: draft.location.slug,
    space: null,
    name: place,
    currency: draft.location.currency,
    scenes: scenes.map((s) => ({
      id: s.id,
      photo: s.photo,
      width: s.quality.width,
      height: s.quality.height,
      nameEn: s.nameEn,
      nameAr: s.nameAr,
      seconds: s.seconds,
      spots: s.spots.map(({ itemId, ...p }) => {
        const d = dishOf(itemId);
        return { ...p, dish: d ? { ...d, descriptionEn: null, descriptionAr: null } : null };
      }),
    })),
  };

  const header = (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <span className="rounded-full bg-brand-fill px-2 py-0.5 text-[10px] font-semibold text-white">{v.new}</span>
          <span className="text-overline font-semibold tracking-[0.11em] text-brand uppercase">{fill(v.overline, { location: locationName })}</span>
        </div>
        <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3.5">
          <h1 className="text-heading-l font-semibold tracking-[-0.02em]">{v.title}</h1>
          <span lang={locale === 'ar' ? 'en' : 'ar'} className="text-heading-s font-medium text-muted">
            {v.titleOther}
          </span>
        </div>
        <p className="mt-1.5 max-w-[560px] text-body-m text-muted">{fill(v.lead, { name })}</p>
      </div>
      {scenes.length > 0 && (
        <div className="flex flex-wrap items-center gap-4">
          {steps}
          <span aria-hidden className="hidden h-9 w-px bg-line sm:block" />
          <div className="flex gap-2.5">
            <Button variant="secondary" icon={<Icon d={ICON.eye} size={15} />} onClick={() => setPreviewing(true)}>
              {v.preview}
            </Button>
            {publishButton()}
          </div>
        </div>
      )}
    </header>
  );

  const picker = (label: string, className: string, children: React.ReactNode) => (
    <label className={cx('cursor-pointer focus-within:outline-2 focus-within:outline-brand', busy === 'upload' && 'pointer-events-none animate-pulse', className)}>
      <input
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        aria-label={label}
        disabled={busy !== null}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          addPhotos(files);
        }}
      />
      {children}
    </label>
  );
  const dropProps = {
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (busy === null) addPhotos([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name)));
    },
  };

  // ---------- Empty: start with photos ----------
  if (!scene) {
    return (
      <>
        {header}
        <section {...dropProps} className="mt-6 grid overflow-hidden rounded-[24px] bg-[#1c1c1c] text-white shadow-[0_24px_50px_rgb(28_28_28/0.22)] md:grid-cols-[1.2fr_1fr]">
          <div className="relative min-h-[320px] bg-[url('/images/cafe-room.jpg')] bg-cover bg-center">
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(0_0_0/0.35),rgb(0_0_0/0.75))]" />
            <div className="relative flex h-full flex-col justify-end p-7">
              <span className="grid size-11 place-items-center rounded-xl bg-white/12">
                <CubeIcon />
              </span>
              <h2 className="mt-4 text-heading-m font-semibold">{v.emptyTitle}</h2>
              <p className="mt-1.5 max-w-md text-body-s text-white/75">{v.emptyBody}</p>
            </div>
          </div>
          <div className="flex flex-col gap-5 p-7">
            {picker(
              v.emptyCta,
              'flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-white/30 p-6 text-center hover:border-gold',
              <>
                <Icon d={ICON.upload} size={22} className="text-[#ff6b6b]" />
                <span className="rounded-xl bg-brand-fill px-4 py-2.5 text-body-s font-semibold">{busy === 'upload' ? v.uploading : v.emptyCta}</span>
                <span className="text-caption text-white/60">
                  {v.emptyDrop} · {v.formats}
                </span>
              </>,
            )}
            <ul className="grid gap-2">
              {v.tips.map((tip) => (
                <li key={tip} className="flex items-center gap-2 text-caption text-white/75">
                  <Icon d={ICON.check} size={13} strokeWidth={3} className="text-[#5fbe8c]" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </section>
        <Toast notice={notice} />
      </>
    );
  }

  // ---------- The viewer ----------
  const spotsHere = scene.spots;
  const sel = spotsHere.find((p) => p.id === selected) ?? null;
  const selIndex = sel ? spotsHere.indexOf(sel) : -1;
  const spotCard = sel && (
    <div
      className="absolute z-10 w-[256px] rounded-2xl bg-white/96 p-3 text-[#242424] shadow-[0_18px_40px_rgb(0_0_0/0.35)]"
      style={{ left: `${sel.x * 100}%`, top: `${sel.y * 100}%`, transform: `translate(${sel.x > 0.55 ? 'calc(-100% - 30px)' : '30px'}, -50%)` }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-overline font-semibold tracking-[0.1em] text-[#db1a1a] uppercase">
          {fill(v.spotNumber, { n: selIndex + 1 })}
          {spotName(sel) && ` · ${spotName(sel)}`}
        </span>
        <span className="flex shrink-0">
          <button type="button" onClick={() => setDialog({ kind: 'spot', spot: sel })} aria-label={v.spotTitleEdit} className="grid size-7 place-items-center rounded-md text-[#6e6e6e] hover:bg-black/5">
            <Icon d={ICON.edit} size={13} />
          </button>
          <button
            type="button"
            onClick={async () => {
              if (await call('DELETE', `/tour/spots/${sel.id}`)) setSelected(null);
            }}
            aria-label={v.spotDelete}
            className="grid size-7 place-items-center rounded-md text-[#6e6e6e] hover:bg-black/5 hover:text-[#db1a1a]"
          >
            <Icon d={ICON.trash} size={13} />
          </button>
        </span>
      </div>
      {sel.kind === 'dish' && dishOf(sel.itemId) ? (
        <div className="mt-2.5 flex items-center gap-2.5">
          {dishOf(sel.itemId)!.photo ? <img src={dishOf(sel.itemId)!.photo!.thumbUrl} alt="" className="size-12 shrink-0 rounded-[10px] object-cover" /> : <span className="size-12 shrink-0 rounded-[10px] bg-[#f3f3f3]" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-title-s font-semibold">{primaryName(dishOf(sel.itemId)!, locale)}</span>
            <span className="block truncate text-[11px] text-[#6e6e6e]">{v.spotDishHint}</span>
          </span>
          <span dir="ltr" className="rounded-lg bg-[#fce8e8] px-2 py-1 font-mono text-caption font-semibold text-[#b81414]">
            {formatPrice(dishOf(sel.itemId)!.priceMinor, draft.location.currency)}
          </span>
        </div>
      ) : (
        <p className="mt-2 text-body-s text-[#454545]">{sel.kind === 'scene' ? fill(v.spotScene, { scene: spotName(sel) }) : primaryName({ nameEn: sel.noteEn, nameAr: sel.noteAr }, locale) || v.spotInfo}</p>
      )}
    </div>
  );

  const viewer = (
    <section ref={viewerBox} aria-label={v.title} className="relative mt-6 overflow-hidden rounded-[24px] shadow-[0_24px_50px_rgb(28_28_28/0.22)]">
      <TourViewer
        className="h-[460px] md:h-[560px]"
        scene={{ id: scene.id, url: scene.photo.url, width: scene.quality.width, height: scene.quality.height }}
        spots={spotsHere.map((p) => ({ id: p.id, x: p.x, y: p.y, kind: p.kind, label: spotName(p) }))}
        selectedSpotId={selected}
        onSpot={(id) => {
          player.stop();
          setSelected(selected === id ? null : id);
        }}
        placing={placing}
        onPlace={(x, y) => {
          setPlacing(false);
          setDialog({ kind: 'spot', spot: { x, y } });
        }}
        playing={player.playing}
        seconds={scene.seconds}
        label={fill(v.viewerLabel, { n: at + 1, name: sceneLabel(scene, at, v, locale) })}
        spotCard={spotCard}
      >
        <div className="absolute start-4 top-4 flex flex-wrap items-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => setDialog({ kind: 'scene' })} className={cx('inline-flex h-[38px] items-center gap-2 rounded-xl px-3 text-caption font-semibold text-white', glass)} aria-label={`${v.editScene}: ${sceneLabel(scene, at, v, locale)}`}>
            <span className="font-mono">{at + 1}</span>
            <span className="max-w-[160px] truncate">{sceneLabel(scene, at, v, locale)}</span>
            <Icon d={ICON.edit} size={13} />
          </button>
          <button
            type="button"
            aria-pressed={placing}
            onClick={() => {
              player.stop();
              setSelected(null);
              setPlacing(!placing);
            }}
            className={cx('inline-flex h-[38px] items-center gap-1.5 rounded-xl px-3 text-caption font-semibold', placing ? 'bg-white text-[#1c1c1c]' : cx('text-white', glass))}
          >
            <Icon d={ICON.pin} size={13} />
            {placing ? v.cancelTag : v.tagSpot}
          </button>
          {placing && <span className={cx('rounded-xl px-3 py-2 text-caption text-white', glass)}>{v.tagging}</span>}
        </div>
        <div className="absolute end-4 top-4 flex items-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
          <span className={cx('hidden h-[38px] items-center gap-2 rounded-xl px-3 text-caption font-semibold text-white sm:inline-flex', glass)}>
            <span className={cx('size-[7px] rounded-full', draft.score >= 85 ? 'bg-[#5fbe8c]' : 'bg-[#e8ba63]')} />
            {fill(v.quality, { n: draft.score })}
          </span>
          <button
            type="button"
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : viewerBox.current?.requestFullscreen())}
            aria-label={v.fullscreen}
            className={cx('grid size-[38px] place-items-center rounded-xl text-white', glass)}
          >
            <Icon d={ICON.expand} />
          </button>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 p-4" onPointerDown={(e) => e.stopPropagation()}>
          <div className="shrink-0 pb-5">
            <span className="hidden text-overline font-semibold tracking-[0.11em] text-[#d9a441] uppercase sm:block">{v.tourOverline}</span>
            <span className="mt-0.5 hidden text-title-s font-semibold text-white sm:block">{fill(v.tourLength, { scenes: plural(locale, scenes.length, v.scenes), time: duration(tourSeconds(scenes)) })}</span>
            <button type="button" onClick={player.playing ? player.stop : player.play} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-caption font-semibold text-[#1c1c1c] sm:mt-2.5">
              <Icon d={player.playing ? ICON.stop : ICON.play} size={11} strokeWidth={2.4} className="rtl:-scale-x-100" />
              {player.playing ? v.stop : v.play}
            </button>
          </div>
          <ol className="flex min-w-0 flex-1 gap-2.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
            {scenes.map((s, i) => (
              <li key={s.id} className="w-[118px] shrink-0">
                <button
                  type="button"
                  aria-current={i === at ? 'step' : undefined}
                  onClick={() => {
                    player.stop();
                    setSelected(null);
                    setIndex(i);
                  }}
                  className="block w-full text-start"
                >
                  <span className={cx('relative block h-[66px] overflow-hidden rounded-xl', i === at ? 'shadow-[0_0_0_2px_#fff]' : 'opacity-80 hover:opacity-100')}>
                    <img src={s.photo.thumbUrl} alt="" className="size-full object-cover" />
                    <span className="absolute start-1.5 bottom-1.5 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">{duration(s.seconds)}</span>
                    {s.quality.issues.length > 0 && <span className="absolute end-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-[#e8ba63] text-[#1c1c1c]"><Icon d={ICON.alert} size={9} strokeWidth={3} /></span>}
                  </span>
                  <span className={cx('mt-1 block truncate text-[11px]', i === at ? 'font-semibold text-white' : 'text-[#bdbdbd]')}>
                    {i + 1} · {sceneLabel(s, i, v, locale)}
                  </span>
                </button>
              </li>
            ))}
            <li className="shrink-0">
              {picker(
                v.addSceneLabel,
                'grid h-[66px] w-[74px] place-items-center content-center gap-1 rounded-xl border-[1.5px] border-dashed border-white/40 text-white hover:border-white',
                <>
                  <Icon d={ICON.plus} size={15} strokeWidth={2.4} />
                  <span className="text-[11px] text-[#e6e6e6]">{busy === 'upload' ? '…' : v.addScene}</span>
                </>,
              )}
            </li>
          </ol>
          <span className="hidden shrink-0 pb-7 text-caption whitespace-nowrap text-[#cfcfcf] xl:block">{v.hint}</span>
        </div>
      </TourViewer>
    </section>
  );

  // ---------- Quality card ----------
  const score = draft.score;
  const issueTone = (i: TourIssue[]) => (i.includes('blurry') ? 'bg-brand-fill' : 'bg-gold');
  const qualityCard = (
    <Card className="p-5">
      <div className="flex items-center gap-4">
        <Ring pct={score} />
        <span className="min-w-0">
          <span className="block text-overline font-semibold tracking-[0.11em] text-muted uppercase">{v.qualityOverline}</span>
          <span className="mt-0.5 block text-title-m font-semibold">{score >= 85 ? v.qualityGreat : score >= 65 ? v.qualityGood : v.qualityPoor}</span>
          <span className="block text-caption text-muted">{fill(v.qualitySummary, { photos: plural(locale, scenes.length, v.photos), n: issues.length })}</span>
        </span>
      </div>
      <ul className="mt-[18px] grid gap-2.5">
        {scenes.map((s, i) => (
          <li key={s.id} className="grid grid-cols-[92px_1fr_36px] items-center gap-2.5">
            <span className="truncate text-caption text-ink-2">{sceneLabel(s, i, v, locale)}</span>
            <span className="relative h-1.5 overflow-hidden rounded-full bg-surface-2">
              <span className={cx('absolute inset-y-0 start-0 rounded-full', s.quality.issues.length ? 'bg-gold' : 'bg-ok')} style={{ width: `${s.quality.score}%` }} />
            </span>
            <span className={cx('text-end font-mono text-caption', s.quality.issues.length ? 'text-gold-ink' : 'text-ink-2')}>{s.quality.score}%</span>
          </li>
        ))}
      </ul>
      {issues.length > 0 && (
        <>
          <div className="my-4 h-px bg-line" />
          <ul className="grid gap-3">
            {issues.map(({ s, i }) => (
              <li key={s.id} className="flex min-w-0 items-center gap-2.5">
                <span className="relative size-11 shrink-0">
                  <img src={s.photo.thumbUrl} alt="" className={cx('size-full rounded-[10px] object-cover ring-2', s.quality.issues.includes('blurry') ? 'ring-brand' : 'ring-gold')} />
                  <span className={cx('absolute -end-1.5 -top-1.5 grid size-[18px] place-items-center rounded-full text-white ring-2 ring-surface', issueTone(s.quality.issues))}>
                    <Icon d={s.quality.issues.includes('dark') || s.quality.issues.includes('bright') ? ICON.sun : ICON.alert} size={10} strokeWidth={2.6} />
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-title-s font-semibold">{s.quality.issues.map((x) => v.issues[x]).join(' · ')}</span>
                  <span className="block truncate text-[11px] text-muted">
                    {sceneLabel(s, i, v, locale)} · {v.issueHelp[s.quality.issues[0]!]}
                  </span>
                </span>
                <label className="shrink-0 cursor-pointer rounded-lg border border-line-2 px-2.5 py-1.5 text-caption font-semibold hover:bg-surface-2 focus-within:shadow-[0_0_0_3px_var(--brand-soft)]">
                  {v.retake}
                  <input
                    type="file"
                    accept={ACCEPT}
                    className="sr-only"
                    aria-label={fill(v.retakeLabel, { name: sceneLabel(s, i, v, locale) })}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      const body = new FormData();
                      body.append('file', file);
                      await call('PUT', `/tour/scenes/${s.id}/photo`, body);
                    }}
                  />
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      <div {...dropProps} className="mt-4">
        {picker(
          v.addSceneLabel,
          'flex items-center gap-2.5 rounded-xl border-[1.5px] border-dashed border-line-2 bg-surface-2 p-3 hover:border-ink',
          <>
            <Icon d={ICON.upload} size={17} className="text-brand" />
            <span className="flex-1 text-caption text-ink-2">{busy === 'upload' ? v.uploading : fill(v.drop, { browse: '' })}<span className="font-semibold text-brand">{busy === 'upload' ? '' : v.browse}</span></span>
            <span className="text-[11px] text-muted">{v.formats}</span>
          </>,
        )}
      </div>
    </Card>
  );

  // ---------- Spots card ----------
  const firstDish = draft.dishes[0];
  const spotsCard = (
    <Card className="flex flex-col p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span>
          <span className="block text-overline font-semibold tracking-[0.11em] text-muted uppercase">{v.spotsOverline}</span>
          <span className="mt-0.5 block text-title-m font-semibold">{plural(locale, allSpots.length, v.spotsCount)}</span>
        </span>
        <button type="button" onClick={() => setPlacing(true)} className="text-caption font-semibold text-brand hover:underline">
          {v.tagOnView}
        </button>
      </div>
      <ul className="mt-2">
        {allSpots.map((p, n) => {
          const d = p.kind === 'dish' ? dishOf(p.itemId) : undefined;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  player.stop();
                  setIndex(p.si);
                  setSelected(p.id);
                  viewerBox.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                className="flex w-full items-center gap-3 border-b border-line py-3 text-start"
              >
                <span className={cx('grid size-[26px] shrink-0 place-items-center rounded-full font-mono text-caption font-semibold', p.id === selected ? 'bg-brand-fill text-white' : 'bg-ink text-surface')}>{n + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-title-s font-semibold">{spotName(p) || v.spotInfo}</span>
                  <span className="flex items-center gap-1.5 truncate text-[11px] text-muted">
                    <Icon d={p.kind === 'dish' ? ICON.link : p.kind === 'scene' ? ICON.arrow : ICON.info} size={11} className={p.kind === 'scene' ? 'rtl:-scale-x-100' : undefined} />
                    {p.kind === 'dish' ? fill(v.spotDish, { dish: d ? primaryName(d, locale) : '' }) : p.kind === 'scene' ? fill(v.spotScene, { scene: sceneLabel(scenes.find((s) => s.id === p.targetSceneId) ?? { nameEn: null, nameAr: null }, scenes.findIndex((s) => s.id === p.targetSceneId), v, locale) }) : `${sceneLabel(scenes[p.si]!, p.si, v, locale)} · ${v.spotInfo}`}
                  </span>
                </span>
                {d ? (
                  <span className="flex shrink-0 items-center gap-1.5">
                    {d.photo && <img src={d.photo.thumbUrl} alt="" className="size-7 rounded-lg object-cover" />}
                    <span dir="ltr" className="font-mono text-caption font-semibold text-brand">
                      {formatPrice(d.priceMinor, draft.location.currency)}
                    </span>
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] text-muted">{p.kind === 'scene' ? v.kindScene : v.kindInfo}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => {
          setPlacing(true);
          viewerBox.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }}
        className="mt-3.5 flex h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-line-2 text-caption font-semibold text-ink-2 hover:border-ink"
      >
        <Icon d={ICON.plus} size={14} strokeWidth={2.4} />
        {v.addSpot}
      </button>
      {!allSpots.some((p) => p.kind === 'dish') && (
        <div className="mt-auto pt-4">
          <p className="flex items-start gap-2.5 rounded-xl bg-gold-soft p-3 text-caption text-ink-2">
            <Icon d={ICON.tip} size={16} className="shrink-0 text-gold" />
            {firstDish ? fill(v.tip, { dish: primaryName(firstDish, locale) }) : v.tipNoDishes}
          </p>
        </div>
      )}
    </Card>
  );

  // ---------- Publish card ----------
  const state = live && !draft.hasChanges ? v.stateLive : live ? v.stateChanges : ready ? v.stateReady : v.stateAlmost;
  const publishCard = (
    <Card className="flex flex-col p-5">
      <span className="block text-overline font-semibold tracking-[0.11em] text-muted uppercase">{v.publishOverline}</span>
      <span className="mt-0.5 block text-title-m font-semibold">{state}</span>
      <ul className="mt-3.5 grid gap-3">
        {draft.checks.map((c) => (
          <li key={c.key} className="flex items-start gap-2.5">
            <span className={cx('mt-px grid size-5 shrink-0 place-items-center rounded-full text-white', c.ok ? 'bg-ok' : c.required ? 'bg-brand-fill' : 'bg-gold')}>
              <Icon d={c.ok ? ICON.check : ICON.alert} size={11} strokeWidth={3} />
            </span>
            <span>
              <span className="block text-title-s font-semibold">{fill(c.ok ? v.checks[c.key].ok : v.checks[c.key].todo, { n: c.count, scenes: plural(locale, c.count, v.scenes), photos: plural(locale, c.count, v.photos), spots: plural(locale, c.count, v.spotsCount) })}</span>
              {!c.ok && !c.required && <span className="block text-[11px] text-muted">{v.optional}</span>}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-2xl border border-line bg-surface-2 p-3">
        <span className="block text-[11px] text-muted">{v.guestsSee}</span>
        <div className="mt-2 flex items-center gap-2.5 rounded-xl bg-[#1c1c1c] p-2">
          <img src={scenes[0]!.photo.thumbUrl} alt="" className="size-10 shrink-0 rounded-[9px] object-cover" />
          <span className="min-w-0 flex-1">
            <span className="block text-title-s font-semibold text-white">{v.title}</span>
            <span lang={locale === 'ar' ? 'en' : 'ar'} className="block text-[11px] text-[#a6a6a6]">
              {v.titleOther}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#db1a1a] px-2.5 py-1.5 text-[11px] font-semibold text-white">
            <CubeIcon />
            {v.stepInside}
          </span>
        </div>
      </div>
      <div className="mt-auto grid gap-2 pt-4">
        {publishButton('w-full', 'lg')}
        {live && canPublish && (
          <button
            type="button"
            onClick={async () => {
              if (await call('DELETE', `/locations/${draft.location.id}/tour/publish`)) say(v.takenDown);
            }}
            className="justify-self-center text-caption font-semibold text-muted hover:text-brand"
          >
            {v.takeDown}
          </button>
        )}
      </div>
    </Card>
  );

  const dialogSpot = dialog?.kind === 'spot' ? dialog.spot : null;
  return (
    <>
      {header}
      {viewer}
      <div className="mt-5 grid items-stretch gap-5 lg:grid-cols-3">
        {qualityCard}
        {spotsCard}
        {publishCard}
      </div>

      <SceneDialog
        open={dialog?.kind === 'scene'}
        scene={scene}
        index={at}
        count={scenes.length}
        t={v}
        locale={locale}
        onClose={() => setDialog(null)}
        onSave={async (val) => {
          if (await call('PATCH', `/tour/scenes/${scene.id}`, val)) setDialog(null);
        }}
        onMove={async (to) => {
          if (await call('POST', `/tour/scenes/${scene.id}/move`, { to })) setIndex(to);
        }}
        onRetake={async (file) => {
          const body = new FormData();
          body.append('file', file);
          await call('PUT', `/tour/scenes/${scene.id}/photo`, body);
        }}
        onDelete={async () => {
          if (await call('DELETE', `/tour/scenes/${scene.id}`)) {
            setDialog(null);
            setSelected(null);
            setIndex(Math.max(0, at - 1));
          }
        }}
      />
      <SpotDialog
        key={dialogSpot ? (isSpot(dialogSpot) ? dialogSpot.id : `${dialogSpot.x},${dialogSpot.y}`) : 'none'}
        open={Boolean(dialogSpot)}
        spot={dialogSpot}
        sceneId={scene.id}
        scenes={scenes}
        dishes={draft.dishes}
        currency={draft.location.currency}
        t={v}
        locale={locale}
        onClose={() => setDialog(null)}
        onSave={async (val: SpotPayload) => {
          const existing = dialogSpot && 'id' in dialogSpot ? dialogSpot : null;
          const next = existing ? await call('PATCH', `/tour/spots/${existing.id}`, val) : await call('POST', `/tour/scenes/${scene.id}/spots`, val);
          if (!next) return false;
          setDialog(null);
          // Show the new spot's card straight away.
          if (!existing) setSelected(next.scenes.find((s) => s.id === scene.id)?.spots.at(-1)?.id ?? null);
          return true;
        }}
        onDelete={async () => {
          if (dialogSpot && 'id' in dialogSpot && (await call('DELETE', `/tour/spots/${dialogSpot.id}`))) {
            setDialog(null);
            setSelected(null);
          }
        }}
      />
      {previewing && <GuestTour tour={preview} t={guestText} locale={locale} menuHref={`/${locale}/r/${draft.location.slug}`} onClose={() => setPreviewing(false)} />}
      <Toast notice={notice} />
    </>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative block size-[72px] shrink-0">
      <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden className="absolute inset-0">
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={pct >= 85 ? 'var(--ok)' : 'var(--gold)'} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${((c * pct) / 100).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 36 36)" />
      </svg>
      <span className="absolute inset-x-0 top-[24px] text-center text-title-m font-semibold">{pct}</span>
    </span>
  );
}

function Toast({ notice }: { notice: { text: string; tone: 'ok' | 'error' } | null }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={cx(
        'fixed bottom-5 start-1/2 z-50 max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-xl px-4 py-3 text-body-s font-medium shadow-raised transition-opacity rtl:translate-x-1/2',
        notice ? 'opacity-100' : 'pointer-events-none opacity-0',
        notice?.tone === 'error' ? 'bg-brand-fill text-white' : 'bg-ink text-surface',
      )}
    >
      {notice?.text}
    </p>
  );
}
