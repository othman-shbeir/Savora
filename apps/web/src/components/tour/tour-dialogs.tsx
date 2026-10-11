'use client';

import { useState } from 'react';
import { fill, formatPrice, type Locale, type SpotPayload, type TourDraft, type TourScene, type TourSpot, type TourSpotKind } from '@savora/shared';
import type { Dictionary } from '@/app/[lang]/dictionaries';
import { primaryName } from '@/lib/menu-text';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Field, Select, TextArea } from '../ui/field';
import { Segmented } from '../ui/segmented';

type Text = Dictionary['tour'];

export const sceneLabel = (s: Pick<TourScene, 'nameEn' | 'nameAr'>, i: number, t: Text, locale: Locale) => primaryName(s, locale) || fill(t.sceneFallback, { n: i + 1 });

/** Name, time in the tour, order, retake and delete for one scene. */
export function SceneDialog({
  open,
  scene,
  index,
  count,
  t,
  locale,
  onClose,
  onSave,
  onMove,
  onRetake,
  onDelete,
}: {
  open: boolean;
  scene: TourScene | null;
  index: number;
  count: number;
  t: Text;
  locale: Locale;
  onClose: () => void;
  onSave: (v: { nameEn: string; nameAr: string; seconds: number }) => Promise<void>;
  onMove: (to: number) => Promise<void>;
  onRetake: (file: File) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!scene) return null;
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    await f();
    setBusy(false);
  };
  return (
    <Dialog
      open={open}
      onClose={() => {
        setConfirm(false);
        onClose();
      }}
      title={fill(t.sceneTitle, { n: index + 1 })}
      closeLabel={t.close}
      footer={
        confirm ? (
          <>
            <p className="me-auto max-w-xs text-caption text-muted">{t.deleteSceneConfirm}</p>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              {t.cancel}
            </Button>
            <Button disabled={busy} onClick={() => run(onDelete)}>
              {t.delete}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" className="me-auto text-brand" onClick={() => setConfirm(true)}>
              {t.deleteScene}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              {t.cancel}
            </Button>
            <Button type="submit" form="scene-form" disabled={busy}>
              {t.save}
            </Button>
          </>
        )
      }
    >
      <form
        id="scene-form"
        key={scene.id}
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(() => onSave({ nameEn: String(f.get('nameEn') ?? ''), nameAr: String(f.get('nameAr') ?? ''), seconds: Number(f.get('seconds')) }));
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="nameEn" label={t.sceneNameEn} defaultValue={scene.nameEn ?? ''} maxLength={60} dir="ltr" />
          <Field name="nameAr" label={t.sceneNameAr} defaultValue={scene.nameAr ?? ''} maxLength={60} dir="rtl" lang="ar" />
        </div>
        <Select name="seconds" label={t.seconds} defaultValue={String(scene.seconds)}>
          {[5, 8, 10, 12, 15, 20, 25, 30].map((n) => (
            <option key={n} value={n}>
              {fill(t.secondsUnit, { n })}
            </option>
          ))}
        </Select>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={index === 0 || busy} onClick={() => run(() => onMove(index - 1))}>
            {t.earlier}
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={index === count - 1 || busy} onClick={() => run(() => onMove(index + 1))}>
            {t.later}
          </Button>
          <label className="inline-flex h-9 cursor-pointer items-center rounded-[11px] border border-line-2 bg-surface px-3 text-caption font-semibold hover:bg-surface-2 focus-within:shadow-[0_0_0_3px_var(--brand-soft)]">
            {t.retake}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="sr-only"
              aria-label={fill(t.retakeLabel, { name: sceneLabel(scene, index, t, locale) })}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) run(() => onRetake(file));
              }}
            />
          </label>
        </div>
      </form>
    </Dialog>
  );
}

type Dish = TourDraft['dishes'][number];

/** A new spot (at a point the owner tapped) or an existing one. */
export function SpotDialog({
  open,
  spot,
  sceneId,
  scenes,
  dishes,
  currency,
  t,
  locale,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  /** Existing spot, or the tapped point for a new one. */
  spot: TourSpot | { x: number; y: number } | null;
  sceneId: string;
  scenes: TourScene[];
  dishes: Dish[];
  currency: string;
  t: Text;
  locale: Locale;
  onClose: () => void;
  onSave: (v: SpotPayload) => Promise<boolean>;
  onDelete?: () => Promise<void>;
}) {
  const existing = spot && 'id' in spot ? spot : null;
  const [kind, setKind] = useState<TourSpotKind>(existing?.kind ?? (dishes.length ? 'dish' : 'info'));
  const [busy, setBusy] = useState(false);
  if (!spot) return null;
  const others = scenes.map((s, i) => ({ s, i })).filter(({ s }) => s.id !== sceneId);
  const options = [
    { value: 'dish', label: t.kindDish },
    { value: 'info', label: t.kindInfo },
    ...(others.length ? [{ value: 'scene', label: t.kindScene }] : []),
  ];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={existing ? t.spotTitleEdit : t.spotTitleNew}
      closeLabel={t.close}
      footer={
        <>
          {existing && onDelete && (
            <Button variant="ghost" className="me-auto text-brand" disabled={busy} onClick={onDelete}>
              {t.spotDelete}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button type="submit" form="spot-form" disabled={busy}>
            {t.save}
          </Button>
        </>
      }
    >
      <form
        id="spot-form"
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const v = (k: string) => String(f.get(k) ?? '') || null;
          setBusy(true);
          await onSave({ x: spot.x, y: spot.y, kind, itemId: kind === 'dish' ? v('itemId') : null, targetSceneId: kind === 'scene' ? v('targetSceneId') : null, labelEn: v('labelEn'), labelAr: v('labelAr'), noteEn: v('noteEn'), noteAr: v('noteAr') });
          setBusy(false);
        }}
      >
        <div className="grid gap-1.5">
          <span className="text-caption font-medium text-ink-2">{t.spotKind}</span>
          <Segmented label={t.spotKind} value={kind} onChange={(v) => setKind(v as TourSpotKind)} options={options} />
        </div>
        {kind === 'dish' &&
          (dishes.length ? (
            <Select name="itemId" label={t.spotDishLabel} defaultValue={existing?.itemId ?? ''} required>
              <option value="" disabled>
                {t.spotDishPick}
              </option>
              {dishes.map((d) => (
                <option key={d.id} value={d.id}>
                  {primaryName(d, locale)} · {formatPrice(d.priceMinor, currency)}
                </option>
              ))}
            </Select>
          ) : (
            <p className="rounded-xl bg-gold-soft p-3 text-body-s">{t.tipNoDishes}</p>
          ))}
        {kind === 'scene' && (
          <Select name="targetSceneId" label={t.spotSceneLabel} defaultValue={existing?.targetSceneId ?? ''} required>
            <option value="" disabled>
              {t.spotScenePick}
            </option>
            {others.map(({ s, i }) => (
              <option key={s.id} value={s.id}>
                {i + 1} · {sceneLabel(s, i, t, locale)}
              </option>
            ))}
          </Select>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="labelEn" label={t.spotLabelEn} defaultValue={existing?.labelEn ?? ''} maxLength={60} dir="ltr" required={kind === 'info' && locale === 'en'} hint={t.spotLabelHint} />
          <Field name="labelAr" label={t.spotLabelAr} defaultValue={existing?.labelAr ?? ''} maxLength={60} dir="rtl" lang="ar" required={kind === 'info' && locale === 'ar'} />
        </div>
        {kind !== 'scene' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextArea name="noteEn" label={t.spotNoteEn} defaultValue={existing?.noteEn ?? ''} maxLength={200} dir="ltr" />
            <TextArea name="noteAr" label={t.spotNoteAr} defaultValue={existing?.noteAr ?? ''} maxLength={200} dir="rtl" lang="ar" />
          </div>
        )}
      </form>
    </Dialog>
  );
}
