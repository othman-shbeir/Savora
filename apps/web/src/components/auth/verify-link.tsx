'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Locale } from '@savora/shared';
import type { Dictionary } from '@/app/[lang]/dictionaries';

/** Reads the one-time token from the URL fragment, trades it for a session, then opens the workspace. */
export function VerifyLink({ t, locale }: { t: Dictionary['auth']; locale: Locale }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // React dev mode runs effects twice; a link only works once
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    // Drop the token from the address bar and history straight away.
    window.history.replaceState(null, '', window.location.pathname);
    const exchange = token
      ? fetch('/api/auth/email/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })
      : Promise.reject(new Error('missing token'));
    exchange
      .then((res) => {
        if (!res.ok) throw new Error('expired');
        router.replace(`/${locale}/app`);
        router.refresh();
      })
      .catch(() => setFailed(true));
  }, [locale, router]);

  if (!failed) {
    return (
      <p role="status" className="text-body-m text-muted">
        {t.verifying}
      </p>
    );
  }
  return (
    <div role="alert">
      <h1 className="text-heading-m font-semibold">{t.expiredTitle}</h1>
      <p className="mt-2 text-body-m text-muted">{t.expiredBody}</p>
      <Link href={`/${locale}/sign-in`} className="mt-6 inline-flex h-11 items-center rounded-xl bg-brand-fill px-5 text-body-s font-semibold text-white">
        {t.backToSignIn}
      </Link>
    </div>
  );
}
