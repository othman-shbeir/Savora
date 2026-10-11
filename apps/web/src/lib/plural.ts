import type { Locale } from '@savora/shared';
import { fill } from '@savora/shared/format';

/** Plural forms as CLDR names them. English needs one/other; Arabic uses all six. */
export type PluralForms = { other: string } & Partial<Record<Intl.LDMLPluralRule, string>>;

/** plural('ar', 3, t.items) -> "3 أصناف". A "zero" form, when given, is used for 0 in every
 *  language ("The category is empty."), not only where CLDR has one. Falls back to "other". */
export function plural(locale: Locale, n: number, forms: PluralForms) {
  const rule = n === 0 && forms.zero ? 'zero' : new Intl.PluralRules(locale).select(n);
  return fill(forms[rule] ?? forms.other, { n });
}
