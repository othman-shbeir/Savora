'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Locale } from '@savora/shared';
import type { Dictionary } from '@/app/[lang]/dictionaries';
import { Button } from './ui/button';
import { Field } from './ui/field';

type Errors = Partial<Record<'businessName' | 'locationName' | 'form', string>>;

/** First-run setup: business name and first location, each with an optional Arabic name. */
export function OnboardingForm({ t, locale }: { t: Dictionary['welcome']; locale: Locale }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      businessName: String(f.get('businessName') ?? '').trim(),
      businessNameAr: String(f.get('businessNameAr') ?? '').trim(),
      locationName: String(f.get('locationName') ?? '').trim(),
      locationNameAr: String(f.get('locationNameAr') ?? '').trim(),
      currency: String(f.get('currency') ?? 'ILS'),
    };
    const next: Errors = {};
    if (body.businessName.length < 2) next.businessName = t.required;
    if (body.locationName.length < 2) next.locationName = t.required;
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const res = await fetch('/api/organizations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(String(res.status));
      router.replace(`/${locale}/app`);
      router.refresh();
    } catch {
      setErrors({ form: t.failed });
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="businessName" label={t.business} placeholder="Salt & Stem" error={errors.businessName} autoComplete="organization" />
        <Field name="businessNameAr" label={`${t.businessAr} · ${t.optional}`} dir="rtl" lang="ar" placeholder="سولت آند ستيم" />
        <Field name="locationName" label={t.location} hint={t.locationHint} error={errors.locationName} />
        <Field name="locationNameAr" label={`${t.locationAr} · ${t.optional}`} dir="rtl" lang="ar" placeholder="فرع رام الله" />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="currency" className="text-caption font-medium text-ink-2">
          {t.currency}
        </label>
        <select id="currency" name="currency" defaultValue="ILS" className="h-11 rounded-[11px] border border-line-2 bg-surface px-3 text-body-s">
          <option value="ILS">ILS · ₪</option>
          <option value="JOD">JOD · د.ا</option>
          <option value="USD">USD · $</option>
        </select>
      </div>
      {errors.form && (
        <p role="alert" className="rounded-xl bg-brand-soft px-4 py-3 text-body-s text-brand">
          {errors.form}
        </p>
      )}
      <Button type="submit" size="lg" disabled={busy}>
        {busy ? t.creating : t.create}
      </Button>
    </form>
  );
}
