import { notFound } from 'next/navigation';
import { fill } from '@savora/shared';
import { NAV } from '@/components/app-shell';
import { ButtonLink } from '@/components/ui/button';
import { Card, Overline } from '@/components/ui/card';
import { requireWorkspace } from '@/lib/workspace';
import { getDictionary, getLocale } from '../../dictionaries';

/** Workspace screens from later phases: the navigation works now, the screen says when it lands. */
export default async function ComingSoon({ params }: PageProps<'/[lang]/app/[...section]'>) {
  const [{ section }, t, locale] = await Promise.all([params, getDictionary(), getLocale()]);
  const item = NAV.find((n) => n.path === `/app/${section.join('/')}`);
  if (!item) notFound();
  await requireWorkspace(locale);
  return (
    <>
      <Overline>{t.soon.overline}</Overline>
      <h1 className="mt-2.5 text-heading-l font-semibold tracking-[-0.02em]">{t.nav[item.key]}</h1>
      <Card className="mt-7 max-w-xl p-6">
        <p className="text-body-m text-muted">{fill(t.soon.body, { n: item.phase })}</p>
        <ButtonLink href={`/${locale}/app`} variant="secondary" className="mt-5">
          {t.soon.back}
        </ButtonLink>
      </Card>
    </>
  );
}
