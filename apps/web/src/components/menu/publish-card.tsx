'use client';

import { useState } from 'react';
import { fill, type Locale, type MenuDraft } from '@savora/shared';
import { send } from '@/lib/client-api';
import { plural } from '@/lib/plural';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, Overline } from '../ui/card';
import type { EditorText } from './menu-editor';

/** Draft → guest view, with the release note and the one button that changes what guests see.
 *  `unsaved` holds publishing back, so guests never get edits the owner hasn't saved. */
export function PublishCard({
  draft,
  unsaved,
  t,
  locale,
  onPublished,
  onError,
}: {
  draft: MenuDraft;
  unsaved?: boolean;
  t: EditorText;
  locale: Locale;
  onPublished: (version: number) => void;
  onError: (text: string) => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = draft.categories.reduce((n, c) => n + c.items.filter((i) => i.available).length, 0);
  const { published, hasChanges } = draft;
  const canPublish = hasChanges && ready > 0 && !busy && !unsaved;

  async function publish() {
    setBusy(true);
    const res = await send<{ version?: number; error?: string }>('POST', `/locations/${draft.location.id}/publish`, { note: note.trim() || null });
    setBusy(false);
    if (res.ok && res.data?.version) {
      setNote('');
      onPublished(res.data.version);
    } else onError(res.data?.error === 'empty_menu' ? t.emptyMenu : t.failed);
  }

  const status = !published ? { tone: 'gold' as const, text: t.statusNever } : hasChanges ? { tone: 'gold' as const, text: t.statusChanges } : { tone: 'ok' as const, text: t.statusLive };

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-[1_1_240px] items-start gap-3">
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-ok-soft text-ok">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="3.5" />
            </svg>
          </span>
          <div>
            <Overline>{t.publishOverline}</Overline>
            <h2 className="mt-1 text-heading-s font-semibold">{t.publishTitle}</h2>
            <p className="mt-1 max-w-[380px] text-caption text-muted">{t.publishBody}</p>
          </div>
        </div>
        <Badge tone={status.tone}>{status.text}</Badge>
      </div>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] items-center sm:grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)] gap-1.5 rounded-[14px] border border-line bg-surface-2 p-1.5">
        <div className="flex items-center gap-2.5 rounded-[10px] bg-gold-soft px-3 py-2.5">
          <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-lg bg-gold text-[12px] font-bold text-[#242424]">
            ✎
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.09em] text-muted uppercase">{t.draftLabel}</p>
            <p className="truncate text-caption font-semibold">
              {plural(locale, ready, t.items)} <span className="font-normal text-muted">{t.itemsReady}</span>
            </p>
          </div>
        </div>
        <span aria-hidden className="hidden text-center text-muted sm:block">
          {locale === 'ar' ? '←' : '→'}
        </span>
        <div className="flex items-center gap-2.5 rounded-[10px] bg-ok-soft px-3 py-2.5">
          <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-lg bg-ok text-[12px] font-bold text-white">
            ◉
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.09em] text-muted uppercase">{t.guestView}</p>
            <p className="truncate text-caption font-semibold">{published ? `${fill(t.version, { n: published.version })} · ${plural(locale, published.itemCount, t.items)}` : t.notYet}</p>
          </div>
        </div>
      </div>

      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (canPublish) publish();
        }}
      >
        <label className="grid min-w-[200px] flex-1 gap-1.5 text-caption font-medium text-ink-2">
          {t.noteLabel}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={140}
            placeholder={t.notePlaceholder}
            disabled={!hasChanges}
            className="h-10 rounded-[10px] border border-line-2 bg-surface px-3 text-body-s outline-none placeholder:text-muted focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-soft)] disabled:opacity-50"
          />
        </label>
        <Button type="submit" disabled={!canPublish}>
          {busy ? t.publishing : !hasChanges ? t.upToDate : published ? t.publish : t.publishFirst}
        </Button>
      </form>
      {unsaved ? <p className="mt-2 text-caption text-gold-ink">{t.saveBeforePublish}</p> : hasChanges && ready === 0 && <p className="mt-2 text-caption text-brand">{t.emptyMenu}</p>}
    </Card>
  );
}
