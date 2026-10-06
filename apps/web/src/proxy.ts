import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LOCALE, LOCALES } from '@savora/shared';

// Every page lives under /en or /ar. Bare paths (including printed QR links like /r/saltandstem)
// redirect to the visitor's language: Arabic when the browser prefers it, English otherwise.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasLocale = LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
  if (hasLocale) return;

  const preferred = request.headers.get('accept-language') ?? '';
  const locale = /^\s*ar\b/i.test(preferred) ? 'ar' : DEFAULT_LOCALE;
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals, API routes and any file with an extension (images, icons, robots.txt).
  // The dot needs a double escape (string, then pattern); with one, "." matched any character and
  // the exclusion swallowed every path longer than one character.
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
