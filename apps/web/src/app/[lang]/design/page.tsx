import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import { LocaleSwitch } from '@/components/locale-switch';
import { ThemeSwitch } from '@/components/theme-switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, Overline } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import { getDictionary, getLocale } from '../dictionaries';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).design.title };
}

const SWATCHES = [
  ['brand', 'bg-brand'],
  ['gold', 'bg-gold'],
  ['ok', 'bg-ok'],
  ['ink', 'bg-ink'],
  ['muted', 'bg-muted'],
  ['line', 'bg-line-2'],
  ['surface', 'bg-surface'],
  ['bg', 'bg-bg'],
] as const;

const TYPE = [
  ['Display', 'text-display font-bold tracking-[-0.03em]'],
  ['Heading L', 'text-heading-l font-semibold tracking-[-0.02em]'],
  ['Heading S', 'text-heading-s font-semibold'],
  ['Title M', 'text-title-m font-semibold'],
  ['Body M', 'text-body-m'],
  ['Caption', 'text-caption text-muted'],
] as const;

// Static sample so the showcase renders without signing in.
const DEMO = {
  orgName: 'Salt & Stem Group',
  locations: [{ id: 'demo', label: 'Ramallah counter', status: 'live' as const, paused: false }],
  currentLocationId: 'demo',
  user: { name: 'Nadia', email: 'nadia@saltandstem.co' },
};

/** Phase 0 showcase: every token and component, in the current theme and language. */
export default async function DesignPage() {
  const t = await getDictionary();
  const locale = await getLocale();
  const d = t.design;
  const sample = locale === 'ar' ? 'لاتيه بالهيل' : 'Cardamom Latte';

  return (
    <AppShell t={t} locale={locale} workspace={DEMO}>
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Overline>{d.overline}</Overline>
          <h1 className="mt-2.5 text-heading-l font-semibold tracking-[-0.02em]">{d.title}</h1>
          <p className="mt-1.5 max-w-xl text-body-m text-muted">{d.lead}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LocaleSwitch current={locale} label={t.common.language} />
          <ThemeSwitch labels={t.common} />
        </div>
      </header>

      <div className="mt-8 grid gap-5 xl:grid-cols-2">
        <Card className="p-6">
          <Overline>{d.colors}</Overline>
          <ul className="mt-4 grid grid-cols-4 gap-3">
            {SWATCHES.map(([name, cls]) => (
              <li key={name} className="grid gap-1.5">
                <span className={`h-12 rounded-xl border border-line ${cls}`} />
                <span className="text-caption text-muted">{name}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          <Overline>{d.type}</Overline>
          <ul className="mt-4 grid gap-2">
            {TYPE.map(([name, cls]) => (
              <li key={name} className="flex items-baseline justify-between gap-4 border-b border-line pb-2 last:border-0">
                <span className={`min-w-0 truncate ${cls}`}>{name === 'Display' ? 'Savora' : sample}</span>
                <span className="shrink-0 text-caption text-muted">{name}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          <Overline>{d.buttons}</Overline>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button>{d.publish}</Button>
            <Button variant="secondary">{d.preview}</Button>
            <Button variant="dark">{d.qr}</Button>
            <Button disabled>{d.save}</Button>
          </div>
          <Overline className="mt-6">{d.status}</Overline>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="ok">{t.nav.live}</Badge>
            <Badge tone="ok">{d.onMenu}</Badge>
            <Badge tone="gold">{d.optional}</Badge>
            <Badge tone="brand">{d.retake}</Badge>
            <Badge>{d.hidden}</Badge>
            <Badge>{d.growth}</Badge>
          </div>
        </Card>

        <Card className="p-6">
          <Overline>{d.fields}</Overline>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={d.locationName} defaultValue="Ramallah counter" />
            <Field label={d.arabicName} defaultValue="فرع رام الله" dir="rtl" lang="ar" />
            <Field label={d.email} type="email" placeholder="you@yourplace.com" hint={d.emailHint} />
            <Field label={d.email} type="email" defaultValue="nadia@" error={d.emailError} />
          </div>
        </Card>

        <Card className="p-6">
          <Overline>{d.controls}</Overline>
          <div className="mt-4 grid gap-5">
            <div className="flex items-center justify-between gap-4">
              <span className="text-body-s font-medium">{d.showMap}</span>
              <Switch label={d.showMap} defaultChecked />
            </div>
            <Segmented
              label={d.sevenDays}
              defaultValue="7"
              options={[
                { value: '1', label: d.today },
                { value: '7', label: d.sevenDays },
                { value: '30', label: d.thirtyDays },
              ]}
            />
          </div>
        </Card>

        <Card className="p-6">
          <Overline>{d.cards}</Overline>
          <div className="mt-4 flex items-end justify-between gap-4 rounded-[20px] bg-[#1c1c1c] p-5 text-[#f5f5f5]">
            <div>
              <p className="text-overline font-semibold tracking-[0.1em] text-[#a6a6a6] uppercase">{d.lastSeven}</p>
              <p className="mt-3 text-[36px] leading-none font-semibold">214</p>
              <p className="mt-1 text-caption text-[#a6a6a6]">{d.scansPerDay}</p>
            </div>
            <div aria-hidden className="flex h-11 items-end gap-1">
              {[18, 24, 31, 27, 44, 39, 31].map((v, i) => (
                <span key={i} className={`w-2 rounded-t-sm ${i === 4 ? 'bg-[#ff4d4d]' : 'bg-white/30'}`} style={{ height: v }} />
              ))}
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
