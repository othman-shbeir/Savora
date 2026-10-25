import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import type { PreviewData } from '@/components/themes/theme-preview';
import { ThemesScreen } from '@/components/themes/themes-screen';
import { Card } from '@/components/ui/card';
import { getMenu, getThemes } from '@/lib/api';
import { nameOf, requireWorkspace } from '@/lib/workspace';
import { getDictionary, getLocale } from '../../dictionaries';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).nav.menuThemes };
}

/** Shown in the preview while the menu is still empty. */
const SAMPLE: PreviewData['items'] = [
  { nameEn: 'Cardamom Latte', nameAr: 'لاتيه بالهيل', descriptionEn: 'Espresso, cardamom, orange', descriptionAr: 'إسبريسو، هيل، برتقال', priceMinor: 1800, thumbUrl: null },
  { nameEn: 'Spanish Latte', nameAr: 'سبانش لاتيه', descriptionEn: 'Cold brew, condensed milk', descriptionAr: 'قهوة باردة، حليب مكثّف', priceMinor: 2200, thumbUrl: null },
  { nameEn: 'Labneh Toast', nameAr: 'توست باللبنة', descriptionEn: 'Labneh, za’atar, olive oil', descriptionAr: 'لبنة، زعتر، زيت زيتون', priceMinor: 2500, thumbUrl: null },
];

/** Menu themes for the location chosen in the sidebar. */
export default async function ThemesPage() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const { ctx, org, me, shell } = await requireWorkspace(locale);
  const loc = ctx.location;
  const [data, menu] = loc ? await Promise.all([getThemes(loc.id), getMenu(loc.id)]) : [null, null];
  if (loc && (!data || !menu)) notFound();

  // The preview uses the place's first section with dishes, so owners judge the look on their own menu.
  const section = menu?.categories.find((c) => c.items.length);
  const preview: PreviewData | null = data
    ? {
        name: { en: data.brand.nameEn, ar: data.brand.nameAr },
        tagline: { en: data.brand.taglineEn, ar: data.brand.taglineAr },
        // Logos use the full image: the thumbnail is a square crop that would cut off a wide logo.
        logoUrl: data.brand.logo?.url ?? null,
        coverUrl: data.cover?.url ?? null,
        currency: menu!.location.currency,
        section: section ? { en: section.nameEn, ar: section.nameAr } : { en: 'House favorites', ar: 'المفضلة لدينا' },
        items: section
          ? section.items.slice(0, 3).map(({ nameEn, nameAr, descriptionEn, descriptionAr, priceMinor, photo }) => ({ nameEn, nameAr, descriptionEn, descriptionAr, priceMinor, thumbUrl: photo?.thumbUrl ?? null }))
          : SAMPLE,
      }
    : null;

  return (
    <AppShell t={t} locale={locale} active="menuThemes" workspace={shell}>
      {loc && data && preview ? (
        <ThemesScreen
          key={loc.id}
          data={data}
          t={t}
          locale={locale}
          orgId={org.id}
          locationId={loc.id}
          locationName={nameOf(loc, locale)}
          slug={loc.slug}
          canEdit={org.role !== 'editor'}
          userName={me.user.name}
          preview={preview}
        />
      ) : (
        <Card className="max-w-xl p-6">
          <p className="text-body-m text-muted">{t.editor.noLocation}</p>
        </Card>
      )}
    </AppShell>
  );
}
