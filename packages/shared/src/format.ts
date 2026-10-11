// Formatting helpers with no dependencies, so browser code on public pages can import them
// (via "@savora/shared/format") without pulling in the validation schemas.

/** 1800 -> "₪18.00". Western digits in both languages, matching the designs. */
export function formatPrice(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

/** Fills {placeholders} in a dictionary string: fill('{n} scans', { n: 3 }) -> '3 scans'. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
