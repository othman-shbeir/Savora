'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Locale } from '@savora/shared';
import type { Dictionary } from '@/app/[lang]/dictionaries';
import { Button } from './ui/button';
import { Field } from './ui/field';

/** Names a new branch, creates it, switches the workspace to it and opens its settings. */
export function AddLocationForm({ orgId, t, locale }: { orgId: string; t: Dictionary['locations']; locale: Locale }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const nameEn = String(f.get('nameEn') ?? '').trim();
    if (nameEn.length < 2) return setError(t.required);
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/organizations/${orgId}/locations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nameEn, nameAr: f.get('nameAr') }),
    }).catch(() => null);
    if (!res?.ok) {
      setBusy(false);
      // A limit reached in the meantime: reloading shows the upgrade prompt.
      if (res?.status === 402) return router.refresh();
      return setError(t.failed);
    }
    const { id } = (await res.json()) as { id: string };
    document.cookie = `savora_loc=${id}; path=/; max-age=31536000; samesite=lax`;
    router.push(`/${locale}/app/settings`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="nameEn" label={t.nameEn} maxLength={80} placeholder="Old City kitchen" error={error === t.required ? error : undefined} autoFocus />
        <Field name="nameAr" label={t.nameAr} maxLength={80} dir="rtl" lang="ar" placeholder="مطبخ البلدة القديمة" />
      </div>
      {error && error !== t.required && (
        <p role="alert" className="rounded-xl bg-brand-soft px-4 py-3 text-body-s text-brand">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={busy} className="justify-self-start">
        {busy ? t.creating : t.create}
      </Button>
    </form>
  );
}
