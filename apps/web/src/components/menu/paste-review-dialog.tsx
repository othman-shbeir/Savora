'use client';

import { useState } from 'react';
import { formatPrice, type ImportPayload, type Locale } from '@savora/shared';
import { primaryName, secondaryName } from '@/lib/menu-text';
import { plural } from '@/lib/plural';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import type { EditorText } from './menu-editor';

/** Shows what "Paste your menu" understood before anything is added to the draft. */
export function PasteReviewDialog({
  open,
  parsed,
  currency,
  t,
  locale,
  onClose,
  onConfirm,
}: {
  open: boolean;
  parsed: ImportPayload;
  currency: string;
  t: EditorText;
  locale: Locale;
  onClose: () => void;
  onConfirm: (parsed: ImportPayload) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const count = parsed.categories.reduce((n, c) => n + c.items.length, 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.reviewTitle}
      description={count ? t.reviewBody : undefined}
      closeLabel={t.close}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t.cancel}
          </Button>
          {count > 0 && (
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await onConfirm(parsed);
                setBusy(false);
              }}
            >
              {busy ? t.adding : `${t.addToDraft} · ${plural(locale, count, t.items)}`}
            </Button>
          )}
        </>
      }
    >
      {count === 0 ? (
        <p className="rounded-xl bg-gold-soft p-4 text-body-s">{t.reviewNothing}</p>
      ) : (
        <div className="grid gap-5">
          {parsed.categories.map((c, ci) => (
            <section key={ci}>
              <h3 className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
                <span className="text-overline font-semibold tracking-[0.1em] text-brand uppercase">{primaryName(c, locale)}</span>
                <span className="text-caption text-muted">{secondaryName(c, locale) ?? plural(locale, c.items.length, t.items)}</span>
              </h3>
              <ul className="mt-1">
                {c.items.map((i, ii) => (
                  <li key={ii} className="flex items-baseline justify-between gap-4 border-b border-dashed border-line py-2.5 last:border-0">
                    <span className="min-w-0">
                      <span className="block text-body-s font-semibold">{primaryName(i, locale)}</span>
                      {(secondaryName(i, locale) || i.descriptionEn || i.descriptionAr) && (
                        <span className="block truncate text-caption text-muted">
                          {[secondaryName(i, locale), locale === 'ar' ? (i.descriptionAr ?? i.descriptionEn) : (i.descriptionEn ?? i.descriptionAr)].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                    <span dir="ltr" className="shrink-0 font-mono text-body-s font-semibold">
                      {formatPrice(i.priceMinor, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Dialog>
  );
}
