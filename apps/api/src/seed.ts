import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { schema, type Db } from '@savora/db';
import { localDate, localHour, snapshotOf, weekdayOf } from '@savora/shared';
import { and, eq, max, sql } from 'drizzle-orm';
import { nextInvoiceNumber } from './lib/billing';
import { processImage, type MediaStore } from './lib/media';
import { uniqueSlug } from './lib/slug';
import { loadCategories } from './routes/menu';

export const DEMO_EMAIL = 'nadia@saltandstem.co';

/** Development data matching the designs: Nadia owns Salt & Stem Group with three branches.
 *  Runs only when SEED_DEMO=1 and the demo user does not exist yet. */
export async function seedDemo(db: Db) {
  const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, DEMO_EMAIL)).limit(1);
  if (exists) return false;
  await db.transaction(async (tx) => {
    const [user] = await tx.insert(schema.users).values({ email: DEMO_EMAIL, name: 'Nadia' }).returning();
    const [org] = await tx.insert(schema.organizations).values({ nameEn: 'Salt & Stem Group', nameAr: 'مجموعة سولت آند ستيم' }).returning();
    await tx.insert(schema.memberships).values({ organizationId: org!.id, userId: user!.id, role: 'owner' });
    const [brand] = await tx
      .insert(schema.brands)
      .values({ organizationId: org!.id, nameEn: 'Salt & Stem', nameAr: 'سولت آند ستيم', taglineEn: 'Good coffee, slow mornings.', taglineAr: 'قهوة جيدة، صباحات هادئة.' })
      .returning();
    const taken = async (s: string) =>
      Boolean((await tx.select({ id: schema.locations.id }).from(schema.locations).where(sql`lower(${schema.locations.slug}) = ${s}`).limit(1))[0]);
    const branches = [
      { nameEn: 'Ramallah counter', nameAr: 'فرع رام الله', slug: 'saltandstem', status: 'live' as const },
      { nameEn: 'Old City kitchen', nameAr: 'مطبخ البلدة القديمة', slug: 'saltandstem-oldcity', status: 'live' as const },
      { nameEn: 'Airport kiosk', nameAr: 'كشك المطار', slug: 'saltandstem-airport', status: 'draft' as const },
    ];
    // Links must stay unique even if someone already registered a matching business name.
    for (const b of branches) {
      await tx.insert(schema.locations).values({ ...b, organizationId: org!.id, brandId: brand!.id, slug: await uniqueSlug(b.slug, taken) });
    }
  });
  return true;
}

const MENU = [
  {
    nameEn: 'Coffee', nameAr: 'قهوة',
    items: [
      { nameEn: 'Cardamom Latte', nameAr: 'لاتيه بالهيل', descriptionEn: 'Espresso, steamed milk, green cardamom, orange zest', descriptionAr: 'إسبريسو، حليب مبخر، هيل أخضر، قشر برتقال', priceMinor: 1800, photo: 'cardamom-latte' },
      { nameEn: 'Spanish Latte', nameAr: 'لاتيه إسباني', descriptionEn: 'Cold brew, milk, sweet condensed milk', descriptionAr: 'قهوة باردة، حليب، حليب مكثف محلى', priceMinor: 2200, photo: 'spanish-latte' },
      // No Arabic name on purpose, so the demo shows the health check at work.
      { nameEn: 'Flat White', nameAr: null, descriptionEn: 'Double ristretto, velvety milk', descriptionAr: null, priceMinor: 1500 },
    ],
  },
  {
    nameEn: 'Bites', nameAr: 'لقيمات',
    items: [
      { nameEn: 'Labneh Toast', nameAr: 'توست لبنة', descriptionEn: "Whipped labneh, za'atar, olive oil, sourdough", descriptionAr: 'لبنة مخفوقة، زعتر، زيت زيتون، خبز العجين المخمر', priceMinor: 2500, photo: 'labneh-toast' },
      { nameEn: "Za'atar Croissant", nameAr: 'كرواسون زعتر', descriptionEn: "Butter croissant, za'atar, olive oil", descriptionAr: 'كرواسون بالزبدة، زعتر، زيت زيتون', priceMinor: 1600 },
    ],
  },
  {
    nameEn: 'Cold', nameAr: 'مشروبات باردة',
    items: [{ nameEn: 'Iced Hibiscus', nameAr: 'كركديه مثلج', descriptionEn: 'Hibiscus, orange blossom, mint', descriptionAr: 'كركديه، ماء زهر، نعناع', priceMinor: 1900 }],
  },
];

/** Gives the demo's Ramallah counter the menu from the designs: published as version 1, then one
 *  item marked sold out so the editor shows an unpublished change. Skips a location that has a menu. */
export async function seedDemoMenu(db: Db, store: MediaStore) {
  const [loc] = await db
    .select()
    .from(schema.locations)
    .innerJoin(schema.memberships, eq(schema.memberships.organizationId, schema.locations.organizationId))
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(and(eq(schema.users.email, DEMO_EMAIL), eq(schema.locations.nameEn, 'Ramallah counter')))
    .limit(1);
  if (!loc) return false;
  const location = loc.locations;
  const [has] = await db.select({ id: schema.menuCategories.id }).from(schema.menuCategories).where(eq(schema.menuCategories.locationId, location.id)).limit(1);
  if (has) return false;

  const photoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../seed-photos');
  const photoIds: Record<string, string> = {};
  for (const name of new Set(MENU.flatMap((c) => c.items.map((i) => ('photo' in i ? i.photo : undefined)).filter(Boolean) as string[]))) {
    const img = await processImage(await readFile(path.join(photoDir, `${name}.jpg`)));
    const [m] = await db.insert(schema.media).values({ organizationId: location.organizationId, width: img.width, height: img.height, bytes: img.full.length }).returning();
    await store.put(m!.id, 'full', img.full);
    await store.put(m!.id, 'thumb', img.thumb);
    photoIds[name] = m!.id;
  }

  await db.transaction(async (tx) => {
    for (const [ci, c] of MENU.entries()) {
      const [cat] = await tx.insert(schema.menuCategories).values({ locationId: location.id, nameEn: c.nameEn, nameAr: c.nameAr, position: ci }).returning();
      await tx.insert(schema.menuItems).values(
        c.items.map(({ photo, ...i }: (typeof c.items)[number] & { photo?: string }, ii) => ({ ...i, locationId: location.id, categoryId: cat!.id, position: ii, photoId: photo ? photoIds[photo] : null })),
      );
    }
    const content = snapshotOf(await loadCategories(tx, location.id), location.currency);
    const itemCount = content.categories.reduce((n, c) => n + c.items.length, 0);
    await tx.insert(schema.menuVersions).values({ locationId: location.id, version: 1, note: 'Opening menu', content, itemCount, publishedBy: loc.users.id });
    await tx.update(schema.menuItems).set({ available: false }).where(and(eq(schema.menuItems.locationId, location.id), eq(schema.menuItems.nameEn, "Za'atar Croissant")));
  });
  return true;
}

/** Gives the demo's Ramallah counter the café photo as its guest-menu cover, once. */
export async function seedDemoCover(db: Db, store: MediaStore) {
  const [loc] = await db
    .select({ id: schema.locations.id, organizationId: schema.locations.organizationId, coverPhotoId: schema.locations.coverPhotoId })
    .from(schema.locations)
    .innerJoin(schema.memberships, eq(schema.memberships.organizationId, schema.locations.organizationId))
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(and(eq(schema.users.email, DEMO_EMAIL), eq(schema.locations.nameEn, 'Ramallah counter')))
    .limit(1);
  if (!loc || loc.coverPhotoId) return false;
  const photoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../seed-photos');
  const img = await processImage(await readFile(path.join(photoDir, 'cafe-room.jpg')));
  const [m] = await db.insert(schema.media).values({ organizationId: loc.organizationId, width: img.width, height: img.height, bytes: img.full.length }).returning();
  await store.put(m!.id, 'full', img.full);
  await store.put(m!.id, 'thumb', img.thumb);
  await db.update(schema.locations).set({ coverPhotoId: m!.id }).where(eq(schema.locations.id, loc.id));
  return true;
}

// Café rhythm by local hour (closed overnight, morning and evening peaks) and by weekday
// (Sunday … Saturday; Friday busiest, as in the designs).
const HOUR_WEIGHT = [0, 0, 0, 0, 0, 0, 0, 0.3, 1, 1.3, 1, 0.8, 0.9, 1.1, 0.8, 0.6, 0.7, 0.9, 1.1, 1.2, 1, 0.7, 0.4, 0.1];
const DAY_WEIGHT = [1, 0.6, 0.8, 1, 0.9, 1.45, 1.3];
const HOUR_SUM = HOUR_WEIGHT.reduce((a, b) => a + b, 0);

/** Small deterministic random numbers, so the demo looks the same on every machine. */
function seeded(text: string) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Gives the demo's live branches ~60 days of believable scan history, up to the current hour.
 *  Runs at every start and only fills hours not yet covered, so the demo never goes stale. */
export async function seedDemoScans(db: Db, now = new Date()) {
  const branches = await db
    .select({ id: schema.locations.id, nameEn: schema.locations.nameEn, timezone: schema.locations.timezone })
    .from(schema.locations)
    .innerJoin(schema.memberships, eq(schema.memberships.organizationId, schema.locations.organizationId))
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(and(eq(schema.users.email, DEMO_EMAIL), eq(schema.locations.status, 'live')));
  const base: Record<string, number> = { 'Ramallah counter': 31, 'Old City kitchen': 18 };
  const current = Math.floor(now.getTime() / 3_600_000) * 3_600_000;
  let added = 0;
  for (const b of branches) {
    const daily = base[b.nameEn];
    if (!daily) continue;
    const [last] = await db.select({ at: max(schema.scanHourly.hour) }).from(schema.scanHourly).where(eq(schema.scanHourly.locationId, b.id));
    const from = last?.at ? new Date(last.at).getTime() + 3_600_000 : current - 60 * 86_400_000;
    const rows: Array<typeof schema.scanHourly.$inferInsert> = [];
    for (let t = from; t < current; t += 3_600_000) {
      const at = new Date(t);
      const date = localDate(at, b.timezone);
      const day = seeded(`${b.id}|${date}`)() * 0.3 + 0.85; // the same factor for every hour of a day
      const rand = seeded(`${b.id}|${t}`);
      const expected = (daily * DAY_WEIGHT[weekdayOf(date)]! * day * HOUR_WEIGHT[localHour(at, b.timezone)]!) / HOUR_SUM;
      const scans = Math.floor(expected + rand());
      if (!scans) continue;
      let qr = 0;
      let ar = 0;
      for (let i = 0; i < scans; i++) {
        if (rand() < 0.78) qr++;
        if (rand() < 0.62) ar++;
      }
      rows.push({ locationId: b.id, hour: at, scans, qr, ar });
    }
    for (let i = 0; i < rows.length; i += 500) await db.insert(schema.scanHourly).values(rows.slice(i, i + 500)).onConflictDoNothing();
    added += rows.length;
  }
  return added;
}

/** Fills in the demo branches' settings as the designs show them: the Ramallah counter fully set
 *  up except its logo and order link (so the checklist has something to suggest), and a pin for
 *  the Old City kitchen. Only touches branches that have no pin yet. */
export async function seedDemoSettings(db: Db) {
  const branches = await db
    .select({ id: schema.locations.id, nameEn: schema.locations.nameEn, lat: schema.locations.lat })
    .from(schema.locations)
    .innerJoin(schema.memberships, eq(schema.memberships.organizationId, schema.locations.organizationId))
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.users.email, DEMO_EMAIL));
  const day = (from: string, to: string) => ({ open: true, from, to });
  let changed = 0;
  for (const b of branches) {
    if (b.lat !== null) continue;
    if (b.nameEn === 'Ramallah counter') {
      await db
        .update(schema.locations)
        .set({
          addressEn: 'Rukab St, near Al-Manara Sq.',
          addressAr: 'شارع ركب، قرب دوار المنارة',
          building: 'Ground floor, shop 4',
          city: 'Ramallah',
          lat: 31.9074,
          lng: 35.2094,
          deliveryRadiusM: 800,
          showMap: true,
          // Sunday first: weekdays 07–23, Thursday until midnight, Friday from 09.
          hours: [day('07:00', '23:00'), day('07:00', '23:00'), day('07:00', '23:00'), day('07:00', '23:00'), day('07:00', '00:00'), day('09:00', '23:00'), day('07:00', '23:00')],
          phone: '+970 59 555 0142',
          phoneIsWhatsapp: true,
        })
        .where(eq(schema.locations.id, b.id));
      changed++;
    } else if (b.nameEn === 'Old City kitchen') {
      await db.update(schema.locations).set({ addressEn: 'Old City, Ramallah', addressAr: 'البلدة القديمة، رام الله', city: 'Ramallah', lat: 31.8985, lng: 35.1935 }).where(eq(schema.locations.id, b.id));
      changed++;
    }
  }
  return changed;
}

/** The demo group runs three branches, so it is on Multi-location: paid through mid-next-month,
 *  with two earlier invoices in its billing history. Runs once. */
export async function seedDemoBilling(db: Db, now = new Date()) {
  const [org] = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .innerJoin(schema.memberships, eq(schema.memberships.organizationId, schema.organizations.id))
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.users.email, DEMO_EMAIL))
    .limit(1);
  if (!org) return false;
  const [has] = await db.select({ id: schema.subscriptions.organizationId }).from(schema.subscriptions).where(eq(schema.subscriptions.organizationId, org.id)).limit(1);
  if (has) return false;
  const periodEnd = new Date(now.getTime() + 18 * 86_400_000);
  const day = 86_400_000;
  await db.transaction(async (tx) => {
    await tx.update(schema.organizations).set({ plan: 'multi_location' }).where(eq(schema.organizations.id, org.id));
    await tx.insert(schema.subscriptions).values({ organizationId: org.id, plan: 'multi_location', status: 'active', provider: 'manual', periodEnd, updatedAt: now });
    for (const [i, start] of [new Date(periodEnd.getTime() - 61 * day), new Date(periodEnd.getTime() - 30 * day)].entries()) {
      const paidAt = new Date(start.getTime() + day);
      await tx.insert(schema.invoices).values({
        organizationId: org.id,
        number: await nextInvoiceNumber(tx, paidAt),
        plan: 'multi_location',
        locations: 3,
        amountCents: 2900,
        periodStart: start,
        periodEnd: new Date(start.getTime() + (i ? 30 : 31) * day),
        status: 'paid',
        method: 'bank_transfer',
        paidAt,
        createdAt: start,
      });
    }
  });
  return true;
}
