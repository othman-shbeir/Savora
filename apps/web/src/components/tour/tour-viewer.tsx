'use client';

/* eslint-disable @next/next/no-img-element -- scene photos are pre-sized WebP files from the API */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';

export type ViewerSpot = { id: string; x: number; y: number; kind: 'dish' | 'info' | 'scene'; label: string };
export type ViewerScene = { id: string; url: string; width: number; height: number };

/**
 * One scene of the tour, filling its box like a photo "cover". When the photo is wider or taller than
 * the box, dragging (or the arrow keys) looks around. While the tour plays, the view drifts slowly
 * across the photo, or zooms in gently when there is nothing to pan. Spots sit on the photo itself,
 * so they stay on the right object whatever the screen size.
 */
export function TourViewer({
  scene,
  spots,
  selectedSpotId,
  onSpot,
  placing = false,
  onPlace,
  playing = false,
  seconds = 10,
  label,
  className,
  children,
  spotCard,
}: {
  scene: ViewerScene;
  spots: ViewerSpot[];
  selectedSpotId?: string | null;
  onSpot?: (id: string) => void;
  /** Tag mode: a click on the photo places a spot there. */
  placing?: boolean;
  onPlace?: (x: number, y: number) => void;
  playing?: boolean;
  seconds?: number;
  /** Accessible description of the view, e.g. the scene's name. */
  label: string;
  className?: string;
  /** Overlays (controls, filmstrip) drawn above the photo. */
  children?: ReactNode;
  /** Drawn next to the selected spot, inside the photo layer. */
  spotCard?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Where the owner or guest has looked, remembered per scene and box size; otherwise centred.
  const [looked, setLooked] = useState<{ key: string; x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e!.contentRect.width, h: e!.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = size.w && size.h ? Math.max(size.w / scene.width, size.h / scene.height) : 0;
  const lw = scene.width * scale;
  const lh = scene.height * scale;
  const minX = size.w - lw;
  const minY = size.h - lh;
  const key = `${scene.id}:${Math.round(minX)}:${Math.round(minY)}`;
  const pan = looked?.key === key ? looked : { x: minX / 2, y: minY / 2 };
  const setPan = (p: { x: number; y: number }) => setLooked({ key, x: Math.min(0, Math.max(minX, p.x)), y: Math.min(0, Math.max(minY, p.y)) });
  const canPan = minX < -1 || minY < -1;

  // The guided tour's slow drift across the photo (or a gentle zoom when there is nothing to pan),
  // as a CSS animation so it runs smoothly and stops for people who ask for reduced motion.
  const at = (x: number, y: number, z = 1) => `translate(${x}px, ${y}px) scale(${z})`;
  const drift = !playing || !scale ? null : minX < -8 ? [at(0, pan.y), at(minX, pan.y)] : minY < -8 ? [at(pan.x, 0), at(pan.x, minY)] : [at(pan.x, pan.y), at(pan.x, pan.y, 1.08)];


  // The photo layer takes the pointer for dragging; the overlays (children) sit beside it, not
  // inside, so their buttons get their own clicks and stay visible to screen readers.
  return (
    <div className={cx('relative overflow-hidden bg-[#161616]', className)}>
      <div
        ref={box}
        role="group"
        aria-label={label}
        tabIndex={canPan ? 0 : -1}
        onKeyDown={(e) => {
          const step = 60;
          const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
          const m = moves[e.key];
          if (!m || !canPan) return;
          e.preventDefault();
          setPan({ x: pan.x + m[0], y: pan.y + m[1] });
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true;
          if (d.moved && canPan) setPan({ x: d.px + dx, y: d.py + dy });
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d || d.moved || !placing || !onPlace || !lw) return;
          const r = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - r.left - pan.x) / lw;
          const y = (e.clientY - r.top - pan.y) / lh;
          if (x >= 0 && x <= 1 && y >= 0 && y <= 1) onPlace(Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000);
        }}
        className={cx('absolute inset-0 touch-none overflow-hidden select-none', placing ? 'cursor-crosshair' : canPan ? 'cursor-grab active:cursor-grabbing' : '')}
      >
        {/* Positioned from the left in both reading directions: pan offsets are physical pixels. */}
        {scale > 0 && (
          <div
            key={drift ? `${scene.id}-tour` : scene.id}
            className={cx('absolute top-0 left-0 origin-center', drift && 'motion-safe:[animation:tour-drift_var(--dur)_ease-in-out_forwards]')}
            style={{ width: lw, height: lh, transform: at(pan.x, pan.y), ...(drift ? { '--from': drift[0], '--to': drift[1], '--dur': `${seconds}s` } : {}) } as React.CSSProperties}
          >
            <img key={scene.id} src={scene.url} alt="" draggable={false} className="size-full animate-[fade_.4s_ease] object-cover" />
            {spots.map((s, i) => {
              const on = s.id === selectedSpotId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onSpot?.(s.id)}
                  aria-pressed={on}
                  aria-label={s.label}
                  className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2.5"
                  style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }}
                >
                  <span
                    className={cx(
                      'grid place-items-center rounded-full font-mono text-caption font-bold transition-transform',
                      on ? 'size-10 bg-brand-fill text-white shadow-[0_0_0_6px_rgb(219_26_26/0.3),0_8px_18px_rgb(0_0_0/0.35)]' : 'size-8 bg-white text-[#1c1c1c] shadow-[0_0_0_5px_rgb(255_255_255/0.22),0_6px_14px_rgb(0_0_0/0.3)] hover:scale-110',
                    )}
                  >
                    {s.kind === 'scene' ? <Arrow /> : i + 1}
                  </span>
                  {!on && s.label && <span className="absolute start-full ms-2.5 hidden rounded-full border border-white/15 bg-[rgb(18_18_18/0.62)] px-2.5 py-1 text-caption font-semibold whitespace-nowrap text-white shadow-[0_10px_24px_rgb(0_0_0/0.28)] backdrop-blur sm:block">{s.label}</span>}
                </button>
              );
            })}
            {spotCard}
          </div>
        )}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(0_0_0/0.42)_0%,transparent_22%,transparent_58%,rgb(0_0_0/0.8)_100%)]" />
      {children}
    </div>
  );
}

const Arrow = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="rtl:-scale-x-100">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/** Steps through scenes for the guided tour: each stays for its own number of seconds. With
 *  autoPlay it starts on its own (guests); otherwise it waits for play() (the owner's studio). */
export function useTourPlayer(scenes: Array<{ seconds: number }>, index: number, setIndex: (i: number) => void, autoPlay = false) {
  const [playing, setPlaying] = useState(autoPlay);
  const seconds = scenes[index]?.seconds;
  const count = scenes.length;
  useEffect(() => {
    if (!playing || seconds === undefined) return;
    const t = setTimeout(() => {
      if (index + 1 < count) setIndex(index + 1);
      else setPlaying(false);
    }, seconds * 1000);
    return () => clearTimeout(t);
  }, [playing, index, seconds, count, setIndex]);
  return {
    playing: playing && seconds !== undefined,
    play: () => {
      if (index >= scenes.length - 1) setIndex(0);
      setPlaying(true);
    },
    stop: () => setPlaying(false),
  };
}

/** "0:45" */
export const duration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
