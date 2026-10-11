import { createDb, schema, type Db } from '@savora/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadEnv } from './env';
import { AiRefused, type AiProvider } from './lib/ai';
import type { MediaStore } from './lib/media';
import { smtpMailer, type Mail } from './mailer';
import { purgeScanEvents } from './routes/scans';
import { DEMO_EMAIL, seedDemo, seedDemoBilling, seedDemoMenu, seedDemoScans, seedDemoSettings } from './seed';

// These tests check the paid-plan rules, so plans are on whatever the local .env says.
process.env.NEXT_PUBLIC_PLANS_ENABLED = 'true';

// Real Postgres (PGlite, in memory) with the real migrations: no mocks between the API and SQL.
const env = loadEnv({ DATABASE_URL: 'pglite://memory', SESSION_SECRET: 'test-secret-1234567890', NODE_ENV: 'test', WEB_ORIGIN: 'http://web.test', SAVORA_STAFF_EMAILS: 'staff@savora.test', BILLING_BANK_NAME: 'Bank of Palestine', BILLING_IBAN: 'PS00 TEST 0000 0000 0000 0000 0000 0' });
let app: FastifyInstance;
let db: Db;
let close: () => Promise<void>;
const outbox: Mail[] = [];
const files = new Map<string, Buffer>();
/** Set to move the API's clock in scan tests; null means real time. */
let fakeNow: Date | null = null;
const store: MediaStore = { put: async (id, size, data) => void files.set(`${id}-${size}`, data), get: async (id, size) => files.get(`${id}-${size}`) ?? null };

beforeAll(async () => {
  const conn = createDb(env.DATABASE_URL);
  await conn.migrate();
  db = conn.db;
  close = conn.close;
  app = await buildApp(env, db, { mailer: { send: async (m) => void outbox.push(m) }, store, clock: () => fakeNow ?? new Date(), geocode: async (q) => (q.includes('Rukab') ? [{ label: 'Rukab St, Ramallah', lat: 31.9074, lng: 35.2094 }] : []) });
});
afterAll(async () => {
  await app.close();
  await close();
});

/** Runs the email sign-in flow and returns the session cookie header. */
async function signIn(email: string, locale = 'en') {
  const start = await app.inject({ method: 'POST', url: '/auth/email/start', payload: { email, locale } });
  expect(start.statusCode).toBe(200);
  const mail = outbox.at(-1)!;
  const token = /#token=([\w-]+)/.exec(mail.text)![1]!;
  const verify = await app.inject({ method: 'POST', url: '/auth/email/verify', payload: { token } });
  expect(verify.statusCode).toBe(200);
  const cookie = verify.cookies.find((c) => c.name === 'savora_session')!;
  return { cookie: `savora_session=${cookie.value}`, token, mail, body: verify.json() };
}

describe('health', () => {
  it('reports the database as up', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.json()).toMatchObject({ ok: true, db: 'up', version: 'dev' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('email sign-in', () => {
  it('rejects an invalid email', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/email/start', payload: { email: 'nadia@' } });
    expect(res.statusCode).toBe(400);
  });

  it('sends a link in the visitor\'s language and never exposes it outside development', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/email/start', payload: { email: 'Sara@Example.com', locale: 'ar' } });
    expect(res.json()).toEqual({ ok: true });
    const mail = outbox.at(-1)!;
    expect(mail.to).toBe('sara@example.com');
    expect(mail.subject).toContain('سافورا');
    expect(mail.text).toContain('http://web.test/ar/auth/verify#token=');
  });

  it('signs in with the link exactly once', async () => {
    const { token, body } = await signIn('owner@cafe.test');
    expect(body.isNew).toBe(true);
    const again = await app.inject({ method: 'POST', url: '/auth/email/verify', payload: { token } });
    expect(again.statusCode).toBe(400);
    expect(again.json()).toEqual({ error: 'link_expired' });
  });

  it('limits sign-in links per email, not per network', async () => {
    const ask = (email: string) => app.inject({ method: 'POST', url: '/auth/email/start', payload: { email } });
    for (let i = 0; i < 5; i++) expect((await ask('flood@cafe.test')).statusCode).toBe(200);
    expect((await ask('flood@cafe.test')).statusCode).toBe(429);
    expect((await ask('neighbour@cafe.test')).statusCode).toBe(200);
  });

  it('only advertises Google when it is configured', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/providers' });
    expect(res.json()).toEqual({ email: true, google: false });
    // The button still shows; without credentials it leads back to sign-in with an explanation.
    const start = await app.inject({ method: 'GET', url: '/auth/google/start?locale=ar' });
    expect(start.statusCode).toBe(302);
    expect(start.headers.location).toBe('http://web.test/ar/sign-in?error=google_setup');
    expect((await app.inject({ method: 'GET', url: '/auth/google/callback' })).statusCode).toBe(404);
  });
});

describe('workspace', () => {
  it('requires a session', async () => {
    expect((await app.inject({ method: 'GET', url: '/me' })).statusCode).toBe(401);
  });

  it('creates an organization with its first location and a unique link', async () => {
    const { cookie } = await signIn('first@cafe.test');
    const me = await app.inject({ method: 'GET', url: '/me', headers: { cookie } });
    expect(me.json().organizations).toEqual([]);

    const payload = { businessName: 'Salt & Stem', businessNameAr: 'سولت آند ستيم', locationName: 'Ramallah counter' };
    const created = await app.inject({ method: 'POST', url: '/organizations', headers: { cookie }, payload });
    expect(created.statusCode).toBe(201);
    expect(created.json().slug).toBe('saltandstem');

    const second = await app.inject({ method: 'POST', url: '/organizations', headers: { cookie }, payload });
    expect(second.json().slug).toBe('saltandstem-2');

    const after = await app.inject({ method: 'GET', url: '/me', headers: { cookie } });
    const [org] = after.json().organizations;
    expect(org.role).toBe('owner');
    expect(org.brands[0].locations[0]).toMatchObject({ nameEn: 'Ramallah counter', status: 'draft', currency: 'ILS' });
  });

  it('validates onboarding input', async () => {
    const { cookie } = await signIn('validate@cafe.test');
    const res = await app.inject({ method: 'POST', url: '/organizations', headers: { cookie }, payload: { businessName: 'X' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues).toEqual(expect.arrayContaining(['businessName', 'locationName']));
  });

  it('keeps organizations private to their members', async () => {
    const owner = await signIn('private-owner@cafe.test');
    const { organizationId } = (
      await app.inject({ method: 'POST', url: '/organizations', headers: { cookie: owner.cookie }, payload: { businessName: 'Private Café', locationName: 'Main' } })
    ).json();
    const ownView = await app.inject({ method: 'GET', url: `/organizations/${organizationId}/overview`, headers: { cookie: owner.cookie } });
    expect(ownView.json().stats).toEqual({ locations: 1, live: 0, menuItems: 0, totalScans: 0 });

    const stranger = await signIn('stranger@cafe.test');
    const res = await app.inject({ method: 'GET', url: `/organizations/${organizationId}/overview`, headers: { cookie: stranger.cookie } });
    expect(res.statusCode).toBe(404);
  });

  it('ends the session on sign out', async () => {
    const { cookie } = await signIn('leaving@cafe.test');
    await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie } });
    expect((await app.inject({ method: 'GET', url: '/me', headers: { cookie } })).statusCode).toBe(401);
  });
});

describe('demo seed', () => {
  it('creates Salt & Stem Group once', async () => {
    expect(await seedDemo(db)).toBe(true);
    expect(await seedDemo(db)).toBe(false);
    const { cookie } = await signIn(DEMO_EMAIL);
    const overview = (await app.inject({ method: 'GET', url: '/me', headers: { cookie } })).json();
    const org = overview.organizations[0];
    const id = org.id;
    const stats = (await app.inject({ method: 'GET', url: `/organizations/${id}/overview`, headers: { cookie } })).json().stats;
    expect(stats).toMatchObject({ locations: 3, live: 2 });
  });

  it('gives the Ramallah counter a published menu with one unpublished change', async () => {
    expect(await seedDemoMenu(db, store)).toBe(true);
    expect(await seedDemoMenu(db, store)).toBe(false);
    const { cookie } = await signIn(DEMO_EMAIL);
    const me = (await app.inject({ method: 'GET', url: '/me', headers: { cookie } })).json();
    const ramallah = me.organizations[0].brands[0].locations.find((l: { nameEn: string }) => l.nameEn === 'Ramallah counter');
    const menu = (await app.inject({ method: 'GET', url: `/locations/${ramallah.id}/menu`, headers: { cookie } })).json();
    expect(menu.categories.map((c: { nameEn: string }) => c.nameEn)).toEqual(['Coffee', 'Bites', 'Cold']);
    expect(menu.published).toMatchObject({ version: 1, itemCount: 6 });
    expect(menu.hasChanges).toBe(true);
    expect(menu.categories[0].items[0].photo.url).toMatch(/^\/api\/media\/.+\/full\.webp$/);
  });
});

/** Moves an organization to a plan directly, as if a payment had been confirmed. */
const setPlan = (orgId: string, plan: 'starter' | 'growth' | 'multi_location') => db.update(schema.organizations).set({ plan }).where(eq(schema.organizations.id, orgId));

/** A signed-in owner with a fresh organization and helpers bound to its first location. */
async function ownerWithLocation(email: string) {
  const { cookie } = await signIn(email);
  const created = (await app.inject({ method: 'POST', url: '/organizations', headers: { cookie }, payload: { businessName: 'Menu Café', locationName: 'Main' } })).json();
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) => app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  const menu = async () => (await call('GET', `/locations/${created.locationId}/menu`)).json();
  return { cookie, call, menu, orgId: created.organizationId as string, locationId: created.locationId as string };
}

/** multipart/form-data with one file field, as a browser sends it. */
function multipart(filename: string, type: string, data: Buffer) {
  const boundary = '----savora' + Math.random().toString(16).slice(2);
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

type Named = { nameEn: string; items: unknown[] };

describe('menu', () => {
  it('builds a draft with categories and items in order', async () => {
    const o = await ownerWithLocation('menu-build@cafe.test');
    const empty = await o.menu();
    expect(empty).toMatchObject({ categories: [], published: null, hasChanges: false });
    expect(empty.health.find((h: { key: string }) => h.key === 'items').ok).toBe(false);

    const coffee = (await o.call('POST', `/locations/${o.locationId}/categories`, { nameEn: 'Coffee', nameAr: 'قهوة' })).json().id;
    const latte = await o.call('POST', `/locations/${o.locationId}/items`, { categoryId: coffee, nameEn: 'Cardamom Latte', nameAr: 'لاتيه بالهيل', priceMinor: 1800 });
    expect(latte.statusCode).toBe(201);
    await o.call('POST', `/locations/${o.locationId}/items`, { categoryId: coffee, nameEn: 'Flat White', priceMinor: 1500 });

    const m = await o.menu();
    expect(m.categories[0].items.map((i: { nameEn: string }) => i.nameEn)).toEqual(['Cardamom Latte', 'Flat White']);
    expect(m.hasChanges).toBe(true);
    expect(m.health.find((h: { key: string }) => h.key === 'names')).toMatchObject({ ok: false, count: 1, examples: ['Flat White'] });

    await o.call('POST', `/items/${m.categories[0].items[1].id}/move`, { direction: 'up' });
    expect((await o.menu()).categories[0].items[0].nameEn).toBe('Flat White');
    // Already first: nothing changes.
    await o.call('POST', `/categories/${coffee}/move`, { direction: 'up' });
    expect((await o.menu()).categories[0].id).toBe(coffee);
  });

  it('validates items and keeps them inside their own location', async () => {
    const o = await ownerWithLocation('menu-validate@cafe.test');
    const other = await ownerWithLocation('menu-other@cafe.test');
    const theirCategory = (await other.call('POST', `/locations/${other.locationId}/categories`, { nameEn: 'Theirs' })).json().id;
    expect((await o.call('POST', `/locations/${o.locationId}/items`, { categoryId: theirCategory, nameEn: 'Sneaky', priceMinor: 100 })).statusCode).toBe(400);

    const mine = (await o.call('POST', `/locations/${o.locationId}/categories`, { nameEn: 'Mine' })).json().id;
    expect((await o.call('POST', `/locations/${o.locationId}/items`, { categoryId: mine, nameEn: ' ', priceMinor: 100 })).statusCode).toBe(400);
    expect((await o.call('POST', `/locations/${o.locationId}/items`, { categoryId: mine, nameEn: 'Latte', priceMinor: -5 })).statusCode).toBe(400);
  });

  it("hides one owner's menu from everyone else", async () => {
    const o = await ownerWithLocation('menu-private@cafe.test');
    const cat = (await o.call('POST', `/locations/${o.locationId}/categories`, { nameEn: 'Coffee' })).json().id;
    const item = (await o.call('POST', `/locations/${o.locationId}/items`, { categoryId: cat, nameEn: 'Latte', priceMinor: 1800 })).json().id;

    const stranger = await ownerWithLocation('menu-stranger@cafe.test');
    expect((await stranger.call('GET', `/locations/${o.locationId}/menu`)).statusCode).toBe(404);
    expect((await stranger.call('PATCH', `/items/${item}`, { priceMinor: 1 })).statusCode).toBe(404);
    expect((await stranger.call('DELETE', `/categories/${cat}`)).statusCode).toBe(404);
    expect((await stranger.call('POST', `/locations/${o.locationId}/publish`, {})).statusCode).toBe(404);
    expect((await o.menu()).categories[0].items[0].priceMinor).toBe(1800);
  });

  it('updates an item partly, moves it between categories and deletes a category with its items', async () => {
    const o = await ownerWithLocation('menu-edit@cafe.test');
    const a = (await o.call('POST', `/locations/${o.locationId}/categories`, { nameEn: 'Coffee' })).json().id;
    const b = (await o.call('POST', `/locations/${o.locationId}/categories`, { nameEn: 'Cold' })).json().id;
    const item = (await o.call('POST', `/locations/${o.locationId}/items`, { categoryId: a, nameEn: 'Latte', priceMinor: 1800 })).json().id;

    expect((await o.call('PATCH', `/items/${item}`, { available: false })).statusCode).toBe(200);
    let m = await o.menu();
    expect(m.categories[0].items[0]).toMatchObject({ available: false, nameEn: 'Latte', priceMinor: 1800 });

    await o.call('PATCH', `/items/${item}`, { categoryId: b, nameAr: 'لاتيه' });
    m = await o.menu();
    expect(m.categories[0].items).toHaveLength(0);
    expect(m.categories[1].items[0]).toMatchObject({ nameAr: 'لاتيه', available: false });

    await o.call('DELETE', `/categories/${b}`);
    m = await o.menu();
    expect(m.categories.map((c: Named) => c.nameEn)).toEqual(['Coffee']);
  });

  it('imports a pasted menu, joining categories that already exist', async () => {
    const o = await ownerWithLocation('menu-import@cafe.test');
    await o.call('POST', `/locations/${o.locationId}/categories`, { nameEn: 'Coffee' });
    const blank = { nameAr: null, descriptionEn: null, descriptionAr: null };
    const res = await o.call('POST', `/locations/${o.locationId}/import`, {
      categories: [
        { nameEn: 'coffee', nameAr: null, items: [{ ...blank, nameEn: 'Latte', priceMinor: 1800 }] },
        { nameEn: 'Bites', nameAr: 'لقيمات', items: [{ ...blank, nameEn: 'Toast', priceMinor: 2500 }] },
      ],
    });
    expect(res.json()).toEqual({ items: 2 });
    expect((await o.menu()).categories.map((c: Named) => [c.nameEn, c.items.length])).toEqual([
      ['Coffee', 1],
      ['Bites', 1],
    ]);
  });

  it('publishes numbered versions only when something changed for guests', async () => {
    const o = await ownerWithLocation('menu-publish@cafe.test');
    expect((await o.call('POST', `/locations/${o.locationId}/publish`, {})).json()).toEqual({ error: 'empty_menu' });

    const cat = (await o.call('POST', `/locations/${o.locationId}/categories`, { nameEn: 'Coffee' })).json().id;
    const item = (await o.call('POST', `/locations/${o.locationId}/items`, { categoryId: cat, nameEn: 'Latte', priceMinor: 1800 })).json().id;
    const first = await o.call('POST', `/locations/${o.locationId}/publish`, { note: 'Opening menu' });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toEqual({ version: 1, itemCount: 1 });

    expect(await o.menu()).toMatchObject({ hasChanges: false, published: { version: 1, note: 'Opening menu', itemCount: 1 }, location: { status: 'live' } });
    expect((await o.call('POST', `/locations/${o.locationId}/publish`, {})).json()).toEqual({ error: 'no_changes' });

    await o.call('PATCH', `/items/${item}`, { priceMinor: 1900 });
    expect((await o.menu()).hasChanges).toBe(true);
    expect((await o.call('POST', `/locations/${o.locationId}/publish`, {})).json()).toEqual({ version: 2, itemCount: 1 });

    // Hiding and re-showing an item lands back on what guests already see.
    await o.call('PATCH', `/items/${item}`, { available: false });
    await o.call('PATCH', `/items/${item}`, { available: true });
    expect((await o.menu()).hasChanges).toBe(false);

    const overview = (await o.call('GET', `/organizations/${o.orgId}/overview`)).json();
    expect(overview.stats).toMatchObject({ live: 1, menuItems: 1 });
    expect(overview.itemsByLocation[o.locationId]).toBe(1);
  });

  it('stores dish photos as WebP and only lets the same organization use them', async () => {
    const o = await ownerWithLocation('menu-photo@cafe.test');
    const sharp = (await import('sharp')).default;
    const jpeg = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#c0392b' } }).jpeg().toBuffer();
    const upload = (cookie: string, body: ReturnType<typeof multipart>) =>
      app.inject({ method: 'POST', url: `/organizations/${o.orgId}/media`, payload: body.payload, headers: { ...body.headers, cookie } });

    const res = await upload(o.cookie, multipart('latte.jpg', 'image/jpeg', jpeg));
    expect(res.statusCode).toBe(201);
    const photo = res.json();
    expect(photo.url).toBe(`/api/media/${photo.id}/full.webp`);

    const full = await app.inject({ method: 'GET', url: `/media/${photo.id}/full.webp` });
    expect(full.headers['content-type']).toBe('image/webp');
    const meta = await sharp(full.rawPayload).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 1600, 1067]);
    const thumb = await sharp((await app.inject({ method: 'GET', url: `/media/${photo.id}/thumb.webp` })).rawPayload).metadata();
    expect([thumb.width, thumb.height]).toEqual([480, 480]);

    expect((await upload(o.cookie, multipart('menu.jpg', 'image/jpeg', Buffer.from('not really a picture')))).statusCode).toBe(415);
    const stranger = await signIn('media-stranger@cafe.test');
    expect((await upload(stranger.cookie, multipart('latte.jpg', 'image/jpeg', jpeg))).statusCode).toBe(404);

    const cat = (await o.call('POST', `/locations/${o.locationId}/categories`, { nameEn: 'Coffee' })).json().id;
    expect((await o.call('POST', `/locations/${o.locationId}/items`, { categoryId: cat, nameEn: 'Latte', priceMinor: 1800, photoId: photo.id })).statusCode).toBe(201);
    expect((await o.menu()).categories[0].items[0].photo).toEqual(photo);

    const other = await ownerWithLocation('menu-photo-thief@cafe.test');
    const theirs = (await other.call('POST', `/locations/${other.locationId}/categories`, { nameEn: 'Coffee' })).json().id;
    expect((await other.call('POST', `/locations/${other.locationId}/items`, { categoryId: theirs, nameEn: 'Latte', priceMinor: 1800, photoId: photo.id })).statusCode).toBe(400);
  });
});

describe('public guest menu', () => {
  const publicMenu = (slug: string) => app.inject({ method: 'GET', url: `/public/menu/${slug}` });

  it('answers 404 for unknown or malformed links', async () => {
    expect((await publicMenu('no-such-place')).statusCode).toBe(404);
    expect((await publicMenu('..%2Fetc')).statusCode).toBe(404);
  });

  it('says "not published" for a place without a published menu, without leaking the draft', async () => {
    const o = await ownerWithLocation('public-draft@cafe.test');
    const slug = (await o.menu()).location.slug;
    const cat = (await o.call('POST', `/locations/${o.locationId}/categories`, { nameEn: 'Coffee' })).json().id;
    await o.call('POST', `/locations/${o.locationId}/items`, { categoryId: cat, nameEn: 'Secret Latte', priceMinor: 1800 });
    const res = await publicMenu(slug);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'not_published', name: { en: 'Menu Café' } });
    expect(res.body).not.toContain('Secret Latte');
  });

  it('serves only the published version, without signing in, whatever the link casing', async () => {
    const o = await ownerWithLocation('public-live@cafe.test');
    const slug = (await o.menu()).location.slug;
    const cat = (await o.call('POST', `/locations/${o.locationId}/categories`, { nameEn: 'Coffee', nameAr: 'قهوة' })).json().id;
    const latte = (await o.call('POST', `/locations/${o.locationId}/items`, { categoryId: cat, nameEn: 'Latte', priceMinor: 1800 })).json().id;
    await o.call('POST', `/locations/${o.locationId}/items`, { categoryId: cat, nameEn: 'Sold out', priceMinor: 900, available: false });
    await o.call('POST', `/locations/${o.locationId}/publish`, {});

    // Draft edits after publishing stay private until the next publish.
    await o.call('PATCH', `/items/${latte}`, { priceMinor: 2500 });

    const res = await publicMenu(slug.toUpperCase());
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ slug, version: 1, brand: { nameEn: 'Menu Café' }, cover: null });
    expect(body.menu.categories).toHaveLength(1);
    expect(body.menu.categories[0].items.map((i: { nameEn: string; priceMinor: number }) => [i.nameEn, i.priceMinor])).toEqual([['Latte', 1800]]);
    expect(res.headers['cache-control']).toContain('s-maxage=30');
  });

  it('shows the demo cover photo', async () => {
    const { seedDemoCover } = await import('./seed');
    expect(await seedDemoCover(db, store)).toBe(true);
    expect(await seedDemoCover(db, store)).toBe(false);
    // An earlier test registered "Salt & Stem" first, so the demo's link may carry a suffix.
    const { cookie } = await signIn(DEMO_EMAIL);
    const me = (await app.inject({ method: 'GET', url: '/me', headers: { cookie } })).json();
    const ramallah = me.organizations[0].brands[0].locations.find((l: { nameEn: string }) => l.nameEn === 'Ramallah counter');
    const body = (await publicMenu(ramallah.slug)).json();
    expect(body.cover.url).toMatch(/^\/api\/media\/.+\/full\.webp$/);
    expect(body.menu.categories.map((c: { nameEn: string }) => c.nameEn)).toEqual(['Coffee', 'Bites', 'Cold']);
  });
});

describe('scan analytics', () => {
  const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
  const scan = (payload: object, opts: { ua?: string; ip?: string; cookie?: string } = {}) =>
    app.inject({
      method: 'POST',
      url: '/public/scan',
      payload,
      remoteAddress: opts.ip ?? '10.0.0.1',
      headers: { 'user-agent': opts.ua ?? PHONE, ...(opts.cookie ? { cookie: opts.cookie } : {}) },
    });

  /** An owner with a published one-dish menu; returns its link and helpers. */
  async function liveLocation(email: string) {
    const o = await ownerWithLocation(email);
    await setPlan(o.orgId, 'growth'); // the reports are a Growth feature
    const cat = (await o.call('POST', `/locations/${o.locationId}/categories`, { nameEn: 'Coffee' })).json().id;
    await o.call('POST', `/locations/${o.locationId}/items`, { categoryId: cat, nameEn: 'Latte', priceMinor: 1800 });
    await o.call('POST', `/locations/${o.locationId}/publish`, {});
    const slug = (await o.menu()).location.slug as string;
    const report = async (range = '7d') => (await o.call('GET', `/locations/${o.locationId}/analytics?range=${range}`)).json();
    return { ...o, slug, report };
  }

  it('counts a menu open once per visit, from the right source and language', async () => {
    const o = await liveLocation('scan-count@cafe.test');
    fakeNow = new Date('2026-10-09T07:10:00Z');
    expect((await scan({ slug: o.slug, source: 'qr', lang: 'ar' })).statusCode).toBe(204);
    // Reload and language switch within the same visit: still one.
    await scan({ slug: o.slug, source: 'qr', lang: 'en' });
    fakeNow = new Date('2026-10-09T07:30:00Z');
    await scan({ slug: o.slug.toUpperCase(), source: 'link', lang: 'en' });
    // Another phone at the same table.
    await scan({ slug: o.slug, source: 'link', lang: 'en' }, { ip: '10.0.0.2' });
    // The first guest comes back after lunch.
    fakeNow = new Date('2026-10-09T12:00:00Z');
    await scan({ slug: o.slug, source: 'qr', lang: 'ar' });

    const r = await o.report('today');
    expect(r.today.scans).toBe(3);
    expect(r.sources).toEqual({ qr: 2, link: 1 });
    expect(r.languages).toEqual({ ar: 2, en: 1 });
    expect(r.timezone).toBe('Asia/Hebron');
    fakeNow = null;
  });

  it('ignores bots, unknown links and unpublished places, without saying so', async () => {
    const o = await liveLocation('scan-ignore@cafe.test');
    const draft = await ownerWithLocation('scan-draft@cafe.test');
    await setPlan(draft.orgId, 'growth');
    const draftSlug = (await draft.menu()).location.slug;
    for (const res of [
      await scan({ slug: o.slug }, { ua: 'facebookexternalhit/1.1' }),
      await scan({ slug: o.slug }, { ua: '' }),
      await scan({ slug: 'no-such-place' }),
      await scan({ slug: draftSlug }),
      await scan({ slug: '../etc' }),
    ])
      expect(res.statusCode).toBe(204);
    expect((await o.report()).total).toBe(0);
    expect((await draft.call('GET', `/locations/${draft.locationId}/analytics`)).json().total).toBe(0);
  });

  it("doesn't count the team's own visits, but counts other signed-in people", async () => {
    const o = await liveLocation('scan-team@cafe.test');
    await scan({ slug: o.slug }, { cookie: o.cookie });
    const guest = await signIn('scan-guest@cafe.test');
    await scan({ slug: o.slug }, { cookie: guest.cookie, ip: '10.9.9.9' });
    expect((await o.report()).total).toBe(1);
  });

  it('stores no IP or user agent, and drops raw events after 48 hours while keeping counts', async () => {
    const o = await liveLocation('scan-privacy@cafe.test');
    fakeNow = new Date('2026-10-01T09:00:00Z');
    await scan({ slug: o.slug }, { ip: '203.0.113.77' });
    fakeNow = null;
    const events = await db.select().from(schema.scanEvents);
    expect(JSON.stringify(events)).not.toContain('203.0.113.77');
    expect(JSON.stringify(events)).not.toContain('iPhone');

    await purgeScanEvents(db, new Date('2026-10-03T09:00:01Z'));
    const left = await db.select().from(schema.scanEvents);
    expect(left.some((e) => e.occurredAt.toISOString() === '2026-10-01T09:00:00.000Z')).toBe(false);
    const report = (await o.call('GET', `/locations/${o.locationId}/analytics?range=7d`)).json();
    expect(report.allTime).toBe(1);
  });

  it('keeps reports private and validates the range', async () => {
    const o = await liveLocation('scan-private@cafe.test');
    const stranger = await ownerWithLocation('scan-stranger@cafe.test');
    await setPlan(stranger.orgId, 'growth');
    expect((await stranger.call('GET', `/locations/${o.locationId}/analytics`)).statusCode).toBe(404);
    expect((await o.call('GET', `/locations/${o.locationId}/analytics?range=year`)).statusCode).toBe(400);
  });

  it('adds scans to the overview', async () => {
    const o = await liveLocation('scan-overview@cafe.test');
    await scan({ slug: o.slug }, { ip: '10.1.1.1' });
    await scan({ slug: o.slug }, { ip: '10.1.1.2' });
    const overview = (await o.call('GET', `/organizations/${o.orgId}/overview`)).json();
    expect(overview.stats.totalScans).toBe(2);
    expect(overview.scansByLocation[o.locationId]).toBe(2);
  });

  it('gives the demo 60 days of history once, then only fills new hours', async () => {
    const now = new Date('2026-10-09T09:00:00Z');
    const first = await seedDemoScans(db, now);
    expect(first).toBeGreaterThan(60 * 10);
    expect(await seedDemoScans(db, now)).toBe(0);
    expect(await seedDemoScans(db, new Date('2026-10-09T12:00:00Z'))).toBeGreaterThan(0);
  });
});

describe('location settings', () => {
  const week = Array.from({ length: 7 }, () => ({ open: true, from: '07:00', to: '23:00' }));
  /** The settings form as the screen sends it: everything at once. */
  const form = (over: object = {}) => ({
    nameEn: 'Main', nameAr: 'الفرع الرئيسي', currency: 'ILS', timezone: 'Asia/Hebron',
    addressEn: 'Rukab St, near Al-Manara Sq.', addressAr: 'شارع ركب', building: 'Shop 4', city: 'Ramallah',
    lat: 31.9074, lng: 35.2094, deliveryRadiusM: 800, showMap: true, hours: week,
    closures: [{ date: '2026-12-25', note: 'Christmas' }, { date: '2026-10-20', note: null }, { date: '2026-12-25', note: 'dup' }],
    phone: '+970 59 555 0142', phoneIsWhatsapp: true, orderUrl: 'https://order.example.com/main', reservationUrl: '',
    coverPhotoId: null, logoPhotoId: null, ...over,
  });

  it('reads and saves everything guests see about a branch', async () => {
    const o = await ownerWithLocation('settings-save@cafe.test');
    const before = (await o.call('GET', `/locations/${o.locationId}/settings`)).json();
    expect(before).toMatchObject({ nameEn: 'Main', lat: null, hours: null, closures: [], showMap: true, timezone: 'Asia/Hebron', brand: { nameEn: 'Menu Café', branches: 1, logo: null } });

    const saved = await o.call('PATCH', `/locations/${o.locationId}/settings`, form());
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ city: 'Ramallah', lat: 31.9074, deliveryRadiusM: 800, phoneIsWhatsapp: true, reservationUrl: null });
    // Closures come back de-duplicated and in date order.
    expect(saved.json().closures).toEqual([{ date: '2026-10-20', note: null }, { date: '2026-12-25', note: 'Christmas' }]);
    // The slug is permanent, whatever the name becomes.
    await o.call('PATCH', `/locations/${o.locationId}/settings`, form({ nameEn: 'Downtown' }));
    expect((await o.menu()).location).toMatchObject({ nameEn: 'Downtown', slug: before.slug });
  });

  it('validates input and only accepts this organization\'s photos', async () => {
    const o = await ownerWithLocation('settings-validate@cafe.test');
    const bad = await o.call('PATCH', `/locations/${o.locationId}/settings`, form({ orderUrl: 'javascript:alert(1)', phone: 'call us', lng: null }));
    expect(bad.statusCode).toBe(400);
    expect(bad.json().issues).toEqual(expect.arrayContaining(['orderUrl', 'phone']));

    const other = await ownerWithLocation('settings-other@cafe.test');
    const [theirs] = await db.insert(schema.media).values({ organizationId: other.orgId, width: 10, height: 10, bytes: 10 }).returning();
    expect((await o.call('PATCH', `/locations/${o.locationId}/settings`, form({ logoPhotoId: theirs!.id }))).statusCode).toBe(400);
    const [mine] = await db.insert(schema.media).values({ organizationId: o.orgId, width: 10, height: 10, bytes: 10 }).returning();
    const ok = await o.call('PATCH', `/locations/${o.locationId}/settings`, form({ logoPhotoId: mine!.id, coverPhotoId: mine!.id }));
    expect(ok.json().brand.logo.id).toBe(mine!.id);
    expect(ok.json().cover.id).toBe(mine!.id);
  });

  it('lets editors read settings but not change them, and hides them from strangers', async () => {
    const o = await ownerWithLocation('settings-owner@cafe.test');
    const editor = await signIn('settings-editor@cafe.test');
    const editorId = (await app.inject({ method: 'GET', url: '/me', headers: { cookie: editor.cookie } })).json().user.id;
    await db.insert(schema.memberships).values({ organizationId: o.orgId, userId: editorId, role: 'editor' });
    const asEditor = (method: 'GET' | 'PATCH', payload?: object) => app.inject({ method, url: `/locations/${o.locationId}/settings`, headers: { cookie: editor.cookie }, ...(payload ? { payload } : {}) });
    expect((await asEditor('GET')).statusCode).toBe(200);
    expect((await asEditor('PATCH', form())).statusCode).toBe(403);

    const stranger = await ownerWithLocation('settings-stranger@cafe.test');
    expect((await stranger.call('GET', `/locations/${o.locationId}/settings`)).statusCode).toBe(404);
  });

  it('shows guests the hours, actions and map, but only the map when chosen', async () => {
    const o = await ownerWithLocation('settings-public@cafe.test');
    await setPlan(o.orgId, 'growth'); // order links are a Growth feature
    const cat = (await o.call('POST', `/locations/${o.locationId}/categories`, { nameEn: 'Coffee' })).json().id;
    await o.call('POST', `/locations/${o.locationId}/items`, { categoryId: cat, nameEn: 'Latte', priceMinor: 1800 });
    await o.call('POST', `/locations/${o.locationId}/publish`, {});
    await o.call('PATCH', `/locations/${o.locationId}/settings`, form());
    const slug = (await o.menu()).location.slug;

    let pub = (await app.inject({ method: 'GET', url: `/public/menu/${slug}` })).json();
    expect(pub.location).toMatchObject({
      city: 'Ramallah',
      pin: { lat: 31.9074, lng: 35.2094, deliveryRadiusM: 800 },
      directions: 'https://www.google.com/maps/dir/?api=1&destination=31.907400,35.209400',
      contact: { phone: '+970 59 555 0142', whatsapp: true },
      orderUrl: 'https://order.example.com/main',
      reservationUrl: null,
    });
    expect(pub.location.hours).toHaveLength(7);

    await o.call('PATCH', `/locations/${o.locationId}/settings`, form({ showMap: false, phone: null }));
    pub = (await app.inject({ method: 'GET', url: `/public/menu/${slug}` })).json();
    expect(pub.location.pin).toBeNull();
    expect(pub.location.directions).toContain('31.907400'); // directions still work without the map card
    expect(pub.location.contact).toBeNull();
  });

  it('lists the other branches on the map', async () => {
    expect(await seedDemoSettings(db)).toBe(2);
    expect(await seedDemoSettings(db)).toBe(0);
    const { cookie } = await signIn(DEMO_EMAIL);
    const me = (await app.inject({ method: 'GET', url: '/me', headers: { cookie } })).json();
    const ramallah = me.organizations[0].brands[0].locations.find((l: { nameEn: string }) => l.nameEn === 'Ramallah counter');
    const s = (await app.inject({ method: 'GET', url: `/locations/${ramallah.id}/settings`, headers: { cookie } })).json();
    expect(s.others.map((x: { nameEn: string }) => x.nameEn)).toEqual(['Old City kitchen']);
    expect(s.brand.branches).toBe(3);
  });

  it('searches addresses for signed-in people only', async () => {
    const o = await ownerWithLocation('settings-geo@cafe.test');
    expect((await app.inject({ method: 'GET', url: '/geocode?q=Rukab' })).statusCode).toBe(401);
    expect((await o.call('GET', '/geocode?q=Rukab%20St')).json()).toEqual({ places: [{ label: 'Rukab St, Ramallah', lat: 31.9074, lng: 35.2094 }] });
    expect((await o.call('GET', '/geocode?q=ab')).statusCode).toBe(400);
  });
});

describe('plans and billing', () => {
  const asStaff = async () => {
    const { cookie } = await signIn('staff@savora.test');
    return (method: 'GET' | 'POST', url: string, payload?: object) => app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  };
  const billing = async (o: Awaited<ReturnType<typeof ownerWithLocation>>) => (await o.call('GET', `/organizations/${o.orgId}/billing`)).json();
  const addLocation = (o: Awaited<ReturnType<typeof ownerWithLocation>>, nameEn: string) => o.call('POST', `/organizations/${o.orgId}/locations`, { nameEn });

  it('starts on Starter, free, with nothing to pay', async () => {
    const o = await ownerWithLocation('billing-start@cafe.test');
    expect(await billing(o)).toMatchObject({ plan: 'starter', subscription: null, locations: 1, paused: [], monthlyCents: 0, pending: null, invoices: [], canManage: true });
    const me = (await o.call('GET', '/me')).json();
    expect(me.user.staff).toBe(false);
    expect(me.organizations[0].brands[0].locations[0].paused).toBe(false);
  });

  it('holds each plan to its location limit and names the plan that fits', async () => {
    const o = await ownerWithLocation('billing-limits@cafe.test');
    const blocked = await addLocation(o, 'Second branch');
    expect(blocked.statusCode).toBe(402);
    expect(blocked.json()).toMatchObject({ error: 'upgrade_required', feature: 'locations', plan: 'growth', max: 1 });

    await setPlan(o.orgId, 'growth');
    expect((await addLocation(o, 'Second branch')).json()).toMatchObject({ monthlyCents: 1800 });
    expect((await addLocation(o, 'Third branch')).statusCode).toBe(201);
    expect((await addLocation(o, 'Fourth branch')).json()).toMatchObject({ plan: 'multi_location', max: 3 });
    // Growth can't be requested for more locations than it allows.
    expect((await o.call('POST', `/organizations/${o.orgId}/billing/requests`, { plan: 'growth' })).statusCode).toBe(201);
    await setPlan(o.orgId, 'multi_location');
    await addLocation(o, 'Fourth branch');
    const tooMany = await o.call('POST', `/organizations/${o.orgId}/billing/requests`, { plan: 'growth' });
    expect(tooMany.json()).toEqual({ error: 'too_many_locations', max: 3 });
  });

  it('turns a plan request into a due invoice with a payment reference, one at a time', async () => {
    const o = await ownerWithLocation('billing-request@cafe.test');
    const first = await o.call('POST', `/organizations/${o.orgId}/billing/requests`, { plan: 'growth', contactName: 'Nadia', contactPhone: '+970 59 555 0142' });
    expect(first.statusCode).toBe(201);
    expect(first.json().request).toMatchObject({ plan: 'growth', locations: 1, amountCents: 900, status: 'pending' });
    expect(first.json().request.reference).toMatch(/^SV-[A-HJ-NP-Z2-9]{5}$/);
    expect(first.json().next).toEqual({ kind: 'instructions', payment: { bankName: 'Bank of Palestine', accountName: null, iban: 'PS00 TEST 0000 0000 0000 0000 0000 0', contactPhone: null } });

    const second = (await o.call('POST', `/organizations/${o.orgId}/billing/requests`, { plan: 'multi_location' })).json();
    const b = await billing(o);
    expect(b.pending).toMatchObject({ plan: 'multi_location', amountCents: 2900, reference: second.request.reference });
    expect(b.invoices.map((i: { status: string; amountCents: number }) => [i.status, i.amountCents])).toEqual([
      ['due', 2900],
      ['void', 900],
    ]);
    expect(b.invoices[0].number).toMatch(/^SV-\d{4}-\d{4}$/);

    expect((await o.call('DELETE', `/organizations/${o.orgId}/billing/requests/${second.request.id}`)).statusCode).toBe(200);
    expect((await billing(o)).pending).toBeNull();
    expect((await o.call('POST', `/organizations/${o.orgId}/billing/requests`, { plan: 'enterprise' })).statusCode).toBe(400);
  });

  it('leaves billing to the owner', async () => {
    const o = await ownerWithLocation('billing-owner@cafe.test');
    const admin = await signIn('billing-admin@cafe.test');
    const adminId = (await app.inject({ method: 'GET', url: '/me', headers: { cookie: admin.cookie } })).json().user.id;
    await db.insert(schema.memberships).values({ organizationId: o.orgId, userId: adminId, role: 'admin' });
    const asAdmin = (method: 'GET' | 'POST', url: string, payload?: object) => app.inject({ method, url, headers: { cookie: admin.cookie }, ...(payload ? { payload } : {}) });
    expect((await asAdmin('GET', `/organizations/${o.orgId}/billing`)).json().canManage).toBe(false);
    expect((await asAdmin('POST', `/organizations/${o.orgId}/billing/requests`, { plan: 'growth' })).statusCode).toBe(403);
    const stranger = await ownerWithLocation('billing-stranger@cafe.test');
    expect((await stranger.call('GET', `/organizations/${o.orgId}/billing`)).statusCode).toBe(404);
  });

  it('activates a plan when Savora staff confirm the payment, and renews from the end of the period', async () => {
    const o = await ownerWithLocation('billing-approve@cafe.test');
    const staff = await asStaff();
    expect((await staff('GET', '/me')).json().user.staff).toBe(true);
    // Not staff: the staff routes don't exist.
    expect((await o.call('GET', '/staff/billing')).statusCode).toBe(404);

    fakeNow = new Date('2026-10-10T09:00:00Z');
    const req1 = (await o.call('POST', `/organizations/${o.orgId}/billing/requests`, { plan: 'growth' })).json().request;
    expect((await staff('GET', '/staff/billing')).json().requests.some((r: { reference: string }) => r.reference === req1.reference)).toBe(true);
    const ok = await staff('POST', `/staff/billing/requests/${req1.id}/approve`, { method: 'bank_transfer' });
    expect(ok.json()).toMatchObject({ plan: 'growth', periodEnd: '2026-11-10T09:00:00.000Z' });
    expect((await staff('POST', `/staff/billing/requests/${req1.id}/approve`, {})).statusCode).toBe(409);

    let b = await billing(o);
    expect(b).toMatchObject({ plan: 'growth', subscription: { status: 'active', periodEnd: '2026-11-10T09:00:00.000Z' }, monthlyCents: 900, pending: null });
    expect(b.invoices[0]).toMatchObject({ status: 'paid', method: 'bank_transfer', periodStart: '2026-10-10T09:00:00.000Z' });
    expect((await o.call('GET', `/locations/${o.locationId}/analytics`)).statusCode).toBe(200);

    // Paying again before it runs out adds a month to the end, not to today.
    fakeNow = new Date('2026-11-05T09:00:00Z');
    const req2 = (await o.call('POST', `/organizations/${o.orgId}/billing/requests`, { plan: 'growth' })).json().request;
    await staff('POST', `/staff/billing/requests/${req2.id}/approve`, { method: 'cash' });
    b = await billing(o);
    expect(b.subscription.periodEnd).toBe('2026-12-10T09:00:00.000Z');
    fakeNow = null;
  });

  it('tells the owner when a request is turned down', async () => {
    const o = await ownerWithLocation('billing-reject@cafe.test');
    const staff = await asStaff();
    const r = (await o.call('POST', `/organizations/${o.orgId}/billing/requests`, { plan: 'growth' })).json().request;
    await staff('POST', `/staff/billing/requests/${r.id}/reject`, { note: 'Transfer not received' });
    const b = await billing(o);
    expect(b).toMatchObject({ plan: 'starter', pending: null, lastDecision: { status: 'rejected', decisionNote: 'Transfer not received' } });
    expect(b.invoices[0].status).toBe('void');
  });

  it('ends a cancelled plan at the end of its month, and an unpaid one after a week of grace', async () => {
    const o = await ownerWithLocation('billing-lapse@cafe.test');
    const staff = await asStaff();
    fakeNow = new Date('2026-10-10T09:00:00Z');
    const r = (await o.call('POST', `/organizations/${o.orgId}/billing/requests`, { plan: 'growth' })).json().request;
    await staff('POST', `/staff/billing/requests/${r.id}/approve`, {});

    // Cancel, change your mind, cancel again.
    expect((await o.call('POST', `/organizations/${o.orgId}/billing/cancel`, {})).json().subscription.cancelAtPeriodEnd).toBe(true);
    expect((await o.call('POST', `/organizations/${o.orgId}/billing/cancel`, { resume: true })).json().subscription.cancelAtPeriodEnd).toBe(false);

    // Not renewed: a week of grace, still on Growth…
    fakeNow = new Date('2026-11-12T09:00:00Z');
    expect(await billing(o)).toMatchObject({ plan: 'growth', subscription: { status: 'past_due' } });
    // …then back to Starter. Nothing is deleted; the second branch pauses.
    const second = (await addLocation(o, 'Second branch')).json();
    fakeNow = new Date('2026-11-18T09:00:00Z');
    const b = await billing(o);
    expect(b).toMatchObject({ plan: 'starter', subscription: { status: 'canceled' }, paused: [{ id: second.id, nameEn: 'Second branch' }] });
    expect((await o.call('GET', `/locations/${o.locationId}/analytics`)).statusCode).toBe(402);
    expect((await o.call('POST', `/locations/${second.id}/publish`, {})).statusCode).toBe(402);
    expect((await app.inject({ method: 'GET', url: `/public/menu/${second.slug}` })).json()).toMatchObject({ error: 'paused' });
    fakeNow = null;
  });

  it('keeps Growth features locked on Starter without losing what was saved', async () => {
    const o = await ownerWithLocation('billing-locks@cafe.test');
    const res = await o.call('GET', `/locations/${o.locationId}/analytics`);
    expect(res.statusCode).toBe(402);
    expect(res.json()).toMatchObject({ error: 'upgrade_required', feature: 'analytics', plan: 'growth', allTime: 0 });

    // An order link saved on Growth survives a downgrade but isn't shown or editable on Starter.
    await setPlan(o.orgId, 'growth');
    const base = (await o.call('GET', `/locations/${o.locationId}/settings`)).json();
    const form = { ...base, coverPhotoId: null, logoPhotoId: base.brand.logo?.id ?? null, orderUrl: 'https://order.example.com/x' };
    for (const k of ['id', 'slug', 'status', 'cover', 'brand', 'others', 'organizationId']) delete form[k];
    await o.call('PATCH', `/locations/${o.locationId}/settings`, form);
    await setPlan(o.orgId, 'starter');
    const after = (await o.call('PATCH', `/locations/${o.locationId}/settings`, { ...form, orderUrl: 'https://other.example.com' })).json();
    expect(after.orderUrl).toBe('https://order.example.com/x');
  });

  it('puts the demo on Multi-location with a billing history', async () => {
    expect(await seedDemoBilling(db)).toBe(true);
    expect(await seedDemoBilling(db)).toBe(false);
    const { cookie } = await signIn(DEMO_EMAIL);
    const orgId = (await app.inject({ method: 'GET', url: '/me', headers: { cookie } })).json().organizations[0].id;
    const b = (await app.inject({ method: 'GET', url: `/organizations/${orgId}/billing`, headers: { cookie } })).json();
    expect(b).toMatchObject({ plan: 'multi_location', locations: 3, paused: [], monthlyCents: 2900, subscription: { status: 'active' } });
    expect(b.invoices).toHaveLength(2);
  });
});

describe('menu themes and AI', () => {
  // A stand-in for Claude: records what it was given and answers with fixed data.
  const seen: { readMenu: Array<{ types: string[]; currency: string }>; design: Array<{ locale: string; turns: number; photo: boolean }> } = { readMenu: [], design: [] };
  let refuse = false;
  const fakeAi: AiProvider = {
    async readMenu({ files, currency }) {
      seen.readMenu.push({ types: files.map((f) => f.mediaType), currency });
      if (refuse) throw new AiRefused('cyber');
      return {
        currency: 'ILS',
        categories: [
          {
            nameEn: 'Coffee',
            nameAr: 'قهوة',
            items: [
              { nameEn: 'Cardamom Latte', nameAr: 'لاتيه بالهيل', descriptionEn: null, descriptionAr: null, price: 18 },
              { nameEn: 'Mystery', nameAr: null, descriptionEn: null, descriptionAr: null, price: null },
              { nameEn: null, nameAr: null, descriptionEn: null, descriptionAr: null, price: 3 },
            ],
          },
          { nameEn: 'Empty', nameAr: null, items: [] },
        ],
        notes: ['Prices under the fold were blurry'],
      };
    },
    async designThemes({ locale, turns }) {
      seen.design.push({ locale, turns: turns.length, photo: turns.some((t) => t.role === 'user' && Boolean(t.photo)) });
      return {
        reply: 'Three directions.',
        options: [
          { nameEn: 'Pale dawn', nameAr: 'فجر باهت', note: 'Soft and light', colors: { bg: '#F3EADB', surface: '#FBF6EE', primary: '#E89A8F', accent: '#C08A35', ink: '#9A8F86', muted: '#C9BFB5' }, font: 'serif', boldPrices: true },
          { nameEn: 'Readable', nameAr: 'واضح', note: 'Already fine', colors: { bg: '#F5F5F5', surface: '#FFFFFF', primary: '#B4500B', accent: '#2E7D5B', ink: '#242424', muted: '#6E6E6E' }, font: 'sans', boldPrices: false },
          { nameEn: 'Broken', nameAr: 'مكسور', note: 'Not a colour', colors: { bg: 'red', surface: '#FFFFFF', primary: '#000000', accent: '#000000', ink: '#000000', muted: '#000000' }, font: 'sans', boldPrices: false },
        ],
      };
    },
  };
  let aiApp: FastifyInstance;
  beforeAll(async () => {
    aiApp = await buildApp(env, db, { mailer: { send: async (m) => void outbox.push(m) }, store, ai: fakeAi });
  });
  afterAll(() => aiApp.close());

  type Owner = Awaited<ReturnType<typeof ownerWithLocation>>;
  const png = () => sharp({ create: { width: 40, height: 30, channels: 3, background: '#ffffff' } }).png().toBuffer();
  /** multipart/form-data with several files. */
  function files(parts: Array<{ name: string; type: string; data: Buffer }>) {
    const boundary = '----savora' + Math.random().toString(16).slice(2);
    const payload = Buffer.concat([
      ...parts.flatMap((p) => [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${p.name}"\r\nContent-Type: ${p.type}\r\n\r\n`), p.data, Buffer.from('\r\n')]),
      Buffer.from(`--${boundary}--\r\n`),
    ]);
    return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
  }
  const read = (o: Owner, on: FastifyInstance, body: ReturnType<typeof files>) => on.inject({ method: 'POST', url: `/locations/${o.locationId}/menu/read`, headers: { cookie: o.cookie, ...body.headers }, payload: body.payload });
  const call = (o: Owner, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) => aiApp.inject({ method, url, headers: { cookie: o.cookie }, ...(payload ? { payload } : {}) });

  it('reads a menu from photos into the review shape, on Growth only', async () => {
    const o = await ownerWithLocation('ai-read@cafe.test');
    const photo = files([{ name: 'menu.png', type: 'image/png', data: await png() }]);
    expect((await read(o, aiApp, photo)).json()).toMatchObject({ error: 'upgrade_required', feature: 'menuImport', plan: 'growth' });
    await setPlan(o.orgId, 'growth');
    // Without a key the feature says so instead of failing.
    expect((await read(o, app, photo)).json()).toEqual({ error: 'ai_unavailable' });

    const res = await read(o, aiApp, files([{ name: 'a.png', type: 'image/png', data: await png() }, { name: 'menu.pdf', type: 'application/pdf', data: Buffer.from('%PDF-1.4 test') }]));
    expect(res.statusCode).toBe(200);
    expect(seen.readMenu.at(-1)).toEqual({ types: ['image/jpeg', 'application/pdf'], currency: 'ILS' });
    expect(res.json()).toEqual({
      categories: [
        {
          nameEn: 'Coffee',
          nameAr: 'قهوة',
          items: [
            { nameEn: 'Cardamom Latte', nameAr: 'لاتيه بالهيل', descriptionEn: null, descriptionAr: null, priceMinor: 1800 },
            { nameEn: 'Mystery', nameAr: null, descriptionEn: null, descriptionAr: null, priceMinor: 0 },
          ],
        },
      ],
      notes: ['Prices under the fold were blurry'],
      currencyMismatch: null,
    });
    // The result goes through the normal import once the owner has reviewed it.
    expect((await o.call('POST', `/locations/${o.locationId}/import`, { categories: res.json().categories })).json()).toEqual({ items: 2 });
  });

  it('refuses files that are not menus and reports declines', async () => {
    const o = await ownerWithLocation('ai-read-bad@cafe.test');
    await setPlan(o.orgId, 'growth');
    expect((await read(o, aiApp, files([{ name: 'x.txt', type: 'text/plain', data: Buffer.from('hello') }]))).statusCode).toBe(415);
    const pdf = { name: 'm.pdf', type: 'application/pdf', data: Buffer.from('%PDF-1.4') };
    expect((await read(o, aiApp, files([pdf, pdf]))).json()).toEqual({ error: 'one_pdf' });
    refuse = true;
    expect((await read(o, aiApp, files([pdf]))).json()).toEqual({ error: 'ai_declined' });
    refuse = false;
  });

  it('lists the gallery with plan locks and keeps Starter to the essentials', async () => {
    const o = await ownerWithLocation('themes-starter@cafe.test');
    const list = (await call(o, 'GET', `/locations/${o.locationId}/themes`)).json();
    expect(list).toMatchObject({ plan: 'starter', selectedRef: 'auto', current: { ref: 'auto' }, canShare: false, canDesign: false, aiAvailable: true, custom: [] });
    expect(list.presets.filter((p: { allowed: boolean }) => p.allowed).map((p: { ref: string }) => p.ref)).toEqual(['auto', 'roast', 'dark']);
    expect(list.presets.every((p: { contrast: { ok: boolean } }) => p.contrast.ok)).toBe(true);

    expect((await call(o, 'PUT', `/locations/${o.locationId}/theme`, { ref: 'olive' })).json()).toMatchObject({ error: 'upgrade_required', feature: 'themeGallery' });
    expect((await call(o, 'PUT', `/locations/${o.locationId}/theme`, { ref: 'nope' })).statusCode).toBe(400);
    expect((await call(o, 'PUT', `/locations/${o.locationId}/theme`, { ref: 'dark' })).json()).toEqual({ ok: true, ref: 'dark' });
    expect((await call(o, 'GET', `/locations/${o.locationId}/themes`)).json().current.ref).toBe('dark');
    expect((await call(o, 'POST', `/organizations/${o.orgId}/themes/assistant`, { locationId: o.locationId, turns: [{ role: 'user', text: 'warmer' }] })).statusCode).toBe(402);
  });

  it('shows guests the chosen theme, and Auto-match again after a downgrade', async () => {
    const o = await ownerWithLocation('themes-public@cafe.test');
    const slug = (await o.menu()).location.slug;
    const cat = (await o.call('POST', `/locations/${o.locationId}/categories`, { nameEn: 'Coffee', nameAr: 'قهوة' })).json().id;
    await o.call('POST', `/locations/${o.locationId}/items`, { categoryId: cat, nameEn: 'Latte', nameAr: 'لاتيه', priceMinor: 1800 });
    await o.call('POST', `/locations/${o.locationId}/publish`, {});
    await setPlan(o.orgId, 'growth');
    await call(o, 'PUT', `/locations/${o.locationId}/theme`, { ref: 'souk' });
    const guest = () => app.inject({ method: 'GET', url: `/public/menu/${slug}` });
    expect((await guest()).json().theme).toMatchObject({ ref: 'souk', colors: { bg: '#121729' } });
    await setPlan(o.orgId, 'starter');
    expect((await guest()).json().theme.ref).toBe('auto');
    // The choice is remembered for when they upgrade again.
    expect((await call(o, 'GET', `/locations/${o.locationId}/themes`)).json().selectedRef).toBe('souk');
  });

  it('designs readable options with the assistant and saves them as custom themes', async () => {
    const o = await ownerWithLocation('themes-assistant@cafe.test');
    await setPlan(o.orgId, 'growth');
    const upload = files([{ name: 'room.png', type: 'image/png', data: await png() }]);
    const media = await aiApp.inject({ method: 'POST', url: `/organizations/${o.orgId}/media`, headers: { cookie: o.cookie, ...upload.headers }, payload: upload.payload });
    const photoId = media.json().id;
    const res = await call(o, 'POST', `/organizations/${o.orgId}/themes/assistant`, { locationId: o.locationId, locale: 'ar', turns: [{ role: 'user', text: 'أدفأ', photoId }] });
    expect(res.statusCode).toBe(200);
    expect(seen.design.at(-1)).toEqual({ locale: 'ar', turns: 1, photo: true });
    const { options } = res.json();
    // The malformed palette is dropped; the pale one is fixed and says so.
    expect(options.map((x: { nameEn: string }) => x.nameEn)).toEqual(['Pale dawn', 'Readable']);
    expect(options.every((x: { contrast: { ok: boolean } }) => x.contrast.ok)).toBe(true);
    expect(options.map((x: { adjusted: boolean }) => x.adjusted)).toEqual([true, false]);
    expect(options[0]).toMatchObject({ noteAr: 'Soft and light', noteEn: '', font: 'serif', boldPrices: true });

    // Saving runs the same check, whatever the client sends.
    const saved = await call(o, 'POST', `/organizations/${o.orgId}/themes`, { nameEn: 'Pale dawn', colors: { bg: '#F3EADB', surface: '#FBF6EE', primary: '#E89A8F', accent: '#C08A35', ink: '#9A8F86', muted: '#C9BFB5' }, font: 'serif' });
    expect(saved.statusCode).toBe(201);
    const ref: string = saved.json().ref;
    expect(ref).toMatch(/^custom:/);
    expect((await call(o, 'PUT', `/locations/${o.locationId}/theme`, { ref })).json()).toEqual({ ok: true, ref });
    const list = (await call(o, 'GET', `/locations/${o.locationId}/themes`)).json();
    expect(list.custom).toHaveLength(1);
    expect(list.custom[0].contrast.ok).toBe(true);
    expect(list.current).toMatchObject({ ref, tier: 'custom', font: 'serif' });

    // Another organization can neither use nor delete it.
    const other = await ownerWithLocation('themes-other@cafe.test');
    await setPlan(other.orgId, 'growth');
    expect((await call(other, 'PUT', `/locations/${other.locationId}/theme`, { ref })).statusCode).toBe(400);
    expect((await call(other, 'DELETE', `/organizations/${other.orgId}/themes/${ref.slice(7)}`)).statusCode).toBe(404);
    // Deleting it puts its locations back on Auto-match.
    expect((await call(o, 'DELETE', `/organizations/${o.orgId}/themes/${ref.slice(7)}`)).json()).toEqual({ ok: true });
    expect((await call(o, 'GET', `/locations/${o.locationId}/themes`)).json().selectedRef).toBe('auto');
  });

  it('shares one theme across locations on Multi-location only', async () => {
    const o = await ownerWithLocation('themes-share@cafe.test');
    await setPlan(o.orgId, 'growth');
    expect((await call(o, 'PUT', `/locations/${o.locationId}/theme`, { ref: 'clay', everywhere: true })).json()).toMatchObject({ feature: 'sharedTheme', plan: 'multi_location' });
    const second = (await o.call('POST', `/organizations/${o.orgId}/locations`, { nameEn: 'Second' })).json();
    await setPlan(o.orgId, 'multi_location');
    expect((await call(o, 'PUT', `/locations/${o.locationId}/theme`, { ref: 'clay', everywhere: true })).statusCode).toBe(200);
    expect((await call(o, 'GET', `/locations/${second.id}/themes`)).json().selectedRef).toBe('clay');
  });
});

// Photo processing is real (sharp), so these take a few seconds each.
describe('virtual trial', { timeout: 30_000 }, () => {
  type Owner = Awaited<ReturnType<typeof ownerWithLocation>>;
  /** A test photo: busy noise reads as sharp; blur it for a shaken shot, lower the mean for a dark one. */
  const photo = async (o: { width?: number; height?: number; mean?: number; sigma?: number; blur?: number } = {}) => {
    const raw = await sharp({ create: { width: o.width ?? 1000, height: o.height ?? 750, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: o.mean ?? 128, sigma: o.sigma ?? 40 } } }).png().toBuffer();
    return (o.blur ? sharp(raw).blur(o.blur) : sharp(raw)).jpeg({ quality: 90 }).toBuffer();
  };
  function upload(parts: Array<{ name: string; type: string; data: Buffer }>) {
    const boundary = '----savora' + Math.random().toString(16).slice(2);
    const payload = Buffer.concat([
      ...parts.flatMap((p) => [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${p.name}"\r\nContent-Type: ${p.type}\r\n\r\n`), p.data, Buffer.from('\r\n')]),
      Buffer.from(`--${boundary}--\r\n`),
    ]);
    return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
  }
  const send = (o: Owner, method: 'POST' | 'PUT', url: string, body: ReturnType<typeof upload>) => app.inject({ method, url, headers: { cookie: o.cookie, ...body.headers }, payload: body.payload });
  const jpg = (name: string, data: Buffer) => ({ name, type: 'image/jpeg', data });

  /** A Growth café with a published menu of one dish, and a tour of three scenes. */
  async function cafeWithTour(email: string) {
    const o = await ownerWithLocation(email);
    await setPlan(o.orgId, 'growth');
    const cat = (await o.call('POST', `/locations/${o.locationId}/categories`, { nameEn: 'Coffee', nameAr: 'قهوة' })).json().id;
    const dish = (await o.call('POST', `/locations/${o.locationId}/items`, { categoryId: cat, nameEn: 'Cardamom Latte', nameAr: 'لاتيه بالهيل', priceMinor: 1800 })).json();
    const res = await send(o, 'POST', `/locations/${o.locationId}/tour/scenes`, upload([jpg('entrance.jpg', await photo()), jpg('window.jpg', await photo({ blur: 6 })), jpg('lamps.jpg', await photo({ mean: 22, sigma: 8 }))]));
    return { o, dish, res };
  }

  it('is part of Growth', async () => {
    const o = await ownerWithLocation('tour-starter@cafe.test');
    expect((await o.call('GET', `/locations/${o.locationId}/tour`)).json()).toMatchObject({ error: 'upgrade_required', feature: 'virtualTrial', plan: 'growth' });
    const stranger = await ownerWithLocation('tour-stranger@cafe.test');
    await setPlan(stranger.orgId, 'growth');
    expect((await stranger.call('GET', `/locations/${o.locationId}/tour`)).statusCode).toBe(404);
  });

  it('turns photos into scenes and checks each one', async () => {
    const { o, res } = await cafeWithTour('tour-upload@cafe.test');
    expect(res.statusCode).toBe(201);
    const draft = res.json();
    expect(draft.scenes.map((s: { quality: { issues: string[] } }) => s.quality.issues)).toEqual([[], ['blurry'], ['dark']]);
    expect(draft.scenes[0].quality).toMatchObject({ score: 100, width: 1000, height: 750 });
    expect(draft.score).toBe(Math.round((100 + 60 + 70) / 3));
    expect(draft.checks.find((c: { key: string }) => c.key === 'scenes')).toMatchObject({ ok: true, count: 3 });
    expect(draft.checks.find((c: { key: string }) => c.key === 'quality')).toMatchObject({ ok: false, count: 2 });
    expect(draft.dishes).toHaveLength(1);
    expect(draft.hasChanges).toBe(true);

    // A file that isn't a photo stops the whole upload; nothing half-added.
    const bad = await send(o, 'POST', `/locations/${o.locationId}/tour/scenes`, upload([jpg('ok.jpg', await photo()), { name: 'notes.txt', type: 'text/plain', data: Buffer.from('hello') }]));
    expect(bad.statusCode).toBe(415);
    expect((await o.call('GET', `/locations/${o.locationId}/tour`)).json().scenes).toHaveLength(3);

    // Small photos are flagged too.
    const small = await send(o, 'POST', `/locations/${o.locationId}/tour/scenes`, upload([jpg('tiny.jpg', await photo({ width: 640, height: 480 }))]));
    expect(small.json().scenes[3].quality.issues).toEqual(['small']);
  });

  it('names, times, orders and retakes scenes', async () => {
    const { o, res } = await cafeWithTour('tour-scenes@cafe.test');
    const [a, b, c] = res.json().scenes;
    expect((await o.call('PATCH', `/tour/scenes/${a.id}`, { nameEn: 'Entrance', nameAr: 'المدخل', seconds: 2 })).statusCode).toBe(400);
    const named = (await o.call('PATCH', `/tour/scenes/${a.id}`, { nameEn: 'Entrance', nameAr: 'المدخل', seconds: 12 })).json();
    expect(named.scenes[0]).toMatchObject({ nameEn: 'Entrance', nameAr: 'المدخل', seconds: 12 });
    const moved = (await o.call('POST', `/tour/scenes/${c.id}/move`, { to: 0 })).json();
    expect(moved.scenes.map((s: { id: string }) => s.id)).toEqual([c.id, a.id, b.id]);

    // Retaking the blurry window keeps its place and spots.
    await o.call('POST', `/tour/scenes/${b.id}/spots`, { x: 0.5, y: 0.5, kind: 'info', labelEn: 'Window table' });
    const retake = (await send(o, 'PUT', `/tour/scenes/${b.id}/photo`, upload([jpg('window-2.jpg', await photo())]))).json();
    const window = retake.scenes.find((s: { id: string }) => s.id === b.id);
    expect(window.quality.issues).toEqual([]);
    expect(window.spots).toHaveLength(1);
    expect(window.photo.id).not.toBe(b.photo.id);
  });

  it('tags spots that open a dish, a note or another scene', async () => {
    const { o, dish, res } = await cafeWithTour('tour-spots@cafe.test');
    const [a, b] = res.json().scenes;
    const other = await cafeWithTour('tour-spots-other@cafe.test');
    // Only this place's dishes and scenes.
    expect((await o.call('POST', `/tour/scenes/${a.id}/spots`, { x: 0.3, y: 0.6, kind: 'dish', itemId: other.dish.id })).statusCode).toBe(400);
    expect((await o.call('POST', `/tour/scenes/${a.id}/spots`, { x: 0.3, y: 0.6, kind: 'scene', targetSceneId: a.id })).statusCode).toBe(400);
    expect((await o.call('POST', `/tour/scenes/${a.id}/spots`, { x: 0.3, y: 0.6, kind: 'scene', targetSceneId: other.res.json().scenes[0].id })).statusCode).toBe(400);
    expect((await other.o.call('POST', `/tour/scenes/${a.id}/spots`, { x: 0.3, y: 0.6, kind: 'info', labelEn: 'x' })).statusCode).toBe(404);

    await o.call('POST', `/tour/scenes/${a.id}/spots`, { x: 0.3, y: 0.6, kind: 'dish', itemId: dish.id, labelEn: 'Order counter' });
    await o.call('POST', `/tour/scenes/${a.id}/spots`, { x: 0.8, y: 0.4, kind: 'scene', targetSceneId: b.id, labelEn: 'To the window' });
    const draft = (await o.call('POST', `/tour/scenes/${b.id}/spots`, { x: 0.1, y: 0.2, kind: 'info', labelEn: 'Pendant lights', noteEn: 'Warm in the evening' })).json();
    expect(draft.scenes[0].spots.map((s: { kind: string }) => s.kind)).toEqual(['dish', 'scene']);
    expect(draft.checks.filter((c: { key: string }) => ['spots', 'dishes'].includes(c.key)).map((c: { ok: boolean; count: number }) => [c.ok, c.count])).toEqual([
      [true, 3],
      [true, 1],
    ]);

    // Switching a spot's kind drops the old link.
    const spot = draft.scenes[0].spots[0];
    const edited = (await o.call('PATCH', `/tour/spots/${spot.id}`, { x: 0.35, y: 0.62, kind: 'info', labelEn: 'Order here', itemId: dish.id })).json();
    expect(edited.scenes[0].spots[0]).toMatchObject({ kind: 'info', itemId: null, x: 0.35 });

    // Deleting a scene removes the spots that led to it.
    const after = (await o.call('DELETE', `/tour/scenes/${b.id}`)).json();
    expect(after.scenes).toHaveLength(2);
    expect(after.scenes[0].spots.map((s: { kind: string }) => s.kind)).toEqual(['info']);
  });

  it('publishes to guests with live dish prices, and only on Growth', async () => {
    const { o, dish, res } = await cafeWithTour('tour-publish@cafe.test');
    const [a, b] = res.json().scenes;
    await o.call('POST', `/tour/scenes/${a.id}/spots`, { x: 0.3, y: 0.6, kind: 'dish', itemId: dish.id });
    await o.call('POST', `/tour/scenes/${a.id}/spots`, { x: 0.8, y: 0.4, kind: 'scene', targetSceneId: b.id });
    const slug = (await o.menu()).location.slug;
    const guestTour = () => app.inject({ method: 'GET', url: `/public/tour/${slug}` });
    const guestMenu = () => app.inject({ method: 'GET', url: `/public/menu/${slug}` });

    // The tour lives on the guest menu, so the menu goes first.
    expect((await o.call('POST', `/locations/${o.locationId}/tour/publish`)).json()).toEqual({ error: 'not_ready', missing: ['menu'] });
    await o.call('POST', `/locations/${o.locationId}/publish`, {});
    const published = await o.call('POST', `/locations/${o.locationId}/tour/publish`);
    expect(published.statusCode).toBe(201);
    expect(published.json()).toMatchObject({ hasChanges: false, published: { scenes: 3 } });

    expect((await guestMenu()).json().tour).toMatchObject({ scenes: 3, seconds: 30, cover: { id: a.photo.id } });
    const tour = (await guestTour()).json();
    expect(tour).toMatchObject({ slug, name: { en: 'Menu Café' }, currency: 'ILS' });
    expect(tour.scenes[0].width).toBe(1000);
    expect(tour.scenes[0].spots[0]).toMatchObject({ kind: 'dish', dish: { nameEn: 'Cardamom Latte', priceMinor: 1800 } });
    expect(tour.scenes[0].spots[0].itemId).toBeUndefined();
    expect(tour.scenes[0].spots[1]).toMatchObject({ kind: 'scene', targetSceneId: b.id, dish: null });

    // Prices follow the published menu, not the draft.
    await o.call('PATCH', `/items/${dish.id}`, { nameEn: 'Cardamom Latte', priceMinor: 2000 });
    expect((await guestTour()).json().scenes[0].spots[0].dish.priceMinor).toBe(1800);
    await o.call('POST', `/locations/${o.locationId}/publish`, {});
    expect((await guestTour()).json().scenes[0].spots[0].dish.priceMinor).toBe(2000);

    // Draft edits wait for the next publish.
    await o.call('PATCH', `/tour/scenes/${a.id}`, { nameEn: 'Entrance', seconds: 10 });
    expect((await o.call('GET', `/locations/${o.locationId}/tour`)).json().hasChanges).toBe(true);
    expect((await guestTour()).json().scenes[0].nameEn).toBeNull();

    // A dish taken off the published menu drops its spot for guests.
    await o.call('DELETE', `/items/${dish.id}`);
    await o.call('POST', `/locations/${o.locationId}/items`, { categoryId: (await o.menu()).categories[0].id, nameEn: 'Tea', priceMinor: 900 });
    await o.call('POST', `/locations/${o.locationId}/publish`, {});
    expect((await guestTour()).json().scenes[0].spots.map((s: { kind: string }) => s.kind)).toEqual(['scene']);

    // Starter: the tour is kept but guests don't see it.
    await setPlan(o.orgId, 'starter');
    expect((await guestTour()).statusCode).toBe(404);
    expect((await guestMenu()).json().tour).toBeNull();
    await setPlan(o.orgId, 'growth');
    expect((await guestTour()).statusCode).toBe(200);

    // Editors can build the tour but not publish it.
    const editor = await signIn('tour-editor@cafe.test');
    const editorId = (await app.inject({ method: 'GET', url: '/me', headers: { cookie: editor.cookie } })).json().user.id;
    await db.insert(schema.memberships).values({ organizationId: o.orgId, userId: editorId, role: 'editor' });
    const asEditor = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) => app.inject({ method, url, headers: { cookie: editor.cookie }, ...(payload ? { payload } : {}) });
    expect((await asEditor('PATCH', `/tour/scenes/${a.id}`, { nameEn: 'Door', seconds: 8 })).statusCode).toBe(200);
    expect((await asEditor('POST', `/locations/${o.locationId}/tour/publish`)).statusCode).toBe(403);

    expect((await o.call('DELETE', `/locations/${o.locationId}/tour/publish`)).json().published).toBeNull();
    expect((await guestTour()).statusCode).toBe(404);
    expect((await guestMenu()).json().tour).toBeNull();
  });
});

describe('production settings', () => {
  const prod = { NODE_ENV: 'production', DATABASE_URL: 'postgres://savora@db/savora', SESSION_SECRET: 'x'.repeat(40), WEB_ORIGIN: 'https://savora.menu', SMTP_URL: 'smtps://u:p@smtp.example.com:465' };
  it('accepts a sound production setup', () => {
    expect(loadEnv(prod).NODE_ENV).toBe('production');
  });
  it('refuses settings that are unsafe or lose data on a server', () => {
    const issues = (over: Record<string, string>) => {
      try {
        loadEnv({ ...prod, ...over });
        return [];
      } catch (e) {
        return (e as { issues: Array<{ path: string[] }> }).issues.map((i) => i.path[0]);
      }
    };
    expect(issues({ SESSION_SECRET: 'short-but-16-chars' })).toEqual(['SESSION_SECRET']);
    expect(issues({ WEB_ORIGIN: 'http://savora.menu' })).toEqual(['WEB_ORIGIN']);
    expect(issues({ DATABASE_URL: 'pglite://./data' })).toEqual(['DATABASE_URL']);
    expect(issues({ SEED_DEMO: '1' })).toEqual(['SEED_DEMO']);
    expect(issues({ SMTP_URL: '' })).toEqual(['SMTP_URL']);
  });
});

describe('email', () => {
  it('sends sign-in links through SMTP with the configured sender', async () => {
    const sent: Array<{ from?: unknown; to?: unknown; subject?: unknown; text?: unknown }> = [];
    const transport = { sendMail: async (m: (typeof sent)[number]) => void sent.push(m) } as unknown as Parameters<typeof smtpMailer>[3];
    const mailer = smtpMailer('smtp://unused', 'Savora <hello@savora.menu>', app.log, transport);
    await mailer.send({ to: 'owner@cafe.test', subject: 'Your sign-in link', text: 'https://savora.menu/en/auth/verify#token=x' });
    expect(sent).toEqual([{ from: 'Savora <hello@savora.menu>', to: 'owner@cafe.test', subject: 'Your sign-in link', text: 'https://savora.menu/en/auth/verify#token=x' }]);
  });
  it('reports a failed send instead of pretending', async () => {
    const transport = { sendMail: async () => Promise.reject(new Error('550 rejected')) } as unknown as Parameters<typeof smtpMailer>[3];
    await expect(smtpMailer('smtp://unused', 'x@y.z', app.log, transport).send({ to: 'a@b.c', subject: 's', text: 't' })).rejects.toThrow('550');
  });
});

describe('plans switched off for testing', () => {
  afterAll(() => {
    process.env.NEXT_PUBLIC_PLANS_ENABLED = 'true';
  });
  it('gives a Starter place every feature and any number of locations', async () => {
    const o = await ownerWithLocation('plans-off@cafe.test');
    expect((await o.call('GET', `/locations/${o.locationId}/analytics`)).statusCode).toBe(402);
    process.env.NEXT_PUBLIC_PLANS_ENABLED = 'false';
    expect((await o.call('GET', `/locations/${o.locationId}/analytics`)).statusCode).toBe(200);
    expect((await o.call('GET', `/locations/${o.locationId}/tour`)).statusCode).toBe(200);
    for (const name of ['Second', 'Third', 'Fourth', 'Fifth', 'Sixth']) expect((await o.call('POST', `/organizations/${o.orgId}/locations`, { nameEn: name })).statusCode).toBe(201);
    const me = (await o.call('GET', '/me')).json();
    expect(me.organizations[0].brands[0].locations.every((l: { paused: boolean }) => !l.paused)).toBe(true);
    // Switching plans back on applies the real limits again; nothing is deleted.
    process.env.NEXT_PUBLIC_PLANS_ENABLED = 'true';
    const after = (await o.call('GET', '/me')).json();
    expect(after.organizations[0].brands[0].locations.filter((l: { paused: boolean }) => l.paused)).toHaveLength(5);
  });
});
