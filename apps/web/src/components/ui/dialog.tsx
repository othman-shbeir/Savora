'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cx } from '@/lib/cx';

/** Modal built on <dialog>: the browser traps focus, makes the page inert and closes on Escape.
 *  Clicking the dimmed backdrop closes it too. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  closeLabel,
  size = 'md',
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  closeLabel: string;
  size?: 'sm' | 'md' | 'lg';
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        'm-auto max-h-[min(88dvh,820px)] w-[calc(100vw-32px)] overflow-hidden rounded-[20px] border border-line bg-surface p-0 text-ink shadow-raised backdrop:bg-black/45',
        size === 'sm' ? 'max-w-[420px]' : size === 'md' ? 'max-w-[560px]' : 'max-w-[760px]',
      )}
    >
      {open && (
        <div className="flex max-h-[inherit] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line px-6 pt-5 pb-4">
            <div>
              <h2 id={titleId} className="text-heading-s font-semibold">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-body-s text-muted">
                  {description}
                </p>
              )}
            </div>
            <button type="button" onClick={onClose} aria-label={closeLabel} className="-me-2 grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </header>
          {/* Confirmations can be a title, a sentence and buttons, with no body at all. */}
          {children ? <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div> : null}
          {footer && <footer className="flex flex-wrap items-center justify-end gap-2.5 border-t border-line bg-surface-2 px-6 py-4">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
