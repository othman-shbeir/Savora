'use client';

import { useEffect, useRef, useState } from 'react';
import { fill, type Locale } from '@savora/shared';
import type { Dictionary } from '@/app/[lang]/dictionaries';
import { cx } from '@/lib/cx';
import { drawCard, FORMATS, qrSvg, type CardFormat } from '@/lib/qr-card';
import { Button } from '../ui/button';
import { Card, Overline } from '../ui/card';

type Text = Dictionary['qr'];

const ICONS: Record<CardFormat, React.ReactNode> = {
  table: <path d="M4 8h16M7 8v10M17 8v10M9 4h6" />,
  window: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M12 4v16M4 12h16" />
    </>
  ),
  takeaway: <path d="M6 7h12l-1 13H7L6 7Zm3 0V5a3 3 0 0 1 6 0v2" />,
};

function save(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Print studio and sharing for one location's permanent link. */
export function QrStudio({ t, locale, slug, origin, card, aside }: { t: Text; locale: Locale; slug: string; origin: string; card: { nameEn: string; nameAr: string | null; taglineEn: string | null }; aside?: React.ReactNode }) {
  const [format, setFormat] = useState<CardFormat>('table');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const shareUrl = `${origin}/r/${slug}`;
  // Printed codes carry ?s=qr so scan analytics can tell a scan from a shared link.
  const qrUrl = `${shareUrl}?s=qr`;
  const displayUrl = `${new URL(origin).host}/r/${slug}`;
  const formatName = { table: t.tableName, window: t.windowName, takeaway: t.takeawayName }[format];
  const size = FORMATS[format];

  useEffect(() => {
    if (canvasRef.current) drawCard(canvasRef.current, format, { ...card, url: qrUrl, displayUrl });
  }, [format, card, qrUrl, displayUrl]);

  async function copy(then?: string) {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      if (then) setNotice(then);
    } catch {
      setNotice(shareUrl);
    }
  }

  async function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    await drawCard(canvas, format, { ...card, url: qrUrl, displayUrl });
    canvas.toBlob((blob) => {
      if (blob) save(blob, `savora-${slug}-${format}.png`);
      setBusy(false);
    }, 'image/png');
  }

  return (
    <div className="mt-7 grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <Overline>{t.studioOverline}</Overline>
            <p className="mt-1 text-title-m font-semibold">
              {card.nameEn} · {formatName}
            </p>
          </div>
          <div role="radiogroup" aria-label={t.formatsLabel} className="flex rounded-full border border-line bg-surface-2 p-1">
            {(Object.keys(FORMATS) as CardFormat[]).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={format === f}
                onClick={() => setFormat(f)}
                className={cx(
                  'inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-caption font-semibold transition-colors',
                  format === f ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
                )}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {ICONS[f]}
                </svg>
                {t[f]}
              </button>
            ))}
          </div>
        </div>

        {/* The stage: the card standing on a warm "table" band. */}
        <div className="relative grid place-items-center bg-surface-2 px-6 pt-8 pb-10">
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-[38%] bg-gold-soft" />
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={fill(t.previewAlt, { format: formatName, name: card.nameEn, url: displayUrl })}
            className={cx(
              'relative h-auto max-w-full rounded-[18px] border border-line shadow-raised',
              format === 'table' ? 'w-[290px]' : format === 'window' ? 'w-[380px]' : 'w-[440px]',
            )}
          />
        </div>

        <div className="flex flex-wrap gap-3 border-t border-line p-5">
          <Button variant="dark" size="lg" onClick={download} disabled={busy} className="min-w-[220px] flex-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
            </svg>
            {busy ? t.preparing : t.download}
          </Button>
          <Button variant="secondary" size="lg" onClick={() => copy()}>
            {copied ? t.copied : t.copyLink}
          </Button>
          <div className="flex w-full flex-wrap items-center justify-between gap-2 text-caption text-muted">
            {/* Wrapped in left-to-right isolates (U+2066…U+2069) so "6 × 4 in" keeps its order in Arabic. */}
            <span>{fill(t.sizeNote, { w: size.w, h: size.h, inches: `\u2066${size.inches}\u2069` })}</span>
            <button type="button" className="font-semibold text-ink-2 underline-offset-4 hover:underline" onClick={async () => save(new Blob([await qrSvg(qrUrl)], { type: 'image/svg+xml' }), `savora-${slug}-qr.svg`)}>
              {t.downloadSvg}
            </button>
          </div>
        </div>
      </Card>

      <div className="grid gap-5">
        <Card className="p-6">
          <Overline>{t.shareOverline}</Overline>
          <h2 className="mt-1.5 text-heading-s font-semibold">{t.shareTitle}</h2>
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-line-2 bg-surface-2 py-1.5 ps-3.5 pe-1.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-muted" aria-hidden>
              <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
            </svg>
            <input readOnly value={displayUrl} aria-label={t.linkLabel} dir="ltr" onFocus={(e) => e.target.select()} className="min-w-0 flex-1 bg-transparent font-mono text-caption outline-none" />
            <Button size="sm" variant="secondary" onClick={() => copy()}>
              {copied ? t.copied : t.copyLink}
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(fill(t.whatsappText, { url: shareUrl }))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[11px] border border-line-2 bg-surface text-body-s font-semibold hover:bg-surface-2"
            >
              <span aria-hidden className="grid size-6 place-items-center rounded-md bg-ok-soft text-ok">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M4 20l1.4-4A8 8 0 1 1 8 18.6L4 20Z" />
                </svg>
              </span>
              {t.whatsapp}
            </a>
            <button
              type="button"
              onClick={() => copy(t.instagramCopied)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[11px] border border-line-2 bg-surface text-body-s font-semibold hover:bg-surface-2"
            >
              <span aria-hidden className="grid size-6 place-items-center rounded-md bg-brand-soft text-brand">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <rect x="4" y="4" width="16" height="16" rx="5" />
                  <circle cx="12" cy="12" r="3.5" />
                </svg>
              </span>
              {t.instagram}
            </button>
          </div>
          <p role="status" aria-live="polite" className={cx('text-caption text-ok', notice ? 'mt-3' : 'sr-only')}>
            {notice}
          </p>
          <a href={`/${locale}/r/${slug}`} target="_blank" rel="noopener" className="mt-4 flex items-center justify-center gap-1.5 text-body-s font-semibold text-brand hover:underline">
            {t.openLive}
            <span aria-hidden>{locale === 'ar' ? '↖' : '↗'}</span>
          </a>
        </Card>

        <Card className="p-6">
          <ul className="grid">
            {([
              [t.reason1Title, t.reason1Body, <path key="p" d="M12 3a9 9 0 1 0 9 9c0-1.5-1.2-2-2.5-2H16a2 2 0 0 1-2-2V6.5C14 4.2 13.5 3 12 3ZM7.5 11h.01M10 7h.01M7.5 15h.01" />],
              [t.reason2Title, t.reason2Body, <path key="p" d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v6H7z" />],
              [t.reason3Title, t.reason3Body, <path key="p" d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />],
            ] as const).map(([title, body, icon], i) => (
              <li key={i} className={cx('flex gap-3.5 py-4', i > 0 && 'border-t border-line', i === 0 && 'pt-0', i === 2 && 'pb-0')}>
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-brand-soft text-brand">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {icon}
                  </svg>
                </span>
                <div>
                  <p className="text-body-s font-semibold">{title}</p>
                  <p className="mt-0.5 text-caption text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        {aside}
      </div>
    </div>
  );
}
