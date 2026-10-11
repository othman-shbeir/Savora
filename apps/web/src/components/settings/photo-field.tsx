'use client';

/* eslint-disable @next/next/no-img-element -- pre-sized WebP from the API */
import { useRef, useState } from 'react';
import type { Photo } from '@savora/shared';
import { cx } from '@/lib/cx';

const MAX_BYTES = 8 * 1024 * 1024;

/** Upload, replace or remove one photo. Uploads right away; the parent saves the choice. */
export function PhotoField({
  label,
  hint,
  photo,
  onChange,
  organizationId,
  shape,
  fallback,
  disabled,
  t,
}: {
  label: string;
  hint: string;
  photo: Photo | null;
  onChange: (p: Photo | null) => void;
  organizationId: string;
  shape: 'square' | 'wide';
  fallback?: string;
  disabled?: boolean;
  t: {
    upload: string;
    replace: string;
    remove: string;
    uploading: string;
    photoFailed: string;
    photoTooBig: string;
    failed: string;
  };
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    if (file.size > MAX_BYTES) return setError(t.photoTooBig);
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append('file', file);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/media`, {
        method: 'POST',
        body,
      });
      if (res.ok) onChange(await res.json());
      else setError(res.status === 413 ? t.photoTooBig : res.status === 415 ? t.photoFailed : t.failed);
    } catch {
      setError(t.failed);
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-dashed border-line-2 bg-surface-2 p-4">
      <span
        className={cx(
          'relative grid shrink-0 place-items-center overflow-hidden bg-brand-fill text-heading-m font-bold text-white',
          shape === 'square' ? 'size-16 rounded-2xl' : 'h-16 w-28 rounded-xl',
          !photo && shape === 'wide' && 'bg-[radial-gradient(circle_at_80%_10%,rgb(219_26_26/0.7),#1f1f1f_70%)]',
        )}
      >
        {photo ? (
          // Logos (square) show whole on white; covers fill the frame.
          <img src={photo.url} alt="" className={cx('absolute inset-0 size-full', shape === 'square' ? 'bg-white object-contain p-1' : 'object-cover')} />
        ) : (
          <span aria-hidden>{fallback}</span>
        )}
      </span>
      <div className="min-w-[180px] flex-1">
        <p className="text-body-s font-semibold">{label}</p>
        <p className={cx('mt-0.5 text-caption', error ? 'text-brand' : 'text-muted')} role={error ? 'alert' : undefined}>
          {error ?? hint}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => input.current?.click()}
          className="h-9 rounded-[10px] border border-line-2 bg-surface px-3 text-caption font-semibold hover:bg-surface-2 disabled:opacity-50"
        >
          {busy ? t.uploading : photo ? t.replace : t.upload}
          <span className="sr-only"> · {label}</span>
        </button>
        {photo && (
          <button type="button" disabled={disabled} onClick={() => onChange(null)} className="h-9 rounded-[10px] px-3 text-caption font-semibold text-brand disabled:opacity-50">
            {t.remove}
            <span className="sr-only"> · {label}</span>
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) upload(file);
        }}
      />
    </div>
  );
}
