'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { fill, plansEnabled, rank, type Locale, type Photo, type PlanId, type ThemeEntry, type ThemesOverview, type ThemeTag } from '@savora/shared';
import type { Dictionary } from '@/app/[lang]/dictionaries';
import { send } from '@/lib/client-api';
import { cx } from '@/lib/cx';
import { planName } from '@/lib/plan-name';
import { useUnsavedChanges } from '@/lib/unsaved';
import { Button, ButtonLink } from '../ui/button';
import { Card, Overline } from '../ui/card';
import { Dialog } from '../ui/dialog';
import { Segmented } from '../ui/segmented';
import { Switch } from '../ui/switch';
import { UnsavedBar } from '../unsaved';
import { ThemeAssistant, type Draft } from './theme-assistant';
import { Icon, ICON, MiniTheme, PhonePreview, TokenRow, type Look, type PreviewData } from './theme-preview';

type Filter = 'all' | ThemeTag;
type Assets = { logo: Photo | null; cover: Photo | null };
const NO_ASSETS: Assets = { logo: null, cover: null };

/** Menu themes: a live preview of the guest menu first, with the gallery slider (plan-gated) or the Theme assistant beside it. */
export function ThemesScreen({
  data,
  t,
  locale,
  orgId,
  locationId,
  locationName,
  slug,
  canEdit,
  userName,
  preview,
}: {
  data: ThemesOverview;
  t: Dictionary;
  locale: Locale;
  orgId: string;
  locationId: string;
  locationName: string;
  slug: string;
  canEdit: boolean;
  userName: string | null;
  preview: PreviewData;
}) {
  const th = t.themes;
  const router = useRouter();
  const all = [...data.presets, ...data.custom];
  const [tab, setTab] = useState<'gallery' | 'assistant'>('gallery');
  const [filter, setFilter] = useState<Filter>('all');
  // The theme in use; the selection starts there and Discard goes back to it.
  const savedRef = all.some((e) => e.ref === data.selectedRef) ? data.selectedRef : data.current.ref;
  const [selectedRef, setSelectedRef] = useState(savedRef);
  // An assistant option being previewed; saved as a custom theme when applied.
  const [draft, setDraft] = useState<Draft | null>(null);
  // The owner's photos the assistant picked as the logo or header. They stay until applied (with
  // whichever theme is chosen) or dropped, even when a later answer doesn't mention them.
  const [assets, setAssets] = useState<Assets>(NO_ASSETS);
  const [everywhere, setEverywhere] = useState(false);
  const [lang, setLang] = useState<Locale>(locale);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const [deleting, setDeleting] = useState<ThemeEntry | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const rail = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ back: false, forward: false });
  const rtl = locale === 'ar';

  const selected = all.find((e) => e.ref === selectedRef) ?? data.presets[0]!;
  const look: Look = draft ?? selected;
  const name = (x: { nameEn: string; nameAr: string | null }) => (locale === 'ar' && x.nameAr) || x.nameEn;
  const lockedCount = data.presets.filter((p) => !p.allowed).length;
  const changed = Boolean(draft) || selectedRef !== savedRef || everywhere || Boolean(assets.logo || assets.cover);
  const withAssets = { ...preview, logoUrl: assets.logo?.url ?? preview.logoUrl, coverUrl: assets.cover?.url ?? preview.coverUrl };
  const billing = `/${locale}/app/billing`;

  function say(text: string, tone: 'ok' | 'error' = 'ok') {
    setNotice({ text, tone });
    setTimeout(() => setNotice(null), 4000);
  }

  /** Resolves to whether it applied, for the leave-page prompt. */
  async function apply(): Promise<boolean> {
    setBusy(true);
    let ref = selectedRef;
    if (draft) {
      const { nameEn, nameAr, colors, font, boldPrices, corners, header, layout } = draft;
      const saved = await send<{ ref: string }>('POST', `/organizations/${orgId}/themes`, { nameEn, nameAr, colors, font, boldPrices, corners, header, layout });
      if (!saved.ok || !saved.data) {
        setBusy(false);
        say(th.failed, 'error');
        return false;
      }
      ref = saved.data.ref;
    }
    const body = { ref, everywhere, ...(assets.logo ? { logoPhotoId: assets.logo.id } : {}), ...(assets.cover ? { coverPhotoId: assets.cover.id } : {}) };
    const res = await fetch(`/api/locations/${locationId}/theme`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      say(th.failed, 'error');
      return false;
    }
    setDraft(null);
    setAssets(NO_ASSETS);
    setSelectedRef(ref);
    setEverywhere(false);
    setPreviewing(false);
    say(th.applied);
    router.refresh();
    return true;
  }
  const discard = () => {
    setDraft(null);
    setAssets(NO_ASSETS);
    setSelectedRef(savedRef);
    setEverywhere(false);
  };
  useUnsavedChanges(changed && canEdit, apply, discard);

  async function remove(e: ThemeEntry) {
    const res = await send('DELETE', `/organizations/${orgId}/themes/${e.ref.slice(7)}`);
    setDeleting(null);
    if (!res.ok) return say(th.failed, 'error');
    if (selectedRef === e.ref) setSelectedRef('auto');
    say(th.deleted);
    router.refresh();
  }

  const tierBadge = (e: Pick<ThemeEntry, 'tier' | 'allowed'>) =>
    e.tier === 'free' ? (
      <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-ok">{th.tierFree}</span>
    ) : e.tier === 'custom' ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-brand">
        <Icon d={ICON.spark} size={10} strokeWidth={2.4} />
        {th.tierCustom}
      </span>
    ) : e.allowed ? (
      <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-gold-ink">{th.tierGrowth}</span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-muted">
        <Icon d={ICON.lock} size={10} strokeWidth={2.4} />
        {th.tierGrowth}
      </span>
    );

  // ---------- Plan strip ----------
  const tiers: Array<{ p: PlanId; price: string; line: string }> = [
    { p: 'starter', price: th.starterPrice, line: th.starterLine },
    { p: 'growth', price: th.growthPrice, line: th.growthLine },
    { p: 'multi_location', price: th.multiPrice, line: th.multiLine },
  ];
  const planStrip = (
    <ul aria-label={th.planStrip} className="mt-3 grid gap-1.5 rounded-[18px] border border-line bg-surface-2 p-1.5 md:grid-cols-3">
      {tiers.map(({ p, price, line }) => {
        // While plans are switched off for testing, everything is included.
        const state = p === data.plan ? 'current' : rank(p) < rank(data.plan) || !plansEnabled() ? 'included' : 'locked';
        return (
          <li key={p} className={cx('flex items-start gap-3 rounded-[14px] px-4 py-3.5', state === 'current' && 'bg-surface shadow-[0_0_0_1.5px_var(--ink)]')}>
            <span className={cx('grid size-7 shrink-0 place-items-center rounded-full', state === 'locked' ? 'border border-line-2 bg-surface text-muted' : 'bg-ok text-white')}>
              <Icon d={state === 'locked' ? ICON.lock : ICON.check} size={13} strokeWidth={state === 'locked' ? 2.2 : 3} />
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-title-s font-semibold">{planName(p, t.billing)}</span>
                <span className="text-caption text-muted">{price}</span>
                {state === 'current' && <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold text-surface">{th.yourPlan}</span>}
              </span>
              <span className="mt-0.5 block text-caption text-muted">{line}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );

  // ---------- Tabs and filters ----------
  const tabButton = (key: 'gallery' | 'assistant', label: string, icon: React.ReactNode, locked = false) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === key}
      onClick={() => setTab(key)}
      className={cx(
        'inline-flex flex-1 items-center justify-center gap-2 rounded-[9px] px-3.5 py-2 text-body-s font-semibold transition-[background-color,color,box-shadow] sm:flex-none',
        tab === key ? 'bg-segment-on text-ink shadow-[0_1px_2px_rgb(36_36_36/0.1),0_2px_8px_rgb(36_36_36/0.08)]' : 'text-ink-2 hover:text-ink',
      )}
    >
      <span className={cx('transition-colors', tab === key ? 'text-brand' : 'text-muted')}>{icon}</span>
      {label}
      {locked && <Icon d={ICON.lock} size={12} strokeWidth={2.2} />}
    </button>
  );
  const filters: Array<[Filter, string]> = [
    ['all', th.filterAll],
    ['light', th.filterLight],
    ['dark', th.filterDark],
    ['warm', th.filterWarm],
    ['bold', th.filterBold],
  ];
  const shown = all.filter((e) => filter === 'all' || e.tags.includes(filter));
  const position = draft ? -1 : shown.findIndex((e) => e.ref === selectedRef);

  // ---------- Slider ----------
  const pick = (ref: string) => {
    setDraft(null);
    setSelectedRef(ref);
  };
  /** Moves the selection along the slider (wrapping), so the preview shows the next look. */
  function step(by: 1 | -1, focus = false) {
    if (!shown.length) return;
    const next = shown[position < 0 ? 0 : (position + by + shown.length) % shown.length]!;
    pick(next.ref);
    if (focus) rail.current?.querySelector<HTMLButtonElement>(`[data-ref="${CSS.escape(next.ref)}"]`)?.focus();
  }
  // Which way the slider can still scroll; scrollLeft runs negative in RTL, so only its size counts.
  const measure = () => {
    const r = rail.current;
    if (!r) return;
    const at = Math.abs(r.scrollLeft);
    setEdges({ back: at > 4, forward: at + r.clientWidth < r.scrollWidth - 4 });
  };
  const page = (by: 1 | -1) => {
    const r = rail.current;
    if (r) r.scrollBy({ left: by * (rtl ? -1 : 1) * r.clientWidth * 0.8, behavior: 'smooth' });
  };
  // Keep the chosen theme in view. Only the slider scrolls sideways; the page never jumps to it.
  useEffect(() => {
    const r = rail.current;
    const el = r?.querySelector(`[data-ref="${CSS.escape(selectedRef)}"]`);
    if (r && el) {
      const rb = r.getBoundingClientRect();
      const eb = el.getBoundingClientRect();
      if (eb.left < rb.left) r.scrollBy({ left: eb.left - rb.left - 18, behavior: 'smooth' });
      else if (eb.right > rb.right) r.scrollBy({ left: eb.right - rb.right + 18, behavior: 'smooth' });
    }
    measure();
  }, [selectedRef, filter, tab]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const onRailKey = (ev: React.KeyboardEvent) => {
    if (!(ev.target as HTMLElement).dataset.ref) return;
    const keys: Record<string, 1 | -1> = rtl ? { ArrowLeft: 1, ArrowRight: -1 } : { ArrowRight: 1, ArrowLeft: -1 };
    if (keys[ev.key]) {
      ev.preventDefault();
      step(keys[ev.key]!, true);
    }
  };

  // ---------- Theme card ----------
  const themeCard = (e: ThemeEntry) => {
    const on = !draft && e.ref === selectedRef;
    const inUse = e.ref === data.selectedRef;
    return (
      <li key={e.ref} className="relative w-[176px] shrink-0 snap-start sm:w-[196px]">
        <button
          type="button"
          data-ref={e.ref}
          aria-pressed={on}
          onClick={() => pick(e.ref)}
          className={cx(
            'block w-full rounded-2xl bg-surface p-2 pb-3 text-start transition-[box-shadow,transform] duration-200',
            on ? 'shadow-[0_0_0_2px_var(--brand),0_10px_24px_rgb(219_26_26/0.14)]' : 'border border-line shadow-card hover:-translate-y-0.5 hover:border-line-2',
          )}
        >
          <span className="relative block">
            <MiniTheme colors={e.colors} height={104} />
            {!e.allowed && (
              <>
                <span className="absolute inset-0 rounded-xl bg-[rgb(245_245_245/0.55)] dark:bg-[rgb(20_20_20/0.45)]" />
                <span className="absolute start-1/2 top-1/2 grid size-[34px] -translate-1/2 place-items-center rounded-full bg-surface text-ink-2 shadow-[0_6px_14px_rgb(0_0_0/0.12)] rtl:translate-x-1/2">
                  <Icon d={ICON.lock} size={15} />
                </span>
              </>
            )}
            {on && (
              <span className="absolute end-2 top-2 grid size-[22px] place-items-center rounded-full bg-brand-fill text-white shadow-[0_0_0_2px_#fff]">
                <Icon d={ICON.check} size={12} strokeWidth={3} />
              </span>
            )}
            {inUse && (
              <span className="absolute start-2 bottom-2 rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold text-surface">{th.inUse}</span>
            )}
          </span>
          <span className="mx-1 mt-2.5 flex items-start justify-between gap-2">
            <span className={cx('min-w-0 truncate text-title-s font-semibold', !e.allowed && 'text-ink-2')}>{name(e)}</span>
            {tierBadge(e)}
          </span>
          <span aria-hidden className="mx-1 mt-2 flex gap-1">
            {[e.colors.primary, e.colors.accent, e.colors.ink, e.colors.bg].map((h, i) => (
              <span key={i} className="block h-1.5 flex-1 rounded-[3px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.06)]" style={{ background: h }} />
            ))}
          </span>
        </button>
        {e.tier === 'custom' && canEdit && (
          <button
            type="button"
            onClick={() => setDeleting(e)}
            aria-label={`${th.delete} · ${name(e)}`}
            className="absolute start-3.5 top-3.5 grid size-7 place-items-center rounded-lg bg-surface/90 text-muted shadow-sm hover:text-brand"
          >
            <Icon d={ICON.trash} size={14} />
          </button>
        )}
      </li>
    );
  };

  // ---------- Side cards ----------
  const shareCard =
    data.locations > 1 || !data.canShare ? (
      <Card className="flex items-start gap-3 p-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-ink-2">
          <Icon d={ICON.layers} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-title-s font-semibold">{data.locations > 1 ? fill(th.shareTitle, { n: data.locations }) : th.shareTitleOne}</span>
          <span className="mt-0.5 block text-caption text-muted">{data.canShare ? th.shareOn : th.shareBody}</span>
        </span>
        {data.canShare ? (
          <Switch label={data.locations > 1 ? fill(th.shareTitle, { n: data.locations }) : th.shareTitleOne} checked={everywhere} disabled={!canEdit} onChange={setEverywhere} />
        ) : (
          <Link href={billing} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-muted hover:text-ink">
            <Icon d={ICON.lock} size={10} strokeWidth={2.4} />
            {th.shareBadge}
          </Link>
        )}
      </Card>
    ) : null;

  // ---------- Live preview ----------
  const arrow = (by: 1 | -1) => (
    <button
      type="button"
      onClick={() => step(by)}
      aria-label={by < 0 ? th.prevTheme : th.nextTheme}
      title={by < 0 ? th.prevTheme : th.nextTheme}
      className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-ink shadow-[0_4px_14px_rgb(0_0_0/0.14)] ring-1 ring-black/5 transition-transform hover:scale-105 active:scale-95"
    >
      <Icon d={by < 0 ? ICON.back : ICON.forward} size={18} strokeWidth={2.4} className="rtl:-scale-x-100" />
    </button>
  );
  const stage = (
    <Card aria-label={th.livePreview} className="overflow-hidden lg:sticky lg:top-6">
      <div className="flex items-center justify-between gap-3 px-[18px] pt-4 pb-3">
        <span className="flex items-center gap-2">
          <span aria-hidden className="size-2 rounded-full bg-ok shadow-[0_0_0_3px_var(--ok-soft)]" />
          <Overline>{th.livePreview}</Overline>
        </span>
        <Segmented
          label={th.previewLanguage}
          value={lang}
          onChange={(v) => setLang(v as Locale)}
          options={[
            { value: 'en', label: 'EN' },
            { value: 'ar', label: 'عربي' },
          ]}
        />
      </div>
      {/* The stage takes on the theme's own background, so the phone sits in its mood. */}
      <div className="px-3 py-6 transition-colors duration-300" style={{ background: `color-mix(in srgb, ${look.colors.bg} 72%, var(--surface-2))` }}>
        <div className="flex items-center justify-center gap-2 sm:gap-4">
          {tab === 'gallery' && arrow(-1)}
          <div className="min-w-0 max-w-[272px] flex-1">
            <PhonePreview look={look} data={withAssets} lang={lang} />
          </div>
          {tab === 'gallery' && arrow(1)}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line px-[18px] py-4">
        <span className="min-w-0">
          <span aria-live="polite" className="block truncate text-title-m font-semibold">
            {name(draft ?? selected)}
          </span>
          <span className="block truncate text-caption text-muted">{draft ? th.tabAssistant : selected.ref === data.selectedRef ? th.inUse : locale === 'ar' ? selected.descAr : selected.descEn}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {draft ? tierBadge({ tier: 'custom', allowed: true }) : tierBadge(selected)}
          {position >= 0 && <span className="text-[11px] text-muted tabular-nums">{fill(th.position, { i: position + 1, n: shown.length })}</span>}
        </span>
      </div>
    </Card>
  );

  const coloursCard = (
    <Card className="p-[18px]">
      <Overline>{th.colours}</Overline>
      <TokenRow look={look} t={th} />
    </Card>
  );

  const assetsCard =
    assets.logo || assets.cover ? (
      <Card className="p-4">
        <Overline>{th.pendingTitle}</Overline>
        <ul className="mt-3 grid gap-2">
          {(
            [
              ['logo', assets.logo, data.brandBranches > 1 ? fill(th.pendingLogoBranches, { n: data.brandBranches }) : th.pendingLogo, th.keepLogo],
              ['cover', assets.cover, th.pendingCover, th.keepCover],
            ] as const
          ).map(([key, p, label, keep]) =>
            p ? (
              <li key={key} className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- a pre-sized WebP from the API */}
                <img src={p.url} alt="" className="size-10 shrink-0 rounded-lg border border-line bg-white object-contain" />
                <span className="min-w-0 flex-1 text-body-s font-semibold">{label}</span>
                <button type="button" onClick={() => setAssets((x) => ({ ...x, [key]: null }))} aria-label={keep} title={keep} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink">
                  <Icon d={ICON.x} size={14} />
                </button>
              </li>
            ) : null,
          )}
        </ul>
      </Card>
    ) : null;

  // ---------- Apply ----------
  const locked = !draft && !selected.allowed;
  const applyButton = locked ? (
    <ButtonLink href={billing} icon={<Icon d={ICON.lock} size={14} strokeWidth={2.2} />}>
      {th.upgradeToApply}
    </ButtonLink>
  ) : (
    <Button onClick={apply} disabled={!canEdit || !changed || busy} title={canEdit ? undefined : th.editorsNote}>
      {busy ? th.applying : draft ? th.saveApply : th.apply}
    </Button>
  );

  const scrollButton = (by: 1 | -1) => (
    <button
      type="button"
      onClick={() => page(by)}
      disabled={by < 0 ? !edges.back : !edges.forward}
      aria-label={by < 0 ? th.scrollBack : th.scrollForward}
      className="grid size-8 place-items-center rounded-full border border-line-2 text-ink-2 transition-colors hover:border-ink hover:text-ink disabled:pointer-events-none disabled:opacity-35"
    >
      <Icon d={by < 0 ? ICON.back : ICON.forward} size={15} strokeWidth={2.4} className="rtl:-scale-x-100" />
    </button>
  );
  const gallery = (
    <Card className="min-w-0 p-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={th.filters} className="flex flex-wrap gap-1.5">
          {filters.map(([f, label]) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cx('rounded-full px-3 py-1.5 text-caption font-semibold transition-colors', filter === f ? 'bg-ink text-surface' : 'border border-line-2 text-ink-2 hover:border-ink')}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="hidden gap-1.5 sm:flex">
          {scrollButton(-1)}
          {scrollButton(1)}
        </div>
      </div>
      <div className="relative -mx-[18px] mt-3">
        <ul
          ref={rail}
          aria-label={th.tabGallery}
          onScroll={measure}
          onKeyDown={onRailKey}
          className="flex snap-x snap-mandatory scroll-px-[18px] gap-3 overflow-x-auto px-[18px] pt-1.5 pb-3 [scrollbar-width:thin]"
        >
          {shown.map(themeCard)}
        </ul>
        {/* Soft edges where more themes wait off-screen. */}
        <span aria-hidden className={cx('pointer-events-none absolute inset-y-0 start-0 w-8 bg-linear-to-r from-surface to-transparent transition-opacity rtl:bg-linear-to-l', edges.back ? 'opacity-100' : 'opacity-0')} />
        <span aria-hidden className={cx('pointer-events-none absolute inset-y-0 end-0 w-8 bg-linear-to-l from-surface to-transparent transition-opacity rtl:bg-linear-to-r', edges.forward ? 'opacity-100' : 'opacity-0')} />
      </div>
      <p className="mt-1 text-caption text-muted">{th.sliderHint}</p>
      {lockedCount > 0 && (
        <p className="mt-2 flex items-center gap-2 text-caption text-muted">
          <Icon d={ICON.lock} size={13} className="shrink-0" />
          {fill(th.lockedNote, { n: lockedCount })}
        </p>
      )}
    </Card>
  );

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="rounded-full bg-brand-fill px-2 py-0.5 text-[10px] font-semibold text-white">{th.new}</span>
            <Overline>{fill(th.overline, { location: locationName })}</Overline>
          </div>
          <h1 className="mt-2.5 text-heading-l font-semibold tracking-[-0.02em]">{th.title}</h1>
          <p className="mt-1.5 max-w-[580px] text-body-m text-muted">{th.lead}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <ButtonLink href={`/${lang}/r/${slug}`} target="_blank" variant="secondary" icon={<Icon d={ICON.eye} size={15} />}>
            {th.preview}
          </ButtonLink>
          {applyButton}
        </div>
      </header>
      {!canEdit && <p className="mt-3 text-caption text-muted">{th.editorsNote}</p>}

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        {stage}
        <div className="grid min-w-0 gap-4">
          <div role="tablist" aria-label={th.tabs} className="flex rounded-xl border border-line bg-segment p-1 sm:inline-flex sm:justify-self-start">
            {tabButton('gallery', th.tabGallery, <Icon d={ICON.grid} size={14} />)}
            {tabButton('assistant', th.tabAssistant, <Icon d={ICON.spark} size={14} />, !data.canDesign)}
          </div>
          {tab === 'gallery' ? (
            gallery
          ) : !data.canDesign ? (
            <AssistantTeaser t={th} billing={billing} />
          ) : !data.aiAvailable ? (
            <Card className="p-6">
              <span className="grid size-9 place-items-center rounded-[11px] bg-brand-soft text-brand">
                <Icon d={ICON.spark} size={17} />
              </span>
              <h2 className="mt-3 text-title-m font-semibold">{th.assistant.unavailableTitle}</h2>
              <p className="mt-1 max-w-md text-body-s text-muted">{th.assistant.unavailableBody}</p>
            </Card>
          ) : (
            <ThemeAssistant
              t={th}
              locale={locale}
              orgId={orgId}
              locationId={locationId}
              userName={userName}
              placeName={(locale === 'ar' && preview.name.ar) || preview.name.en}
              canSave={canEdit}
              draft={draft}
              onPreview={(d) => {
                setDraft(d);
                // A new pick replaces the old one; an answer that picked nothing keeps what's there.
                // Starting over (no draft) drops them.
                setAssets((x) => (d ? { logo: d.logo ?? x.logo, cover: d.cover ?? x.cover } : NO_ASSETS));
              }}
              onSaved={(ref) => {
                setDraft(null);
                setSelectedRef(ref);
                say(th.assistant.saved);
                router.refresh();
              }}
            />
          )}
          {assetsCard}
          {coloursCard}
          {shareCard}
          {tab === 'gallery' && !data.canDesign && <AssistantTeaser t={th} billing={billing} />}
        </div>
      </div>

      <section aria-labelledby="theme-plans-h" className="mt-10">
        <h2 id="theme-plans-h" className="text-title-m font-semibold">
          {th.planStrip}
        </h2>
        {planStrip}
      </section>

      <Dialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={deleting ? fill(th.deleteConfirm, { name: name(deleting) }) : ''}
        description={th.deleteBody}
        closeLabel={t.editor.close}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              {t.editor.cancel}
            </Button>
            <Button onClick={() => deleting && remove(deleting)}>{th.deleteYes}</Button>
          </>
        }
      />

      <UnsavedBar dirty={changed && canEdit} saving={busy} t={t.unsaved} onPreview={() => setPreviewing(true)} onSave={apply} onDiscard={discard} />
      <Dialog
        open={previewing}
        onClose={() => setPreviewing(false)}
        title={t.unsaved.previewTitle}
        description={t.unsaved.previewBody}
        closeLabel={t.unsaved.close}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPreviewing(false)}>
              {t.unsaved.keepEditing}
            </Button>
            <Button onClick={apply} disabled={busy}>
              {busy ? t.unsaved.saving : t.unsaved.save}
            </Button>
          </>
        }
      >
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <section aria-labelledby="theme-changes-h">
            <h3 id="theme-changes-h" className="text-title-s font-semibold">
              {t.unsaved.changes}
            </h3>
            <ul className="mt-3 grid gap-1.5 text-body-s">
              {(draft || selectedRef !== savedRef) && (
                <li className="rounded-lg bg-surface-2 px-3 py-2">
                  <span className="font-semibold">{name(draft ?? selected)}</span>
                  <span className="mt-0.5 block text-caption text-muted">
                    <span className="line-through">{name(all.find((e) => e.ref === savedRef) ?? data.current)}</span> <span aria-hidden>{locale === 'ar' ? '←' : '→'}</span> {name(draft ?? selected)}
                  </span>
                </li>
              )}
              {assets.logo && <li className="rounded-lg bg-surface-2 px-3 py-2 font-semibold">{th.pendingLogo}</li>}
              {assets.cover && <li className="rounded-lg bg-surface-2 px-3 py-2 font-semibold">{th.pendingCover}</li>}
              {everywhere && <li className="rounded-lg bg-surface-2 px-3 py-2 font-semibold">{th.shareOn}</li>}
            </ul>
          </section>
          <section aria-label={th.livePreview}>
            <PhonePreview look={look} data={withAssets} lang={lang} />
          </section>
        </div>
      </Dialog>

      <p
        role="status"
        aria-live="polite"
        className={cx(
          'fixed start-1/2 z-50 max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-xl px-4 py-3 text-body-s font-medium shadow-raised transition-[opacity,bottom] rtl:translate-x-1/2',
          // Above the save bar while it is showing.
          changed && canEdit ? 'bottom-32 sm:bottom-24' : 'bottom-5',
          notice ? 'opacity-100' : 'pointer-events-none opacity-0',
          notice?.tone === 'error' ? 'bg-brand-fill text-white' : 'bg-ink text-surface',
        )}
      >
        {notice?.text}
      </p>
    </>
  );
}

/** Starter sees what the assistant does, on a dark card, with the way to unlock it. */
function AssistantTeaser({ t, billing }: { t: Dictionary['themes']; billing: string }) {
  const morning = ['#F3EADB', '#FBF6EE', '#B03A2E', '#C08A35', '#2B2320'];
  return (
    <section className="flex flex-col gap-6 rounded-[20px] bg-[#1c1c1c] p-6 text-[#f5f5f5] shadow-[0_18px_40px_rgb(28_28_28/0.2)] md:flex-row md:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-[9px] bg-[rgb(255_77_77/0.18)] text-[#ff6b6b]">
            <Icon d={ICON.spark} size={15} />
          </span>
          <span className="text-overline font-semibold tracking-[0.11em] text-[#d9a441] uppercase">{t.teaserOverline}</span>
        </div>
        <h2 className="mt-2.5 text-heading-s font-semibold">{t.teaserTitle}</h2>
        <p className="mt-1 text-body-s text-[#a6a6a6]">{t.teaserBody}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ButtonLink href={billing} icon={<Icon d={ICON.lock} size={14} strokeWidth={2.2} />}>
            {t.teaserCta}
          </ButtonLink>
          <span className="text-caption text-[#a6a6a6]">{t.teaserPrice}</span>
        </div>
      </div>
      <div aria-hidden className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 md:w-[300px] md:shrink-0">
        <span className="max-w-[240px] justify-self-end rounded-[14px_14px_4px_14px] bg-white/12 px-3 py-2 text-caption text-[#f0f0f0] rtl:rounded-[14px_14px_14px_4px]">{t.teaserUser}</span>
        <span className="flex items-center gap-2 justify-self-start rounded-[14px_14px_14px_4px] border border-white/12 bg-white/[0.06] px-3 py-2 rtl:rounded-[14px_14px_4px_14px]">
          {morning.map((h) => (
            <span key={h} className="block size-[18px] rounded-md shadow-[inset_0_0_0_1px_rgb(255_255_255/0.2)]" style={{ background: h }} />
          ))}
          <span className="text-caption text-[#f0f0f0]">{t.teaserTheme}</span>
        </span>
      </div>
    </section>
  );
}

