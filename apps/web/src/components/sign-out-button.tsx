'use client';

import { useRouter } from 'next/navigation';
import type { Locale } from '@savora/shared';

export function SignOutButton({ label, locale }: { label: string; locale: Locale }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
        router.replace(`/${locale}/sign-in`);
        router.refresh();
      }}
      className="text-caption font-semibold text-muted hover:text-brand"
    >
      {label}
    </button>
  );
}
