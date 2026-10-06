import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { MenuEditor } from '@/components/menu/menu-editor';
import { ButtonLink } from '@/components/ui/button';
import { Card, Overline } from '@/components/ui/card';
import { getMenu } from '@/lib/api';
import { nameOf, requireWorkspace } from '@/lib/workspace';
import { getDictionary, getLocale } from '../../dictionaries';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).nav.menuEditor };
}

/** The current location's draft menu: start points, publishing, health checks and the item list. */
export default async function MenuEditorPage() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const { ctx, org, shell } = await requireWorkspace(locale);
  const e = t.editor;
  const draft = ctx.location ? await getMenu(ctx.location.id) : null;
  if (ctx.location && !draft) notFound();
  const brand = ctx.brand ?? org.brands[0];

  return (
    <AppShell t={t} locale={locale} active="menuEditor" workspace={shell}>
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <Overline>{e.overline}</Overline>
          <h1 className="mt-2.5 text-heading-l font-semibold tracking-[-0.02em] sm:text-heading-xl">{e.title}</h1>
          <p className="mt-2 max-w-xl text-body-m text-muted">{e.lead}</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {draft?.published && (
            <ButtonLink href={`/${locale}/r/${draft.location.slug}`} target="_blank" rel="noopener" variant="secondary">
              {e.viewMenu} <span aria-hidden>{locale === 'ar' ? '↖' : '↗'}</span>
            </ButtonLink>
          )}
          <ButtonLink href={`/${locale}/app/qr`} variant="dark">
            {e.qr}
          </ButtonLink>
        </div>
      </header>

      {draft ? (
        <MenuEditor
          key={draft.location.id}
          draft={draft}
          t={e}
          locale={locale}
          brand={{
            name: brand ? nameOf(brand, locale) : nameOf(org, locale),
            tagline: brand ? (locale === 'ar' ? brand.taglineAr : brand.taglineEn) : null,
          }}
        />
      ) : (
        <Card className="mt-7 max-w-xl p-6">
          <p className="text-body-m text-muted">{e.noLocation}</p>
        </Card>
      )}
    </AppShell>
  );
}
