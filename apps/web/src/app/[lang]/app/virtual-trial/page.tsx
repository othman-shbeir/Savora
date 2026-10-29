import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TourStudio } from '@/components/tour/tour-studio';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getTourOrLock } from '@/lib/api';
import { nameOf, requireWorkspace } from '@/lib/workspace';
import { getDictionary, getLocale } from '../../dictionaries';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).nav.virtualTrial };
}

/** Virtual trial for the location chosen in the sidebar. */
export default async function VirtualTrialPage() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const { ctx, org } = await requireWorkspace(locale);
  const loc = ctx.location;
  const res = loc ? await getTourOrLock(loc.id) : null;
  if (loc && !res) notFound();
  const brand = ctx.brand ?? org.brands[0];

  return (
    <>
      {!loc || !res ? (
        <Card className="max-w-xl p-6">
          <p className="text-body-m text-muted">{t.editor.noLocation}</p>
        </Card>
      ) : 'locked' in res ? (
        // Starter: what the feature does, and the way to it.
        <>
          <p className="text-overline font-semibold tracking-[0.11em] text-brand uppercase">{t.nav.virtualTrial}</p>
          <h1 className="mt-2.5 text-heading-l font-semibold tracking-[-0.02em]">{t.tour.title}</h1>
          <Card className="mt-7 grid max-w-2xl gap-3 p-8">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-caption font-semibold text-brand">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              {t.locks.growth}
            </span>
            <h2 className="text-heading-s font-semibold">{t.tour.lockedTitle}</h2>
            <p className="max-w-lg text-body-m text-muted">{t.tour.lockedBody}</p>
            <ButtonLink href={`/${locale}/app/billing`} className="mt-2 justify-self-start">
              {t.locks.seePlans}
            </ButtonLink>
          </Card>
        </>
      ) : (
        <TourStudio
          key={loc.id}
          initial={res.draft}
          t={t}
          guestText={t.guest}
          locale={locale}
          locationName={nameOf(loc, locale)}
          place={brand ? { en: brand.nameEn, ar: brand.nameAr } : { en: org.nameEn, ar: org.nameAr }}
          canPublish={org.role !== 'editor'}
        />
      )}
    </>
  );
}
