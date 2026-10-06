'use client';

import { useRef, useState } from 'react';
import { parsePrice, priceInput, type Locale, type MenuDraft, type MenuItem, type Photo } from '@savora/shared';
import { send } from '@/lib/client-api';
import { primaryName } from '@/lib/menu-text';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Field, Select, TextArea } from '../ui/field';
import { Switch } from '../ui/switch';
import type { EditorText } from './menu-editor';

const NEW = '__new__';
// Which error a field clears once the owner edits it.
const ERROR_OF: Record<string, keyof Errors> = { nameEn: 'name', nameAr: 'name', price: 'price', newCategory: 'category' };
const MAX_BYTES = 8 * 1024 * 1024;

type Errors = Partial<Record<'name' | 'price' | 'category' | 'photo' | 'form', string>>;

/** Add or edit one dish. The dialog body remounts per item, so each opening starts from that item. */
export function ItemDialog(props: { open: boolean; item: MenuItem | null; defaultCategoryId?: string; draft: MenuDraft; t: EditorText; locale: Locale; onClose: () => void; onSaved: () => void }) {
  const { open, item, t, onClose } = props;
  return (
    <Dialog open={open} onClose={onClose} title={item ? t.editTitle : t.addTitle} closeLabel={t.close} size="lg">
      {open && <ItemForm key={item?.id ?? 'new'} {...props} />}
    </Dialog>
  );
}

function ItemForm({ item, defaultCategoryId, draft, t, locale, onClose, onSaved }: { item: MenuItem | null; defaultCategoryId?: string; draft: MenuDraft; t: EditorText; locale: Locale; onClose: () => void; onSaved: () => void }) {
  const { categories, location } = draft;
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? NEW);
  const [available, setAvailable] = useState(item?.available ?? true);
  const [photo, setPhoto] = useState<Photo | null>(item?.photo ?? null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const currencySymbol = new Intl.NumberFormat('en', { style: 'currency', currency: location.currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((p) => p.type === 'currency')?.value;

  async function upload(file: File) {
    if (file.size > MAX_BYTES) return setErrors((e) => ({ ...e, photo: t.photoTooBig }));
    setUploading(true);
    setErrors((e) => ({ ...e, photo: undefined }));
    const body = new FormData();
    body.append('file', file);
    try {
      const res = await fetch(`/api/organizations/${location.organizationId}/media`, { method: 'POST', body });
      if (res.ok) setPhoto(await res.json());
      else setErrors((e) => ({ ...e, photo: res.status === 413 ? t.photoTooBig : res.status === 415 ? t.photoFailed : t.failed }));
    } catch {
      setErrors((e) => ({ ...e, photo: t.failed }));
    }
    setUploading(false);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? '').trim() || null;
    const values = { nameEn: text('nameEn'), nameAr: text('nameAr'), descriptionEn: text('descriptionEn'), descriptionAr: text('descriptionAr') };
    const priceMinor = parsePrice(String(f.get('price') ?? ''));
    const newCategory = text('newCategory');

    const next: Errors = {};
    if (!values.nameEn && !values.nameAr) next.name = t.nameRequired;
    if (priceMinor === null) next.price = t.priceInvalid;
    if (categoryId === NEW && !newCategory) next.category = t.categoryRequired;
    setErrors(next);
    if (Object.keys(next).length) {
      // Focus the first field that needs attention.
      e.currentTarget.querySelector<HTMLElement>('[aria-invalid=true]')?.focus();
      return;
    }

    setBusy(true);
    let target = categoryId;
    if (categoryId === NEW) {
      // A new category is named in the language the owner is working in.
      const created = await send<{ id: string }>('POST', `/locations/${location.id}/categories`, locale === 'ar' ? { nameAr: newCategory } : { nameEn: newCategory });
      if (!created.ok || !created.data) {
        setBusy(false);
        return setErrors({ form: t.failed });
      }
      target = created.data.id;
      setCategoryId(target);
    }
    const payload = { ...values, priceMinor, available, categoryId: target, photoId: photo?.id ?? null };
    const res = item ? await send('PATCH', `/items/${item.id}`, payload) : await send('POST', `/locations/${location.id}/items`, payload);
    setBusy(false);
    if (!res.ok) return setErrors({ form: t.failed });
    onSaved();
  }

  return (
    <form
      onSubmit={submit}
      onChange={(e) => {
        const target = e.target as unknown as { name?: string };
        const key = ERROR_OF[target.name ?? ''];
        if (key && errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
      }}
      noValidate
      className="grid gap-5"
    >
      <div className="grid gap-5 sm:grid-cols-[120px_minmax(0,1fr)]">
        <div className="grid content-start gap-2">
          <span className="text-caption font-medium text-ink-2">{t.photo}</span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-describedby="photo-hint"
            className="relative grid aspect-square w-[120px] place-items-center overflow-hidden rounded-2xl border border-dashed border-line-2 bg-surface-2 text-caption font-semibold text-muted transition-colors hover:border-brand hover:text-brand"
          >
            {photo ? (
              // Pre-sized thumbnail from the API.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo.thumbUrl} alt="" className="absolute inset-0 size-full object-cover" />
            ) : (
              <span className="grid justify-items-center gap-1.5 px-2 text-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="5" width="18" height="14" rx="3" />
                  <circle cx="9" cy="11" r="2" />
                  <path d="m21 16-5-5-8 8" />
                </svg>
                {uploading ? t.uploading : t.addPhoto}
              </span>
            )}
            {photo && uploading && <span className="absolute inset-0 grid place-items-center bg-black/50 text-white">{t.uploading}</span>}
            <span className="sr-only">{photo ? t.replacePhoto : t.addPhoto}</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) upload(file);
            }}
          />
          {photo && (
            <div className="flex gap-3 text-caption font-semibold">
              <button type="button" className="text-ink-2 hover:text-ink" onClick={() => fileRef.current?.click()}>
                {t.replacePhoto}
              </button>
              <button type="button" className="text-brand" onClick={() => setPhoto(null)}>
                {t.removePhoto}
              </button>
            </div>
          )}
          <p id="photo-hint" className={errors.photo ? 'text-caption text-brand' : 'text-[11px] leading-snug text-muted'} role={errors.photo ? 'alert' : undefined}>
            {errors.photo ?? t.photoHint}
          </p>
        </div>

        <div className="grid content-start gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="nameEn" label={t.nameEn} defaultValue={item?.nameEn ?? ''} dir="ltr" lang="en" maxLength={80} error={errors.name} autoFocus />
            <Field name="nameAr" label={t.nameAr} defaultValue={item?.nameAr ?? ''} dir="rtl" lang="ar" maxLength={80} aria-invalid={errors.name ? true : undefined} />
            <TextArea name="descriptionEn" label={`${t.descEn} · ${t.optional}`} defaultValue={item?.descriptionEn ?? ''} dir="ltr" lang="en" maxLength={240} />
            <TextArea name="descriptionAr" label={`${t.descAr} · ${t.optional}`} defaultValue={item?.descriptionAr ?? ''} dir="rtl" lang="ar" maxLength={240} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="price"
              label={`${t.price} (${currencySymbol ?? location.currency})`}
              defaultValue={item ? priceInput(item.priceMinor) : ''}
              inputMode="decimal"
              dir="ltr"
              autoComplete="off"
              hint={t.priceHint}
              error={errors.price}
            />
            <div className="grid content-start gap-2">
              <Select label={t.category} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {primaryName(c, locale)}
                  </option>
                ))}
                <option value={NEW}>{t.newCategory}</option>
              </Select>
              {categoryId === NEW && <Field name="newCategory" label={t.newCategoryName} maxLength={80} error={errors.category} autoFocus={categories.length > 0} />}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-line p-3.5">
            <div>
              <p className="text-body-s font-semibold">{t.available}</p>
              <p className="text-caption text-muted">{t.availableHint}</p>
            </div>
            <Switch label={t.available} checked={available} onChange={setAvailable} />
          </div>
        </div>
      </div>

      {errors.form && (
        <p role="alert" className="rounded-xl bg-brand-soft px-4 py-3 text-body-s text-brand">
          {errors.form}
        </p>
      )}
      <div className="sticky -bottom-5 -mx-6 -mb-5 flex justify-end gap-2.5 border-t border-line bg-surface-2 px-6 py-4">
        <Button type="button" variant="secondary" onClick={onClose}>
          {t.cancel}
        </Button>
        <Button type="submit" disabled={busy || uploading}>
          {busy ? t.saving : t.save}
        </Button>
      </div>
    </form>
  );
}

/** Small yes/no dialog for destructive actions. */
export function ConfirmDialog({ open, title, body, confirm, t, onClose, onConfirm }: { open: boolean; title: string; body: string; confirm: string; t: EditorText; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={body}
      closeLabel={t.close}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm();
              setBusy(false);
            }}
          >
            {confirm}
          </Button>
        </>
      }
    />
  );
}
