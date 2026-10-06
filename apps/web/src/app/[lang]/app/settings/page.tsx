import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { can } from '@savora/shared';
import { AppShell } from '@/components/app-shell';
import { SettingsForm } from '@/components/settings/settings-form';
import { Card } from '@/components/ui/card';
import { getSettings, MENU_ORIGIN } from '@/lib/api';
import { requireWorkspace } from '@/lib/workspace';
import { getDictionary, getLocale } from '../../dictionaries';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).nav.settings };
}

/** Settings for the location chosen in the sidebar. Owners and admins edit; editors can look. */
export default async function SettingsPage() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const { ctx, org, shell } = await requireWorkspace(locale);
  const loc = ctx.location;
  const settings = loc ? await getSettings(loc.id) : null;
  if (loc && !settings) notFound();
  const brand = ctx.brand ?? org.brands[0];
  const branchIndex = (brand?.locations.findIndex((l) => l.id === loc?.id) ?? 0) + 1;

  return (
    <AppShell t={t} locale={locale} active="settings" workspace={shell}>
      {settings ? (
        <SettingsForm key={settings.id} settings={settings} t={t} locale={locale} canEdit={org.role !== 'editor'} menuOrigin={MENU_ORIGIN} branchIndex={branchIndex} guestLinks={can(org.plan, 'guestLinks')} />
      ) : (
        <Card className="max-w-xl p-6">
          <p className="text-body-m text-muted">{t.editor.noLocation}</p>
        </Card>
      )}
    </AppShell>
  );
}
