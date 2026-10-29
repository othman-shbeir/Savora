import Link from 'next/link';
import { fill, type Locale } from '@savora/shared';
import { LEGAL_UPDATED } from '@/content/legal';
import type { Dictionary } from '@/app/[lang]/dictionaries';
import { PageToggles } from '../page-toggles';
import { Logo } from '../ui/logo';

type Doc = { title: string; lead: string; updated: string; sections: Array<{ heading: string; body: string[] }> };

/** Privacy and Terms: one readable column, with contact details when SUPPORT_EMAIL is set. */
export function LegalPage({ doc, locale, labels, contact }: { doc: Doc; locale: Locale; labels: Dictionary['common']; contact: { label: string; email: string } | null }) {
  const date = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(LEGAL_UPDATED));
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-5">
        <Link href={`/${locale}`}>
          <Logo width={104} />
        </Link>
        <PageToggles locale={locale} labels={labels} />
      </header>
      <main id="main" className="mx-auto max-w-3xl px-5 pt-8 pb-20">
        <h1 className="text-heading-xl font-semibold tracking-[-0.03em]">{doc.title}</h1>
        <p className="mt-2 text-caption text-muted">{fill(doc.updated, { date })}</p>
        <p className="mt-6 text-body-l text-ink-2">{doc.lead}</p>
        {doc.sections.map((s) => (
          <section key={s.heading} className="mt-10">
            <h2 className="text-heading-s font-semibold">{s.heading}</h2>
            {s.body.map((p) => (
              <p key={p.slice(0, 40)} className="mt-3 text-body-m text-ink-2">
                {p}
              </p>
            ))}
          </section>
        ))}
        {contact && (
          <p className="mt-12 rounded-2xl border border-line bg-surface p-5 text-body-m">
            {contact.label}{' '}
            <a href={`mailto:${contact.email}`} dir="ltr" className="font-semibold text-brand hover:underline">
              {contact.email}
            </a>
          </p>
        )}
      </main>
    </div>
  );
}
