'use client';

import { useState } from 'react';
import { fill, type Locale, type MenuCategory } from '@savora/shared';
import { cx } from '@/lib/cx';
import { primaryName } from '@/lib/menu-text';
import { plural } from '@/lib/plural';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import type { EditorText } from './menu-editor';

const input =
  'h-10 w-full min-w-0 rounded-[10px] border border-line-2 bg-surface px-3 text-body-s outline-none placeholder:text-muted focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-soft)]';
const iconButton = 'grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-30';

/** Rename, reorder, add and delete categories. Changes go to the editor's unsaved copy; the page's
 *  Save sends them with everything else. */
export function CategoriesDialog({
  open,
  categories,
  t,
  locale,
  onClose,
  onRename,
  onMove,
  onDelete,
  onAdd,
}: {
  open: boolean;
  categories: MenuCategory[];
  t: EditorText;
  locale: Locale;
  onClose: () => void;
  onRename: (id: string, names: Names) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onDelete: (id: string) => void;
  onAdd: (names: Names) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <Dialog open={open} onClose={onClose} title={t.categoriesTitle} description={t.categoriesBody} closeLabel={t.close} size="lg">
      <div className="grid gap-2.5">
        <div aria-hidden className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 px-1 text-caption font-medium text-muted sm:grid">
          <span>{t.categoryNameEn}</span>
          <span>{t.categoryNameAr}</span>
          <span className="w-[182px]" />
        </div>
        {categories.map((c, i) => (
          <CategoryRow
            key={`${c.id}:${c.nameEn}:${c.nameAr}`}
            category={c}
            first={i === 0}
            last={i === categories.length - 1}
            t={t}
            locale={locale}
            confirming={confirming === c.id}
            onSave={async (names) => (onRename(c.id, names), true)}
            onMove={async (direction) => (onMove(c.id, direction), true)}
            onAskDelete={() => setConfirming(c.id)}
            onCancelDelete={() => setConfirming(null)}
            onDelete={async () => {
              onDelete(c.id);
              setConfirming(null);
            }}
          />
        ))}
        <NewCategory t={t} onAdd={async (names) => (onAdd(names), true)} />
      </div>
    </Dialog>
  );
}

type Names = { nameEn: string | null; nameAr: string | null };
const clean = (v: string) => v.trim() || null;

function CategoryRow({
  category,
  first,
  last,
  t,
  locale,
  confirming,
  onSave,
  onMove,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  category: MenuCategory;
  first: boolean;
  last: boolean;
  t: EditorText;
  locale: Locale;
  confirming: boolean;
  onSave: (n: Names) => Promise<boolean>;
  onMove: (d: 'up' | 'down') => Promise<boolean>;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => Promise<void>;
}) {
  const [en, setEn] = useState(category.nameEn ?? '');
  const [ar, setAr] = useState(category.nameAr ?? '');
  const [busy, setBusy] = useState(false);
  const name = primaryName(category, locale);
  const dirty = clean(en) !== category.nameEn || clean(ar) !== category.nameAr;
  const valid = Boolean(clean(en) || clean(ar));

  if (confirming) {
    return (
      <div role="alertdialog" aria-label={fill(t.deleteCategoryTitle, { name })} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand bg-brand-soft p-3">
        <div>
          <p className="text-body-s font-semibold">{fill(t.deleteCategoryTitle, { name })}</p>
          <p className="text-caption text-muted">{plural(locale, category.items.length, t.deleteCategoryBody)}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onCancelDelete}>
            {t.cancel}
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onDelete();
              setBusy(false);
            }}
          >
            {t.deleteConfirm}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="grid grid-cols-2 items-center gap-2 rounded-xl border border-line p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:border-0 sm:p-0"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!dirty || !valid) return;
        setBusy(true);
        await onSave({ nameEn: clean(en), nameAr: clean(ar) });
        setBusy(false);
      }}
    >
      <input aria-label={`${t.categoryNameEn} · ${name}`} value={en} onChange={(e) => setEn(e.target.value)} dir="ltr" lang="en" maxLength={80} className={input} />
      <input aria-label={`${t.categoryNameAr} · ${name}`} value={ar} onChange={(e) => setAr(e.target.value)} dir="rtl" lang="ar" maxLength={80} className={input} />
      <div className="col-span-2 flex items-center justify-end gap-0.5 sm:col-span-1">
        <Button type="submit" size="sm" variant={dirty ? 'primary' : 'ghost'} disabled={!dirty || !valid || busy} className="me-1 w-16">
          {t.saveCategory}
        </Button>
        <button type="button" className={iconButton} disabled={first} aria-label={fill(t.moveUp, { name })} onClick={() => onMove('up')}>
          <span aria-hidden>↑</span>
        </button>
        <button type="button" className={iconButton} disabled={last} aria-label={fill(t.moveDown, { name })} onClick={() => onMove('down')}>
          <span aria-hidden>↓</span>
        </button>
        <button type="button" className={cx(iconButton, 'hover:bg-brand-soft hover:text-brand')} aria-label={fill(t.delete, { name })} onClick={onAskDelete}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
    </form>
  );
}

function NewCategory({ t, onAdd }: { t: EditorText; onAdd: (n: Names) => Promise<boolean> }) {
  const [en, setEn] = useState('');
  const [ar, setAr] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = Boolean(clean(en) || clean(ar));
  return (
    <form
      className="mt-2 grid grid-cols-2 items-center gap-2 border-t border-line pt-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        if (await onAdd({ nameEn: clean(en), nameAr: clean(ar) })) {
          setEn('');
          setAr('');
        }
        setBusy(false);
      }}
    >
      <input aria-label={`${t.addCategory} · ${t.categoryNameEn}`} placeholder={t.categoryNameEn} value={en} onChange={(e) => setEn(e.target.value)} dir="ltr" lang="en" maxLength={80} className={input} />
      <input aria-label={`${t.addCategory} · ${t.categoryNameAr}`} placeholder={t.categoryNameAr} value={ar} onChange={(e) => setAr(e.target.value)} dir="rtl" lang="ar" maxLength={80} className={input} />
      <Button type="submit" size="sm" variant="secondary" disabled={!valid || busy} className="col-span-2 sm:col-span-1 sm:w-[182px]">
        + {t.addCategory}
      </Button>
    </form>
  );
}
