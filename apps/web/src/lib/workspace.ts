import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getMe } from './api';
import type { Locale, LocationSummary, Me, OrganizationSummary } from '@savora/shared';

export const LOCATION_COOKIE = 'savora_loc';

/** Picks the organization and location the workspace is showing: the remembered one, else the first. */
export async function currentContext(me: Me) {
  const remembered = (await cookies()).get(LOCATION_COOKIE)?.value;
  const all = me.organizations.flatMap((org) => org.brands.flatMap((brand) => brand.locations.map((loc) => ({ org, brand, loc }))));
  const hit = all.find((x) => x.loc.id === remembered) ?? all[0];
  const org: OrganizationSummary | undefined = hit?.org ?? me.organizations[0];
  return { org, brand: hit?.brand, location: hit?.loc, locations: all };
}

/** Name in the reader's language, falling back to English. */
export function nameOf(x: { nameEn: string; nameAr: string | null }, locale: Locale) {
  return locale === 'ar' && x.nameAr ? x.nameAr : x.nameEn;
}

export type LocationOption = { id: string; label: string; status: LocationSummary['status']; paused: boolean };

/** Loads the signed-in workspace for a page, sending visitors to sign-in or onboarding when needed. */
export async function requireWorkspace(locale: Locale) {
  const me = await getMe();
  if (!me) redirect(`/${locale}/sign-in`);
  if (!me.organizations.length) redirect(`/${locale}/welcome`);
  const ctx = await currentContext(me);
  const org = ctx.org!;
  const shell = {
    orgName: nameOf(org, locale),
    locations: ctx.locations.filter((x) => x.org.id === org.id).map((x) => ({ id: x.loc.id, label: nameOf(x.loc, locale), status: x.loc.status, paused: x.loc.paused })),
    currentLocationId: ctx.location?.id,
    user: { name: me.user.name, email: me.user.email, staff: me.user.staff },
    canAddLocation: org.role !== 'editor',
  };
  return { me, ctx, org, shell };
}
