'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

// Error boundaries are client components, so the text lives here rather than in the dictionaries
// (which load on the server). Kept short: it only shows when a page can't be rendered, most often
// because the API is unreachable for a moment.
const TEXT = {
  en: {
    title: 'Something went wrong',
    body: 'This page couldn’t load. It’s usually brief; please try again.',
    retry: 'Try again',
    home: 'Go to the home page',
    ref: 'Reference',
  },
  ar: {
    title: 'حدث خطأ ما',
    body: 'تعذّر تحميل هذه الصفحة. غالبًا ما يكون الأمر مؤقتًا، يُرجى المحاولة مرة أخرى.',
    retry: 'إعادة المحاولة',
    home: 'الذهاب إلى الصفحة الرئيسية',
    ref: 'رقم المرجع',
  },
};

export default function PageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { lang } = useParams<{ lang: string }>();
  const t = lang === 'ar' ? TEXT.ar : TEXT.en;
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-center">
      <div>
        <h1 className="text-heading-m font-semibold">{t.title}</h1>
        <p className="mx-auto mt-2 max-w-xs text-body-m text-muted">{t.body}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={() => retry()}>{t.retry}</Button>
          <Link href={`/${lang === 'ar' ? 'ar' : 'en'}`} className="inline-flex h-10 items-center px-2 text-body-s font-semibold text-brand underline-offset-4 hover:underline">
            {t.home}
          </Link>
        </div>
        {/* The digest matches the server log line, so support can find what happened. */}
        {error.digest && (
          <p className="mt-6 text-caption text-muted">
            {t.ref}: <span dir="ltr">{error.digest}</span>
          </p>
        )}
      </div>
    </main>
  );
}
