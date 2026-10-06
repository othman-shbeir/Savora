import type { Metadata } from 'next';
import { VerifyLink } from '@/components/auth/verify-link';
import { Logo } from '@/components/ui/logo';
import { getDictionary, getLocale } from '../../dictionaries';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).auth.title, robots: { index: false } };
}

export default async function VerifyPage() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <div className="w-full max-w-[400px] text-center">
        <div className="mb-8 flex justify-center">
          <Logo width={120} />
        </div>
        <VerifyLink t={t.auth} locale={locale} />
      </div>
    </main>
  );
}
