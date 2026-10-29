import type { Locale } from '@savora/shared';
import type { Dictionary } from '@/app/[lang]/dictionaries';
import { cx } from '@/lib/cx';
import { LocaleSwitch } from './locale-switch';
import { ThemeSwitch } from './theme-switch';

/** The language and theme switches every page header carries, side by side. */
export function PageToggles({ locale, labels, className }: { locale: Locale; labels: Dictionary['common']; className?: string }) {
  return (
    <div className={cx('flex flex-wrap items-center gap-2', className)}>
      <LocaleSwitch current={locale} label={labels.language} />
      <ThemeSwitch labels={labels} compact />
    </div>
  );
}
