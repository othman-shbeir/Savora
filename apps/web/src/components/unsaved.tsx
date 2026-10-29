'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import type { Dictionary } from '@/app/[lang]/dictionaries';
import { cx } from '@/lib/cx';
import { setLeaveAsker, unsaved, useUnsavedEntry } from '@/lib/unsaved';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';

export type UnsavedText = Dictionary['unsaved'];

/** Keeps the owner on a page with unsaved changes until they save or discard them: closing or
 *  reloading the tab (the browser's own prompt), following any link in the app, switching location
 *  and signing out (both call guardLeave). Mounted once, in the workspace layout. */
export function UnsavedGuard({ t }: { t: UnsavedText }) {
  const router = useRouter();
  const entry = useUnsavedEntry();
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const dirty = Boolean(entry?.dirty);

  useEffect(() => {
    setLeaveAsker((then) => {
      setFailed(false);
      setPending(() => then);
    });
    return () => setLeaveAsker(null);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    // Capture phase on the document runs before React and Next's <Link> see the click.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      const same = url.origin === location.origin;
      // A jump within the page (#section) leaves nothing behind.
      if (same && url.pathname === location.pathname && url.search === location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setFailed(false);
      setPending(() => () => (same ? router.push(url.pathname + url.search + url.hash) : location.assign(url.href)));
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty, router]);

  const leave = () => {
    const then = pending;
    setPending(null);
    then?.();
  };

  return (
    <Dialog
      open={pending !== null}
      onClose={() => !busy && setPending(null)}
      title={t.leaveTitle}
      description={t.leaveBody}
      closeLabel={t.close}
      size="sm"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>
            {t.stay}
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              unsaved.get()?.discard();
              leave();
            }}
          >
            {t.discardLeave}
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const ok = (await unsaved.get()?.save()) ?? true;
              setBusy(false);
              if (ok) leave();
              else setFailed(true);
            }}
          >
            {busy ? t.saving : t.saveLeave}
          </Button>
        </div>
      }
    >
      {failed && (
        <p role="alert" className="rounded-xl bg-brand-soft px-4 py-3 text-body-s text-brand">
          {t.saveFailed}
        </p>
      )}
    </Dialog>
  );
}

/** Floats at the bottom of a page while it has unsaved changes: look at them first, then save or
 *  discard. Discarding asks once, since it can't be undone. */
export function UnsavedBar({
  dirty,
  saving,
  t,
  onPreview,
  onSave,
  onDiscard,
  note,
}: {
  dirty: boolean;
  saving: boolean;
  t: UnsavedText;
  onPreview?: () => void;
  onSave: () => void;
  onDiscard: () => void;
  /** Extra line, e.g. how many changes. */
  note?: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <div
        role="region"
        aria-label={t.bar}
        className={cx(
          'fixed start-1/2 bottom-5 z-40 flex w-[min(640px,calc(100vw-24px))] -translate-x-1/2 flex-wrap items-center gap-x-4 gap-y-2.5 rounded-2xl bg-ink px-4 py-3 text-surface shadow-raised transition-[opacity,translate] duration-200 rtl:translate-x-1/2',
          dirty ? 'opacity-100' : 'pointer-events-none translate-y-4 opacity-0',
        )}
        aria-hidden={!dirty}
      >
        <p className="flex min-w-0 flex-1 basis-48 items-center gap-2.5 text-body-s font-semibold">
          <span aria-hidden className="size-2 shrink-0 animate-pulse rounded-full bg-gold" />
          <span className="min-w-0">
            {t.bar}
            {note && <span className="block text-caption font-normal opacity-70">{note}</span>}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {onPreview && (
            <button type="button" tabIndex={dirty ? 0 : -1} onClick={onPreview} className="h-9 rounded-[10px] border border-white/25 px-3.5 text-caption font-semibold hover:bg-white/10">
              {t.preview}
            </button>
          )}
          <button
            type="button"
            tabIndex={dirty ? 0 : -1}
            onClick={() => setConfirming(true)}
            disabled={saving}
            className="h-9 rounded-[10px] px-3.5 text-caption font-semibold opacity-80 hover:bg-white/10 hover:opacity-100 disabled:opacity-40"
          >
            {t.discard}
          </button>
          <button
            type="button"
            tabIndex={dirty ? 0 : -1}
            onClick={onSave}
            disabled={saving}
            className="h-9 rounded-[10px] bg-brand-fill px-4 text-caption font-semibold text-white hover:bg-brand-fill-hover disabled:opacity-60"
          >
            {saving ? t.saving : t.save}
          </button>
        </div>
      </div>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t.discardTitle}
        description={t.discardBody}
        closeLabel={t.close}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t.keepEditing}
            </Button>
            <Button
              onClick={() => {
                setConfirming(false);
                onDiscard();
              }}
            >
              {t.discardConfirm}
            </Button>
          </div>
        }
      />
    </>
  );
}
