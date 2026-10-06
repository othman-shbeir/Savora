// Shapes returned by the API's workspace endpoints, shared so the web app and API stay in step.

export type LocationStatus = 'draft' | 'live';
export type Plan = 'starter' | 'growth' | 'multi_location';
export type Role = 'owner' | 'admin' | 'editor';

export type LocationSummary = {
  id: string;
  nameEn: string;
  nameAr: string | null;
  slug: string;
  status: LocationStatus;
  currency: string;
  /** Past the plan's location limit: kept, but not shown to guests until an upgrade. */
  paused: boolean;
};

export type BrandSummary = {
  id: string;
  nameEn: string;
  nameAr: string | null;
  taglineEn: string | null;
  taglineAr: string | null;
  locations: LocationSummary[];
};

export type OrganizationSummary = {
  id: string;
  nameEn: string;
  nameAr: string | null;
  plan: Plan;
  role: Role;
  brands: BrandSummary[];
};

export type Me = {
  user: { id: string; email: string; name: string | null; locale: string; staff: boolean };
  organizations: OrganizationSummary[];
};

export type Overview = {
  organization: OrganizationSummary;
  itemsByLocation: Record<string, number>;
  /** All-time menu opens per location. */
  scansByLocation: Record<string, number>;
  stats: { locations: number; live: number; menuItems: number; totalScans: number };
};

/** Fills {placeholders} in a dictionary string: fill('{n} scans', { n: 3 }) -> '3 scans'. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
