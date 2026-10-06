'use client';

import { useState } from 'react';
import type { Locale } from '@savora/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import type { Dictionary } from '@/app/[lang]/dictionaries';

type State = { step: 'form'; error?: string } | { step: 'sent'; email: string; devLink?: string };

/** Asks the API for a one-time sign-in link, then shows the "check your email" step. */
export function EmailSignIn({ t, locale }: { t: Dictionary['auth']; locale: Locale }) {
  const [state, setState] = useState<State>({ step: 'form' });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get('email') ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setState({ step: 'form', error: t.invalidEmail });
    setBusy(true);
    try {
      const res = await fetch('/api/auth/email/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, locale }) });
      if (res.status === 429) return setState({ step: 'form', error: t.tooMany });
      if (res.status === 400) return setState({ step: 'form', error: t.invalidEmail });
      if (!res.ok) return setState({ step: 'form', error: t.failed });
      const body = (await res.json()) as { devLink?: string };
      setState({ step: 'sent', email, devLink: body.devLink });
    } catch {
      setState({ step: 'form', error: t.failed });
    } finally {
      setBusy(false);
    }
  }

  if (state.step === 'sent') {
    return (
      <div role="status" className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-title-m font-semibold">{t.checkTitle}</p>
        <p className="mt-1.5 text-body-s text-muted">
          {t.checkBody.split('{email}')[0]}
          <bdi dir="ltr" className="font-medium text-ink">
            {state.email}
          </bdi>
          {t.checkBody.split('{email}')[1]}
        </p>
        {state.devLink && (
          <a href={state.devLink} className="mt-4 block rounded-xl bg-gold-soft px-4 py-3 text-caption font-semibold text-ink">
            {t.devLink}
          </a>
        )}
        <button type="button" onClick={() => setState({ step: 'form' })} className="mt-4 text-caption font-semibold text-brand">
          {t.useOther}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <Field name="email" type="email" autoComplete="email" inputMode="email" label={t.email} placeholder={t.emailPlaceholder} error={state.error} required />
      <Button type="submit" size="lg" disabled={busy}>
        {busy ? t.sending : t.continue}
      </Button>
    </form>
  );
}
