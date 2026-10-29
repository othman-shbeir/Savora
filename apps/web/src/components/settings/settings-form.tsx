'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  DEFAULT_HOURS,
  directionsUrl,
  fill,
  setupHealth,
  SettingsInput,
  TIME_ZONES,
  type Closure,
  type LocationSettings,
  type Locale,
  type Photo,
  type SettingsPayload,
  type SetupItem,
  type WeekHours,
} from '@savora/shared';
import type { Dictionary } from '@/app/[lang]/dictionaries';
import { cx } from '@/lib/cx';
import { useUnsavedChanges } from '@/lib/unsaved';
import { LocationMap, type Pin } from '../map/location-map';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Field, Select } from '../ui/field';
import { Switch } from '../ui/switch';
import { UnsavedBar } from '../unsaved';
import { HoursEditor } from './hours-editor';
import { PhotoField } from './photo-field';
import { GuestPreview, SetupHealth } from './settings-preview';

type Form = {
  nameEn: string;
  nameAr: string;
  currency: string;
  timezone: string;
  addressEn: string;
  addressAr: string;
  building: string;
  city: string;
  pin: Pin | null;
  deliveryOn: boolean;
  radiusM: number;
  showMap: boolean;
  hours: WeekHours | null;
  closures: Closure[];
  phone: string;
  phoneIsWhatsapp: boolean;
  orderUrl: string;
  reservationUrl: string;
  cover: Photo | null;
  logo: Photo | null;
};

const fromSettings = (s: LocationSettings): Form => ({
  nameEn: s.nameEn,
  nameAr: s.nameAr ?? '',
  currency: s.currency,
  timezone: s.timezone,
  addressEn: s.addressEn ?? '',
  addressAr: s.addressAr ?? '',
  building: s.building ?? '',
  city: s.city ?? '',
  pin: s.lat !== null && s.lng !== null ? { lat: s.lat, lng: s.lng } : null,
  deliveryOn: s.deliveryRadiusM !== null,
  radiusM: s.deliveryRadiusM ?? 800,
  showMap: s.showMap,
  hours: s.hours,
  closures: s.closures,
  phone: s.phone ?? '',
  phoneIsWhatsapp: s.phoneIsWhatsapp,
  orderUrl: s.orderUrl ?? '',
  reservationUrl: s.reservationUrl ?? '',
  cover: s.cover,
  logo: s.brand.logo,
});

const toPayload = (f: Form): SettingsPayload => ({
  nameEn: f.nameEn,
  nameAr: f.nameAr,
  currency: f.currency as SettingsPayload['currency'],
  timezone: f.timezone,
  addressEn: f.addressEn,
  addressAr: f.addressAr,
  building: f.building,
  city: f.city,
  lat: f.pin?.lat ?? null,
  lng: f.pin?.lng ?? null,
  deliveryRadiusM: f.deliveryOn ? f.radiusM : null,
  showMap: f.showMap,
  hours: f.hours,
  closures: f.closures,
  phone: f.phone,
  phoneIsWhatsapp: f.phoneIsWhatsapp,
  orderUrl: f.orderUrl,
  reservationUrl: f.reservationUrl,
  coverPhotoId: f.cover?.id ?? null,
  logoPhotoId: f.logo?.id ?? null,
});

/** What changed since the last save, for the preview: short text fields show before and after;
 *  the rest (map pin, hours, photos…) just say they changed. */
function changedFields(saved: Form, now: Form, s: Dictionary['settings']): Array<{ label: string; from?: string; to?: string }> {
  const a = toPayload(saved);
  const b = toPayload(now);
  const same = (keys: Array<keyof SettingsPayload>) => keys.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));
  const text = (k: 'nameEn' | 'nameAr' | 'addressEn' | 'addressAr' | 'building' | 'city' | 'phone' | 'orderUrl' | 'reservationUrl', label: string) =>
    same([k]) ? [] : [{ label, from: String(a[k] ?? ''), to: String(b[k] ?? '') }];
  const flag = (keys: Array<keyof SettingsPayload>, label: string) => (same(keys) ? [] : [{ label }]);
  return [
    ...text('nameEn', s.nameEn),
    ...text('nameAr', s.nameAr),
    ...flag(['currency'], s.currency),
    ...text('addressEn', s.street),
    ...text('addressAr', s.addressAr),
    ...text('building', s.building),
    ...text('city', s.city),
    ...flag(['lat', 'lng'], s.healthPin),
    ...flag(['deliveryRadiusM'], s.radius),
    ...flag(['showMap'], s.showMap),
    ...flag(['hours'], s.hoursTitle),
    ...flag(['closures'], s.closures),
    ...flag(['timezone'], s.timezone),
    ...flag(['logoPhotoId'], s.logo),
    ...flag(['coverPhotoId'], s.cover),
    ...text('phone', s.contact),
    ...flag(['phoneIsWhatsapp'], s.whatsapp),
    ...text('orderUrl', s.order),
    ...text('reservationUrl', s.reservation),
  ];
}

const SECTIONS = ['identity', 'map', 'hours', 'brand', 'actions'] as const;
type Section = (typeof SECTIONS)[number];
const JUMP: Record<SetupItem['key'], Section> = {
  names: 'identity',
  pin: 'map',
  hours: 'hours',
  logo: 'brand',
  contact: 'actions',
  booking: 'actions',
};

const sectionCard = 'scroll-mt-32 rounded-[20px] border border-line bg-surface p-6 shadow-card';

function Heading({ overline, title, body, aside }: { overline: string; title: string; body: string; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-overline font-semibold tracking-[0.13em] text-brand uppercase">{overline}</p>
        <h2 className="mt-1.5 text-heading-s font-semibold">{title}</h2>
        <p className="mt-1 text-caption text-muted">{body}</p>
      </div>
      {aside}
    </div>
  );
}

/** Location settings: five sections, a live guest preview, setup health, and one save. */
export function SettingsForm({
  settings,
  t,
  locale,
  canEdit,
  menuOrigin,
  branchIndex,
  guestLinks,
}: {
  settings: LocationSettings;
  t: Dictionary;
  locale: Locale;
  canEdit: boolean;
  menuOrigin: string;
  branchIndex: number;
  /** Order and reservation links are part of Growth. */
  guestLinks: boolean;
}) {
  const s = t.settings;
  const router = useRouter();
  const [saved, setSaved] = useState<Form>(() => fromSettings(settings));
  const [f, setF] = useState<Form>(saved);
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed' | 'invalid'>('idle');
  const [copied, setCopied] = useState(false);

  const dirty = JSON.stringify(toPayload(f)) !== JSON.stringify(toPayload(saved));
  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setF((x) => ({ ...x, [key]: value }));
    setErrors((e) => (e.size ? new Set([...e].filter((k) => !k.startsWith(key === 'pin' ? 'lat' : key))) : e));
    if (state !== 'saving') setState('idle');
  };

  const discard = () => (setF(saved), setErrors(new Set()), setState('idle'));
  // Leaving with unsaved edits asks first (tab close, links, location switch).
  useUnsavedChanges(dirty && canEdit, () => save(), discard);
  const [previewing, setPreviewing] = useState(false);

  const fullHealth = setupHealth({
    nameEn: f.nameEn,
    nameAr: f.nameAr || null,
    lat: f.pin?.lat ?? null,
    hours: f.hours,
    phone: f.phone || null,
    orderUrl: f.orderUrl || null,
    reservationUrl: f.reservationUrl || null,
    logo: f.logo,
  });
  // Without Growth, order and booking links can't be added, so they don't count against the score.
  const healthItems = guestLinks ? fullHealth.items : fullHealth.items.filter((i) => i.key !== 'booking');
  const health = { items: healthItems, pct: Math.round((healthItems.filter((i) => i.done).length / healthItems.length) * 100) };
  const sectionDone: Record<Section, boolean> = {
    identity: Boolean(f.nameEn && f.nameAr),
    map: Boolean(f.pin),
    hours: Boolean(f.hours?.some((d) => d.open)),
    brand: Boolean(f.logo),
    actions: Boolean(f.phone || f.orderUrl || f.reservationUrl),
  };
  const others = useMemo(
    () =>
      settings.others.map((o) => ({
        id: o.id,
        name: (locale === 'ar' && o.nameAr) || o.nameEn,
        lat: o.lat,
        lng: o.lng,
      })),
    [settings.others, locale],
  );
  const linkHost = new URL(menuOrigin).host;
  const err = (key: string) => errors.has(key);

  /** Resolves to whether it saved, for the leave-page prompt. */
  async function save(): Promise<boolean> {
    const payload = toPayload(f);
    const check = SettingsInput.safeParse(payload);
    if (!check.success) {
      setErrors(new Set(check.error.issues.map((i) => String(i.path[0]))));
      setState('invalid');
      setPreviewing(false);
      return false;
    }
    setState('saving');
    try {
      const res = await fetch(`/api/locations/${settings.id}/settings`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status === 400) {
        const body = (await res.json()) as { issues?: string[] };
        setErrors(new Set((body.issues ?? []).map((i) => i.split('.')[0]!)));
        setState('invalid');
        setPreviewing(false);
        return false;
      }
      if (!res.ok) return (setState('failed'), false);
      const next = fromSettings((await res.json()) as LocationSettings);
      setSaved(next);
      setF(next);
      setErrors(new Set());
      setState('saved');
      setPreviewing(false);
      router.refresh(); // names in the sidebar and switcher
      return true;
    } catch {
      setState('failed');
      return false;
    }
  }

  const jump = (section: Section) => document.getElementById(`s-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const radiusKm = f.radiusM / 1000;
  const rowState = (on: boolean, auto = false) =>
    on ? (
      <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] uppercase', auto ? 'bg-gold-soft text-gold-ink' : 'bg-ok-soft text-ok')}>
        {auto ? s.auto : s.visible}
      </span>
    ) : (
      <span className="shrink-0 px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-muted uppercase">{s.hidden}</span>
    );
  const control = (invalid: boolean) =>
    cx(
      'h-10 w-full min-w-0 rounded-[10px] border bg-surface px-3 text-body-s outline-none placeholder:text-muted focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-soft)] disabled:opacity-60',
      invalid ? 'border-brand' : 'border-line-2',
    );

  const guestPreview = (
    <GuestPreview
      t={t}
      locale={locale}
      d={{
        nameEn: f.nameEn,
        nameAr: f.nameAr,
        brandEn: settings.brand.nameEn,
        brandAr: settings.brand.nameAr,
        streetEn: f.addressEn,
        streetAr: f.addressAr,
        hours: f.hours,
        closures: f.closures,
        timezone: f.timezone,
        logo: f.logo,
        cover: f.cover,
        hasPin: Boolean(f.pin),
        showMap: f.showMap,
        radiusM: f.deliveryOn ? f.radiusM : null,
        phone: Boolean(f.phone),
        whatsapp: f.phoneIsWhatsapp,
        order: Boolean(f.orderUrl),
        book: Boolean(f.reservationUrl),
      }}
    />
  );

  return (
    <div className="pb-24">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="flex items-center gap-2 text-overline font-semibold tracking-[0.13em] text-muted uppercase">
            <span className="text-brand">{s.crumb}</span>
            <span aria-hidden>/</span>
            <span>{(locale === 'ar' && settings.brand.nameAr) || settings.brand.nameEn}</span>
          </p>
          <h1 className="mt-2.5 text-heading-l font-semibold tracking-[-0.02em] sm:text-heading-xl">{s.title}</h1>
          <p className="mt-2 max-w-[460px] text-body-m text-muted">{s.lead}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-caption font-semibold text-muted">
            <span aria-hidden className={cx('size-2 rounded-full', settings.status === 'live' ? 'bg-ok' : 'bg-gold')} />
            {settings.status === 'live' ? s.live : s.notLive} ·
            <span dir="ltr" className="font-mono text-ink-2">
              {linkHost}/r/{settings.slug}
            </span>
          </span>
          {settings.status === 'live' && (
            <Link
              href={`/${locale}/r/${settings.slug}`}
              target="_blank"
              rel="noopener"
              className="inline-flex h-10 items-center rounded-[11px] border border-line-2 bg-surface px-4 text-body-s font-semibold hover:bg-surface-2"
            >
              {s.preview}
            </Link>
          )}
          {canEdit && (
            <Button onClick={save} disabled={!dirty || state === 'saving'}>
              {state === 'saving' ? s.saving : s.save}
            </Button>
          )}
        </div>
      </header>

      {!canEdit && <p className="mt-5 rounded-xl bg-gold-soft px-4 py-3 text-body-s">{s.readOnly}</p>}
      {(state === 'invalid' || state === 'failed') && (
        <p role="alert" className="mt-5 rounded-xl bg-brand-soft px-4 py-3 text-body-s text-brand">
          {state === 'invalid' ? s.invalid : s.failed}
        </p>
      )}

      <nav aria-label={s.navLabel} className="sticky top-0 z-30 -mx-2 mt-5 flex gap-1.5 overflow-x-auto bg-bg/90 px-2 py-2.5 backdrop-blur lg:top-0">
        {SECTIONS.map((key, i) => (
          <button
            key={key}
            type="button"
            onClick={() => jump(key)}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-caption font-semibold whitespace-nowrap text-ink-2 hover:border-ink"
          >
            <span className="font-mono text-[10px] text-muted">0{i + 1}</span>
            {s[`nav${i + 1}` as 'nav1']}
            <span aria-hidden className={cx('size-1.5 rounded-full', sectionDone[key] ? 'bg-ok' : 'bg-gold')} />
            <span className="sr-only">· {sectionDone[key] ? s.done : s.todo}</span>
          </button>
        ))}
      </nav>

      <fieldset disabled={!canEdit} className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid min-w-0 gap-5">
          {/* 01 Identity */}
          <section id="s-identity" className={sectionCard}>
            <Heading
              overline={s.idOverline}
              title={s.idTitle}
              body={s.idBody}
              aside={
                settings.brand.branches > 1 && (
                  <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-muted">
                    {fill(s.branchOf, {
                      n: branchIndex,
                      total: settings.brand.branches,
                    })}
                  </span>
                )
              }
            />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label={s.nameEn} value={f.nameEn} onChange={(e) => set('nameEn', e.target.value)} maxLength={80} dir="ltr" lang="en" error={err('nameEn') ? s.nameRequired : undefined} />
              <Field label={s.nameAr} value={f.nameAr} onChange={(e) => set('nameAr', e.target.value)} maxLength={80} dir="rtl" lang="ar" />
              <div className="grid content-start gap-1.5">
                <span className="text-caption font-medium text-ink-2">{s.link}</span>
                <div dir="ltr" className="flex h-11 items-stretch overflow-hidden rounded-[11px] border border-line bg-bg">
                  <span className="flex items-center border-e border-line px-2.5 font-mono text-[11px] text-muted">{linkHost}</span>
                  <span className="flex min-w-0 flex-1 items-center truncate px-2.5 font-mono text-[11px]">/r/{settings.slug}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard?.writeText(`${menuOrigin}/r/${settings.slug}`).catch(() => {});
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1800);
                    }}
                    className="border-s border-line px-3 text-caption font-semibold text-brand hover:bg-surface"
                  >
                    {copied ? s.copied : s.copy}
                  </button>
                </div>
                <span className="text-caption text-muted">{s.linkLocked}</span>
              </div>
              <Select label={s.currency} value={f.currency} onChange={(e) => set('currency', e.target.value)}>
                <option value="ILS">{s.currencyILS}</option>
                <option value="JOD">{s.currencyJOD}</option>
                <option value="USD">{s.currencyUSD}</option>
              </Select>
            </div>
          </section>

          {/* 02 Address & map */}
          <section id="s-map" className={cx(sectionCard, 'px-0 pb-0')}>
            <div className="px-6">
              <Heading
                overline={s.mapOverline}
                title={s.mapTitle}
                body={s.mapBody}
                aside={
                  <button
                    type="button"
                    aria-pressed={f.deliveryOn}
                    onClick={() => set('deliveryOn', !f.deliveryOn)}
                    className={cx(
                      'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-caption font-semibold',
                      f.deliveryOn ? 'border-brand bg-brand-soft text-brand' : 'border-line-2 text-ink-2',
                    )}
                  >
                    <span aria-hidden className="size-2.5 rounded-full border-[1.5px] border-brand" />
                    {s.deliveryZone}
                  </button>
                }
              />
            </div>
            <div className="mx-3.5 mt-5">
              <LocationMap
                pin={f.pin}
                onPin={canEdit ? (p) => set('pin', p) : undefined}
                radiusM={f.deliveryOn ? f.radiusM : null}
                others={others}
                initial={(f.nameEn || 'S').slice(0, 1).toUpperCase()}
                label={fill(s.mapLabel, { name: f.nameEn })}
                locale={locale}
                editable={canEdit}
                search
                t={s}
              />
            </div>
            <div className="p-6">
              {f.pin && canEdit && (
                <button type="button" onClick={() => set('pin', null)} className="-mt-3 mb-3 text-caption font-semibold text-muted hover:text-brand">
                  {s.removePin}
                </button>
              )}
              <div className="grid gap-4 sm:grid-cols-[1.3fr_1fr]">
                <Field label={s.street} value={f.addressEn} onChange={(e) => set('addressEn', e.target.value)} maxLength={160} dir="auto" />
                <Field label={s.building} value={f.building} onChange={(e) => set('building', e.target.value)} maxLength={80} dir="auto" />
                <Field label={s.addressAr} value={f.addressAr} onChange={(e) => set('addressAr', e.target.value)} maxLength={160} dir="rtl" lang="ar" />
                <Field label={s.city} value={f.city} onChange={(e) => set('city', e.target.value)} maxLength={60} dir="auto" />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className={cx('rounded-xl border p-3.5', f.deliveryOn ? 'border-line' : 'border-dashed border-line-2 opacity-70')}>
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="radius" className="text-body-s font-semibold">
                      {s.radius}
                    </label>
                    <span className="font-mono text-body-s font-semibold text-brand tabular-nums" dir="ltr">
                      {radiusKm.toFixed(1)} km
                    </span>
                  </div>
                  <input
                    id="radius"
                    type="range"
                    min={300}
                    max={5000}
                    step={100}
                    value={f.radiusM}
                    disabled={!f.deliveryOn}
                    onChange={(e) => set('radiusM', Number(e.target.value))}
                    className="mt-3 w-full accent-[var(--brand)]"
                  />
                  <p className="mt-1.5 text-caption text-muted">
                    {f.deliveryOn
                      ? fill(s.radiusHint, {
                          min: Math.max(2, Math.round((radiusKm / 25) * 60)),
                        })
                      : s.radiusOff}
                  </p>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3.5">
                  <div className="flex-1">
                    <p className="text-body-s font-semibold">{s.showMap}</p>
                    <p className="mt-0.5 text-caption text-muted">{s.showMapHint}</p>
                  </div>
                  <Switch label={s.showMap} checked={f.showMap} disabled={!canEdit} onChange={(v) => set('showMap', v)} />
                </div>
              </div>
            </div>
          </section>

          {/* 03 Hours */}
          <section id="s-hours" className={sectionCard}>
            <Heading overline={s.hoursOverline} title={s.hoursTitle} body={s.hoursBody} />
            <div className="mt-5">
              {f.hours ? (
                <HoursEditor
                  hours={f.hours}
                  closures={f.closures}
                  timezone={f.timezone}
                  onHours={(h) => set('hours', h)}
                  onClosures={(c) => set('closures', c)}
                  disabled={!canEdit}
                  t={s}
                  locale={locale}
                />
              ) : (
                <div className="grid justify-items-start gap-3 rounded-xl border border-dashed border-line-2 p-5">
                  <p className="text-body-s text-muted">{s.noHours}</p>
                  {canEdit && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        set(
                          'hours',
                          DEFAULT_HOURS.map(() => ({
                            open: true,
                            from: '07:00',
                            to: '23:00',
                          })) as WeekHours,
                        )
                      }
                    >
                      {s.addHours}
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className="mt-5 grid max-w-sm gap-1.5">
              <Select label={s.timezone} value={f.timezone} onChange={(e) => set('timezone', e.target.value)}>
                {(TIME_ZONES as readonly string[]).includes(f.timezone) ? null : <option value={f.timezone}>{f.timezone}</option>}
                {TIME_ZONES.map((z) => (
                  <option key={z} value={z}>
                    {z.replace('_', ' ')}
                  </option>
                ))}
              </Select>
              <p className="text-caption text-muted">{s.timezoneHint}</p>
            </div>
          </section>

          {/* 04 Brand kit */}
          <section id="s-brand" className={sectionCard}>
            <Heading overline={s.brandOverline} title={s.brandTitle} body={s.brandBody} />
            <div className="mt-5 grid gap-3">
              <PhotoField
                label={s.logo}
                hint={fill(s.logoHint, {
                  brand: (locale === 'ar' && settings.brand.nameAr) || settings.brand.nameEn,
                })}
                photo={f.logo}
                onChange={(p) => set('logo', p)}
                organizationId={settings.organizationId}
                shape="square"
                fallback={(f.nameEn || 'S').slice(0, 1).toUpperCase()}
                disabled={!canEdit}
                t={s}
              />
              <PhotoField label={s.cover} hint={s.coverHint} photo={f.cover} onChange={(p) => set('cover', p)} organizationId={settings.organizationId} shape="wide" disabled={!canEdit} t={s} />
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line p-4">
                <div className="flex items-center gap-3">
                  <span aria-hidden className="flex h-8 overflow-hidden rounded-lg">
                    <span className="w-4 bg-brand-fill" />
                    <span className="w-4 bg-gold" />
                    <span className="w-4 bg-surface-2" />
                  </span>
                  <div>
                    <p className="text-body-s font-semibold">{s.themesTitle}</p>
                    <p className="text-caption text-muted">{s.themesBody}</p>
                  </div>
                </div>
                <Link href={`/${locale}/app/themes`} className="text-caption font-semibold text-brand hover:underline">
                  {s.themesCta} <span aria-hidden>{locale === 'ar' ? '←' : '→'}</span>
                </Link>
              </div>
            </div>
          </section>

          {/* 05 Guest actions */}
          <section id="s-actions" className={sectionCard}>
            <Heading overline={s.actionsOverline} title={s.actionsTitle} body={s.actionsBody} />
            <ul className="mt-5 grid gap-2.5">
              <li className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-2 rounded-[13px] border border-line p-3 sm:grid-cols-[36px_150px_minmax(0,1fr)_auto]">
                <ActionIcon glyph="☎" />
                <div className="sm:block">
                  <p className="text-body-s font-semibold">{s.contact}</p>
                  <p className="text-caption text-muted">{s.contactHint}</p>
                </div>
                <div className="col-span-3 grid gap-1.5 sm:col-span-1">
                  <input
                    aria-label={s.contact}
                    value={f.phone}
                    onChange={(e) => set('phone', e.target.value)}
                    placeholder="+970 59 555 0142"
                    inputMode="tel"
                    dir="ltr"
                    className={control(err('phone'))}
                    aria-invalid={err('phone') || undefined}
                  />
                  {err('phone') && <span className="text-caption text-brand">{s.phoneInvalid}</span>}
                  <label className="flex items-center gap-2 text-caption text-ink-2">
                    <input type="checkbox" checked={f.phoneIsWhatsapp} onChange={(e) => set('phoneIsWhatsapp', e.target.checked)} className="size-4 accent-[var(--ok)]" />
                    {s.whatsapp}
                  </label>
                </div>
                <span className="col-start-3 row-start-1 sm:col-start-auto sm:row-start-auto">{rowState(Boolean(f.phone))}</span>
              </li>
              <li className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-2 rounded-[13px] border border-line p-3 sm:grid-cols-[36px_150px_minmax(0,1fr)_auto]">
                <ActionIcon glyph="➤" />
                <div>
                  <p className="text-body-s font-semibold">{s.directions}</p>
                  <p className="text-caption text-muted">{s.directionsHint}</p>
                </div>
                <input
                  aria-label={s.directions}
                  readOnly
                  value={f.pin ? directionsUrl(f.pin.lat, f.pin.lng).replace('https://', '') : ''}
                  placeholder={s.needsPin}
                  dir="ltr"
                  className={cx(control(false), 'col-span-3 bg-surface-2 font-mono text-caption text-muted sm:col-span-1')}
                />
                <span className="col-start-3 row-start-1 sm:col-start-auto sm:row-start-auto">
                  {f.pin ? rowState(true, true) : <span className="text-[10px] font-semibold tracking-[0.06em] text-gold-ink uppercase">{s.needsPin}</span>}
                </span>
              </li>
              {(
                [
                  ['orderUrl', s.order, s.orderHint, '◧'],
                  ['reservationUrl', s.reservation, s.reservationHint, '▦'],
                ] as const
              ).map(([key, label, hint, glyph]) => (
                <li key={key} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-2 rounded-[13px] border border-line p-3 sm:grid-cols-[36px_150px_minmax(0,1fr)_auto]">
                  <ActionIcon glyph={glyph} />
                  <div>
                    <p className="text-body-s font-semibold">{label}</p>
                    <p className="text-caption text-muted">{hint}</p>
                  </div>
                  <div className="col-span-3 grid gap-1.5 sm:col-span-1">
                    <input
                      aria-label={label}
                      value={f[key]}
                      onChange={(e) => set(key, e.target.value)}
                      placeholder="https://…"
                      inputMode="url"
                      dir="ltr"
                      disabled={!guestLinks}
                      className={control(err(key))}
                      aria-invalid={err(key) || undefined}
                    />
                    {err(key) && <span className="text-caption text-brand">{s.urlInvalid}</span>}
                    {!guestLinks && <span className="text-caption text-muted">{t.locks.guestLinks}</span>}
                  </div>
                  <span className="col-start-3 row-start-1 sm:col-start-auto sm:row-start-auto">
                    {guestLinks ? (
                      rowState(Boolean(f[key]))
                    ) : (
                      <Link href={`/${locale}/app/billing`} className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-brand uppercase hover:underline">
                        {t.locks.growth}
                      </Link>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="grid gap-4 xl:sticky xl:top-16">
          {guestPreview}
          <SetupHealth items={health.items} pct={health.pct} t={s} locale={locale} onJump={(k) => jump(JUMP[k])} />
        </aside>
      </fieldset>

      <UnsavedBar dirty={dirty && canEdit} saving={state === 'saving'} t={t.unsaved} onPreview={() => setPreviewing(true)} onSave={save} onDiscard={discard} />
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
            <Button onClick={save} disabled={state === 'saving'}>
              {state === 'saving' ? s.saving : s.save}
            </Button>
          </>
        }
      >
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
          <section aria-labelledby="settings-changes-h">
            <h3 id="settings-changes-h" className="text-title-s font-semibold">
              {t.unsaved.changes}
            </h3>
            <ul className="mt-3 grid gap-1.5 text-body-s">
              {changedFields(saved, f, s).map((c) => (
                <li key={c.label} className="rounded-lg bg-surface-2 px-3 py-2">
                  <span className="font-semibold">{c.label}</span>
                  {c.from !== undefined && (
                    <span className="mt-0.5 block text-caption text-muted">
                      <span dir="auto" className="line-through">
                        {c.from || '—'}
                      </span>{' '}
                      <span aria-hidden>{locale === 'ar' ? '←' : '→'}</span>{' '}
                      <span dir="auto" className="text-ink">
                        {c.to || '—'}
                      </span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section aria-label={s.guestView}>{guestPreview}</section>
        </div>
      </Dialog>
      <p role="status" aria-live="polite" className="sr-only">
        {state === 'saved' ? s.saved : ''}
      </p>
      {state === 'saved' && !dirty && (
        <p className="fixed start-1/2 bottom-5 z-40 -translate-x-1/2 rounded-xl bg-ink px-4 py-3 text-body-s font-medium text-surface shadow-raised rtl:translate-x-1/2">{s.saved}</p>
      )}
    </div>
  );
}

function ActionIcon({ glyph }: { glyph: string }) {
  return (
    <span aria-hidden className="grid size-9 place-items-center rounded-[10px] bg-brand-soft text-brand">
      {glyph}
    </span>
  );
}
