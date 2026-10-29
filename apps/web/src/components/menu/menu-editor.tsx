'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startTransition, useOptimistic, useRef, useState, useTransition } from 'react';
import { fill, formatPrice, parsePastedMenu, type ImportPayload, type Locale, type MenuDraft, type MenuItem } from '@savora/shared';
import type { Dictionary } from '@/app/[lang]/dictionaries';
import { send } from '@/lib/client-api';
import { cx } from '@/lib/cx';
import { primaryName, secondaryName } from '@/lib/menu-text';
import { plural } from '@/lib/plural';
import { Button } from '../ui/button';
import { Card, Overline } from '../ui/card';
import { CategoriesDialog } from './categories-dialog';
import { HealthCard } from './health-card';
import { ConfirmDialog, ItemDialog } from './item-dialog';
import { ItemRow } from './item-row';
import { PasteReviewDialog } from './paste-review-dialog';
import { PublishCard } from './publish-card';

export type EditorText = Dictionary['editor'];

type Open =
  | { kind: 'none' }
  | { kind: 'item'; item: MenuItem | null; categoryId?: string }
  | { kind: 'delete'; item: MenuItem }
  | { kind: 'categories' }
  | { kind: 'review'; parsed: ImportPayload; notes?: string[] };

/** Changes the list shows the moment they are made, before the API has answered. */
type Edit = { kind: 'available'; id: string; on: boolean } | { kind: 'move'; id: string; direction: 'up' | 'down' } | { kind: 'delete'; id: string };

function applyEdit(draft: MenuDraft, e: Edit): MenuDraft {
  const categories = draft.categories.map((c) => {
    const i = c.items.findIndex((item) => item.id === e.id);
    if (i < 0) return c;
    const items = [...c.items];
    if (e.kind === 'available') items[i] = { ...items[i]!, available: e.on };
    else if (e.kind === 'delete') items.splice(i, 1);
    else {
      // Moves stay inside the category, as on the server (the buttons are off at its ends).
      const j = e.direction === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= items.length) return c;
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return { ...c, items };
  });
  return { ...draft, categories };
}

/** The Menu editor. Every change saves straight to the draft and the page re-reads it from the API,
 *  so what is on screen is always what is stored. Quick changes (show/hide, reorder, delete) appear
 *  at once and roll back with a notice if the save fails. */
export function MenuEditor({
  draft,
  t,
  locale,
  brand,
  reader,
}: {
  draft: MenuDraft;
  t: EditorText;
  locale: Locale;
  brand: { name: string; tagline: string | null };
  /** Reading a menu from photos: in the plan, and switched on on the server. */
  reader: { allowed: boolean; ai: boolean };
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [open, setOpen] = useState<Open>({ kind: 'none' });
  const [filter, setFilter] = useState<string>('all');
  const [paste, setPaste] = useState('');
  const [reading, setReading] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [view, show] = useOptimistic(draft, applyEdit);
  const { location } = draft;
  const { categories } = view;
  const items = categories.flatMap((c) => c.items);
  const shown = filter === 'all' ? categories : categories.filter((c) => c.id === filter);
  const activeFilter = shown.length ? filter : 'all';
  const visible = (activeFilter === 'all' ? categories : shown).flatMap((c) => c.items.map((item, i) => ({ item, category: c, first: i === 0, last: i === c.items.length - 1 })));
  const price = (minor: number) => formatPrice(minor, location.currency);

  const say = (text: string, tone: 'ok' | 'error' = 'ok') => {
    clearTimeout(noticeTimer.current);
    setNotice({ text, tone });
    noticeTimer.current = setTimeout(() => setNotice(null), 5000);
  };
  const refresh = () => startRefresh(() => router.refresh());

  /** Shows `e` straight away, saves it, then re-reads the draft. The optimistic view lasts until
   *  the re-read lands (or, when the save fails, until the action ends, so it snaps back). */
  const edit = (e: Edit, method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) =>
    new Promise<void>((done) =>
      startTransition(async () => {
        show(e);
        const res = await send(method, path, body);
        if (res.ok) router.refresh();
        else say(t.failed, 'error');
        done();
      }),
    );

  function organize() {
    const parsed = parsePastedMenu(paste, { nameEn: 'Menu', nameAr: 'القائمة' });
    setOpen({ kind: 'review', parsed });
  }

  /** Sends photos or a PDF to be read, then shows the result in the review dialog. */
  async function read(files: File[]) {
    if (!files.length) return;
    if (files.length > 5) return say(t.readTooLarge, 'error');
    if (files.filter((f) => f.type === 'application/pdf').length > 1) return say(t.readOnePdf, 'error');
    const body = new FormData();
    for (const f of files) body.append('file', f);
    setReading(true);
    const res = await fetch(`/api/locations/${location.id}/menu/read`, { method: 'POST', body }).catch(() => null);
    setReading(false);
    const data = res?.headers.get('content-type')?.includes('json') ? await res.json() : null;
    if (!res?.ok) {
      const code = data?.error;
      const errors: Record<string, string> = {
        ai_unavailable: t.readUnavailable,
        nothing_found: t.readNothing,
        not_a_menu_file: t.readNotMenu,
        too_large: t.readTooLarge,
        one_pdf: t.readOnePdf,
        ai_busy: t.readBusy,
        ai_declined: t.readDeclined,
        too_long: t.readTooLarge,
      };
      return say(res?.status === 429 ? t.readLimit : (errors[code] ?? t.failed), 'error');
    }
    const notes: string[] = [...(data.currencyMismatch ? [fill(t.readCurrency, { currency: data.currencyMismatch })] : []), ...(data.notes ?? [])];
    setOpen({ kind: 'review', parsed: { categories: data.categories }, notes });
  }

  const first = categories.find((c) => c.items.length);
  const firstItem = first?.items[0];

  return (
    <div className={cx('transition-opacity', refreshing && 'opacity-90')}>
      {/* Studio: three ways in, and a first look at the guest menu. Always dark, as in the design. */}
      <section className="mt-7 grid overflow-hidden rounded-[20px] border border-line bg-[#1f1f1f] text-[#f1f1f1] lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <div className="p-6 sm:p-9">
          <p className="flex items-center gap-2.5 text-overline font-semibold tracking-[0.13em] text-gold uppercase">
            <span aria-hidden className="h-px w-6 bg-current" />
            {t.studioOverline}
          </p>
          <h2 className="mt-4 max-w-[520px] text-heading-l leading-[1.05] font-bold tracking-[-0.03em] text-[#f5f5f5] sm:text-[40px]">{items.length ? t.studioTitleFilled : t.studioTitle}</h2>
          <p className="mt-3.5 max-w-[520px] text-body-s text-[#a9a9a9]">{t.studioBody}</p>
          <div className="mt-7 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-caption font-semibold text-[#f5f5f5]">{t.choose}</p>
            <p className="text-[11px] text-[#8e8e8e]">{t.reviewNote}</p>
          </div>
          <div className="mt-3 grid gap-2.5 md:grid-cols-[1fr_1.15fr_0.95fr]">
            {/* 01 — read a photo or PDF with AI (Growth). */}
            <UploadCard reader={reader} reading={reading} t={t} locale={locale} onFiles={read}>
              <span className="font-mono text-[10px] font-bold text-[#b9b9b9]">01</span>
              <span aria-hidden className="mt-4 grid size-9 place-items-center rounded-[10px] bg-white/10">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#d9d9d9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </span>
              <strong className="mt-3.5 text-caption font-semibold text-[#d9d9d9]">{t.uploadTitle}</strong>
              <small className="mt-1.5 text-[11px] leading-snug text-[#9d9d9d]">{reader.allowed && reader.ai ? t.uploadHint : t.uploadBody}</small>
              <span className={cx('mt-auto rounded-full px-2.5 py-1 text-[10px] font-semibold', reader.allowed && reader.ai ? 'bg-gold text-[#242424]' : 'bg-gold/15 text-gold')}>
                {!reader.allowed ? t.uploadGrowth : !reader.ai ? t.uploadOff : reading ? t.uploadReading : t.uploadCta}
              </span>
            </UploadCard>

            {/* 02 — paste */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (paste.trim()) organize();
              }}
              className="flex min-h-[200px] flex-col items-start rounded-[13px] border border-white/15 bg-white/5 p-4 transition-colors focus-within:border-gold"
            >
              <span className="font-mono text-[10px] font-bold text-gold">02</span>
              <strong className="mt-3 text-caption font-semibold">{t.pasteTitle}</strong>
              <label className="sr-only" htmlFor="paste-menu">
                {t.pasteLabel}
              </label>
              <textarea
                id="paste-menu"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder={t.pastePlaceholder}
                rows={4}
                className="mt-2.5 w-full flex-1 resize-y rounded-lg border border-white/20 bg-black/25 p-2.5 text-caption text-[#f1f1f1] outline-none placeholder:text-[#8e8e8e] focus:border-gold"
              />
              <button type="submit" disabled={!paste.trim()} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-caption font-semibold text-[#242424] transition-opacity disabled:opacity-40">
                {t.pasteCta} <span aria-hidden>{locale === 'ar' ? '←' : '→'}</span>
              </button>
            </form>

            {/* 03 — blank */}
            <button
              type="button"
              onClick={() => setOpen({ kind: 'item', item: null })}
              className="group flex min-h-[200px] flex-col items-start rounded-[13px] bg-brand-fill p-4 text-start text-white transition-transform hover:-translate-y-0.5"
            >
              <span className="font-mono text-[10px] font-bold">03</span>
              <span aria-hidden className="mt-4 grid size-9 place-items-center rounded-[10px] bg-white/20 text-[20px] leading-none font-light">
                +
              </span>
              <strong className="mt-3.5 text-caption font-semibold">{t.blankTitle}</strong>
              <small className="mt-1.5 text-[11px] leading-snug">{t.blankBody}</small>
              <span className="mt-auto pt-3 text-[11px] font-semibold">
                {items.length ? t.blankCtaFilled : t.blankCta} <span aria-hidden>{locale === 'ar' ? '←' : '→'}</span>
              </span>
            </button>
          </div>
        </div>

        <aside className="flex flex-col justify-center border-t border-white/10 bg-black/20 p-6 sm:p-9 lg:border-t-0 lg:border-s">
          <p className="text-overline font-semibold tracking-[0.13em] text-gold uppercase">{t.previewOverline}</p>
          <h3 className="mt-2.5 max-w-[260px] text-heading-m leading-[1.1] font-bold tracking-[-0.03em] text-[#f5f5f5]">{t.previewTitle}</h3>
          <p className="mt-2.5 max-w-[260px] text-caption text-[#9d9d9d]">{t.previewBody}</p>
          <div className="mt-6 max-w-[320px] -rotate-2 rounded-xl bg-white p-5 text-[#242424] shadow-[0_18px_40px_rgb(0_0_0/0.35)] transition-transform duration-300 hover:rotate-0">
            <div className="flex items-center justify-between font-mono text-[9px] tracking-[0.08em] text-[#6b6b6b] uppercase">
              <span aria-hidden className="grid size-6 place-items-center rounded-full border border-[#db1a1a] font-sans text-[11px] font-bold text-[#db1a1a]">
                {brand.name.slice(0, 1)}
              </span>
              {t.previewLayout}
            </div>
            <div className="py-3.5 text-center">
              <strong className="block text-heading-s font-bold tracking-[-0.02em]">{brand.name}</strong>
              {brand.tagline && <small className="mt-0.5 block text-[10px] text-[#6b6b6b]">{brand.tagline}</small>}
            </div>
            <div className="h-px bg-[#eaeaea]" />
            {first && firstItem ? (
              <>
                <div className="mt-3.5 flex justify-between gap-3 font-mono text-[9px] font-bold tracking-[0.09em] text-[#db1a1a] uppercase">
                  {/* Monospace caps suit Latin labels; Arabic needs its own joined letterforms. */}
                  <span className={locale === 'ar' ? 'font-sans tracking-normal' : undefined}>{primaryName(first, locale)}</span>
                  {secondaryName(first, locale) && <b className="font-sans font-medium text-[#6b6b6b] normal-case">{secondaryName(first, locale)}</b>}
                </div>
                <div className="mt-2 flex justify-between gap-3 text-caption">
                  <span className="truncate">{primaryName(firstItem, locale)}</span>
                  <strong className="font-mono text-[#db1a1a]">{price(firstItem.priceMinor)}</strong>
                </div>
              </>
            ) : (
              <p className="mt-3.5 text-center text-[11px] text-[#6b6b6b]">{t.previewEmpty}</p>
            )}
            <div aria-hidden className="mt-4 flex gap-1">
              <span className="h-0.5 w-10 bg-[#db1a1a]" />
              <span className="h-0.5 w-5 bg-[#e8e8e8]" />
              <span className="h-0.5 w-5 bg-[#e8e8e8]" />
            </div>
          </div>
        </aside>
      </section>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
        <PublishCard
          draft={draft}
          t={t}
          locale={locale}
          onPublished={(version) => {
            say(fill(t.published, { n: version }));
            refresh();
          }}
          onError={(text) => say(text, 'error')}
        />
        <HealthCard
          checks={draft.health}
          categories={categories}
          currency={location.currency}
          t={t}
          locale={locale}
          onEditItem={(item) => setOpen({ kind: 'item', item })}
          onEditCategories={() => setOpen({ kind: 'categories' })}
        />
      </div>

      <section className="mt-9" aria-labelledby="items-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Overline>{t.itemsOverline}</Overline>
            <h2 id="items-heading" className="mt-1.5 text-heading-m font-semibold tracking-[-0.02em]">
              {plural(locale, items.length, t.items)} <span className="font-normal text-muted">· {plural(locale, categories.length, t.categoriesCount)}</span>
            </h2>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {categories.length > 0 && (
              <Button variant="secondary" onClick={() => setOpen({ kind: 'categories' })}>
                {t.manageCategories}
              </Button>
            )}
            <Button onClick={() => setOpen({ kind: 'item', item: null, categoryId: activeFilter === 'all' ? undefined : activeFilter })}>+ {t.addItem}</Button>
          </div>
        </div>

        {categories.length > 0 && (
          <div role="group" aria-label={t.category} className="mt-4 flex flex-wrap gap-2">
            {[{ id: 'all', label: t.all, n: items.length }, ...categories.map((c) => ({ id: c.id, label: primaryName(c, locale), n: c.items.length }))].map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={activeFilter === c.id}
                onClick={() => setFilter(c.id)}
                className={cx(
                  'rounded-full border px-3.5 py-1.5 text-caption font-semibold transition-colors',
                  activeFilter === c.id ? 'border-ink bg-ink text-surface' : 'border-line-2 bg-surface text-ink-2 hover:border-ink',
                )}
              >
                {c.label} <span className="opacity-75">{c.n}</span>
              </button>
            ))}
          </div>
        )}

        {items.length === 0 ? (
          <Card className="mt-4 grid place-items-center gap-1.5 p-10 text-center">
            <p className="text-title-m font-semibold">{t.emptyTitle}</p>
            <p className="text-body-s text-muted">{t.emptyBody}</p>
          </Card>
        ) : visible.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-line-2 p-8 text-center text-body-s text-muted">{t.filterEmpty}</p>
        ) : (
          <ul className="mt-4 grid gap-2">
            {visible.map(({ item, category, first, last }) => (
              <ItemRow
                key={item.id}
                item={item}
                categoryLabel={primaryName(category, locale)}
                price={price(item.priceMinor)}
                first={first}
                last={last}
                t={t}
                locale={locale}
                onToggle={(on) => edit({ kind: 'available', id: item.id, on }, 'PATCH', `/items/${item.id}`, { available: on })}
                onMove={(direction) => edit({ kind: 'move', id: item.id, direction }, 'POST', `/items/${item.id}/move`, { direction })}
                onEdit={() => setOpen({ kind: 'item', item })}
                onDelete={() => setOpen({ kind: 'delete', item })}
              />
            ))}
          </ul>
        )}
      </section>

      <ItemDialog
        open={open.kind === 'item'}
        item={open.kind === 'item' ? open.item : null}
        defaultCategoryId={open.kind === 'item' ? open.categoryId : undefined}
        draft={draft}
        t={t}
        locale={locale}
        onClose={() => setOpen({ kind: 'none' })}
        onSaved={() => {
          setOpen({ kind: 'none' });
          refresh();
        }}
      />
      <ConfirmDialog
        open={open.kind === 'delete'}
        title={open.kind === 'delete' ? fill(t.deleteTitle, { name: primaryName(open.item, locale) }) : ''}
        body={t.deleteBody}
        confirm={t.deleteConfirm}
        t={t}
        onClose={() => setOpen({ kind: 'none' })}
        onConfirm={async () => {
          if (open.kind !== 'delete') return;
          const id = open.item.id;
          setOpen({ kind: 'none' });
          await edit({ kind: 'delete', id }, 'DELETE', `/items/${id}`);
        }}
      />
      <CategoriesDialog open={open.kind === 'categories'} categories={categories} t={t} locale={locale} locationId={location.id} onClose={() => setOpen({ kind: 'none' })} onChanged={refresh} />
      <PasteReviewDialog
        open={open.kind === 'review'}
        parsed={open.kind === 'review' ? open.parsed : { categories: [] }}
        notes={open.kind === 'review' ? open.notes : undefined}
        currency={location.currency}
        t={t}
        locale={locale}
        onClose={() => setOpen({ kind: 'none' })}
        onConfirm={async (parsed) => {
          const res = await send<{ items: number }>('POST', `/locations/${location.id}/import`, parsed);
          if (!res.ok) return say(t.failed, 'error');
          setOpen({ kind: 'none' });
          setPaste('');
          say(plural(locale, res.data?.items ?? 0, t.added));
          refresh();
        }}
      />

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
    </div>
  );
}

/** The first start point. Growth with AI on: a file picker (and drop target) for photos or a PDF.
 *  Starter: a link to the plans. AI off: shown, but inactive. */
function UploadCard({ reader, reading, t, locale, onFiles, children }: { reader: { allowed: boolean; ai: boolean }; reading: boolean; t: EditorText; locale: Locale; onFiles: (f: File[]) => void; children: React.ReactNode }) {
  const box = 'flex min-h-[200px] flex-col items-start rounded-[13px] border border-dashed border-white/20 bg-white/[0.03] p-4 text-start';
  if (!reader.allowed)
    return (
      <Link href={`/${locale}/app/billing`} className={cx(box, 'transition-colors hover:border-gold')}>
        {children}
      </Link>
    );
  if (!reader.ai)
    return (
      <div aria-disabled className={box}>
        {children}
      </div>
    );
  return (
    <label
      aria-busy={reading}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (!reading) onFiles([...e.dataTransfer.files]);
      }}
      className={cx(box, 'cursor-pointer border-white/30 transition-colors focus-within:border-gold hover:border-gold', reading && 'animate-pulse cursor-wait')}
    >
      <input
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,application/pdf"
        disabled={reading}
        className="sr-only"
        aria-label={t.uploadTitle}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          onFiles(files);
        }}
      />
      {children}
    </label>
  );
}
