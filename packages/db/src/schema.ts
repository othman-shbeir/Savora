import { sql } from 'drizzle-orm';
import type { Closure, MenuSnapshot, ThemeColors, TourQuality, TourSnapshot, WeekHours } from '@savora/shared';
import { boolean, check, doublePrecision, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

// ---------- Accounts ----------

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(), // stored lower-case
  name: text('name'),
  avatarUrl: text('avatar_url'),
  locale: text('locale').notNull().default('en'),
  createdAt: createdAt(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
}, (t) => [uniqueIndex('users_email_key').on(t.email)]);

/** A signed-in browser. The cookie holds a random token; only its SHA-256 hash is stored. */
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(), // sha256(token), hex
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  userAgent: text('user_agent'),
  createdAt: createdAt(),
}, (t) => [index('sessions_user_idx').on(t.userId)]);

/** One-time email sign-in links. Single use, short-lived, hashed like sessions. */
export const loginTokens = pgTable('login_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull(),
  locale: text('locale').notNull().default('en'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('login_tokens_hash_key').on(t.tokenHash), index('login_tokens_email_idx').on(t.email)]);

/** Accounts linked from an identity provider (Google). */
export const oauthAccounts = pgTable('oauth_accounts', {
  provider: text('provider').notNull(),
  providerUserId: text('provider_user_id').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.provider, t.providerUserId] })]);

// ---------- Workspace: organization > brands > locations ----------

export const planEnum = pgEnum('plan', ['starter', 'growth', 'multi_location']);
export const roleEnum = pgEnum('member_role', ['owner', 'admin', 'editor']);
export const locationStatusEnum = pgEnum('location_status', ['draft', 'live']);

/** The business group that pays for Savora, e.g. "Salt & Stem Group". */
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  nameEn: text('name_en').notNull(),
  nameAr: text('name_ar'),
  plan: planEnum('plan').notNull().default('starter'),
  createdAt: createdAt(),
});

/** Who can work in an organization. Access to every brand and location flows from membership. */
export const memberships = pgTable('memberships', {
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: roleEnum('role').notNull().default('editor'),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.organizationId, t.userId] }), index('memberships_user_idx').on(t.userId)]);

export const brands = pgTable('brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  nameEn: text('name_en').notNull(),
  nameAr: text('name_ar'),
  taglineEn: text('tagline_en'),
  taglineAr: text('tagline_ar'),
  /** Square logo shown on the guest menu and QR cards of every branch of the brand. */
  logoPhotoId: uuid('logo_photo_id').references((): AnyPgColumn => media.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [index('brands_org_idx').on(t.organizationId)]);

export const locations = pgTable('locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  nameEn: text('name_en').notNull(),
  nameAr: text('name_ar'),
  /** The permanent public link: savora.menu/r/<slug>. Never changes once printed. */
  slug: text('slug').notNull(),
  currency: text('currency').notNull().default('ILS'),
  status: locationStatusEnum('status').notNull().default('draft'),
  /** Header photo on the guest menu (the room, the counter). Edited in Location settings. */
  /** IANA zone used for "today" and daily charts. Editable in Location settings. */
  timezone: text('timezone').notNull().default('Asia/Hebron'),
  coverPhotoId: uuid('cover_photo_id').references((): AnyPgColumn => media.id, { onDelete: 'set null' }),
  // Where guests find the place. Coordinates drive the map and the Directions button.
  addressEn: text('address_en'),
  addressAr: text('address_ar'),
  building: text('building'),
  city: text('city'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  /** Delivery ring on the map; null means no delivery. */
  deliveryRadiusM: integer('delivery_radius_m'),
  showMap: boolean('show_map').notNull().default(true),
  /** Seven days, Sunday first; null until the owner sets hours. */
  hours: jsonb('hours').$type<WeekHours>(),
  closures: jsonb('closures').$type<Closure[]>().notNull().default([]),
  // Guest actions: each filled one becomes a button on the menu.
  phone: text('phone'),
  phoneIsWhatsapp: boolean('phone_is_whatsapp').notNull().default(false),
  orderUrl: text('order_url'),
  reservationUrl: text('reservation_url'),
  /** The guest menu's look: "auto", a preset id, or "custom:<uuid>". Applies at once, no publish. */
  themeRef: text('theme_ref').notNull().default('auto'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('locations_slug_key').on(sql`lower(${t.slug})`), index('locations_org_idx').on(t.organizationId), index('locations_brand_idx').on(t.brandId)]);

// ---------- Menu: a draft per location, frozen into numbered versions when published ----------

/** An uploaded image, stored as two WebP files (full and thumbnail) under MEDIA_DIR/<id>-*.webp. */
export const media = pgTable('media', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  bytes: integer('bytes').notNull(),
  createdAt: createdAt(),
}, (t) => [index('media_org_idx').on(t.organizationId)]);

/** Every row needs a name in at least one language; the health check asks for the other. */
const someName = (name: string, t: { nameEn: AnyPgColumn; nameAr: AnyPgColumn }) => check(name, sql`${t.nameEn} is not null or ${t.nameAr} is not null`);

export const menuCategories = pgTable('menu_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  locationId: uuid('location_id').notNull().references(() => locations.id, { onDelete: 'cascade' }),
  nameEn: text('name_en'),
  nameAr: text('name_ar'),
  position: integer('position').notNull(),
  createdAt: createdAt(),
}, (t) => [index('menu_categories_location_idx').on(t.locationId, t.position), someName('menu_categories_name', t)]);

export const menuItems = pgTable('menu_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  locationId: uuid('location_id').notNull().references(() => locations.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').notNull().references(() => menuCategories.id, { onDelete: 'cascade' }),
  nameEn: text('name_en'),
  nameAr: text('name_ar'),
  descriptionEn: text('description_en'),
  descriptionAr: text('description_ar'),
  /** Minor units of the location's currency: 1800 = ₪18.00. */
  priceMinor: integer('price_minor').notNull(),
  available: boolean('available').notNull().default(true),
  photoId: uuid('photo_id').references(() => media.id, { onDelete: 'set null' }),
  position: integer('position').notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('menu_items_category_idx').on(t.categoryId, t.position), index('menu_items_location_idx').on(t.locationId), someName('menu_items_name', t), check('menu_items_price', sql`${t.priceMinor} >= 0`)]);

/** A published menu. The guest page reads the latest one, so editing the draft never changes what
 *  guests see until the owner publishes again. */
export const menuVersions = pgTable('menu_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  locationId: uuid('location_id').notNull().references(() => locations.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  note: text('note'),
  content: jsonb('content').$type<MenuSnapshot>().notNull(),
  itemCount: integer('item_count').notNull(),
  publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('menu_versions_location_version_key').on(t.locationId, t.version)]);

// ---------- Scan analytics: privacy-first counting ----------

/** Short-lived record of a menu open, kept only to stop a reload or a language switch counting
 *  twice. Holds no IP or user agent: the visitor key is a hash salted per day, so it cannot follow
 *  a guest across days. Deleted after 48 hours. */
export const scanEvents = pgTable('scan_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  locationId: uuid('location_id').notNull().references(() => locations.id, { onDelete: 'cascade' }),
  visitorKey: text('visitor_key').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('scan_events_dedupe_idx').on(t.locationId, t.visitorKey, t.occurredAt), index('scan_events_age_idx').on(t.occurredAt)]);

/** The lasting record: counts per location per UTC hour. Days, weeks and "today" are built from
 *  these in the location's own time zone. */
export const scanHourly = pgTable('scan_hourly', {
  locationId: uuid('location_id').notNull().references(() => locations.id, { onDelete: 'cascade' }),
  hour: timestamp('hour', { withTimezone: true }).notNull(),
  scans: integer('scans').notNull().default(0),
  /** Opened from a printed code (?s=qr); the rest came from shared links. */
  qr: integer('qr').notNull().default(0),
  /** Read in Arabic; the rest in English. */
  ar: integer('ar').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.locationId, t.hour] })]);

// ---------- Billing: provider-neutral, manual payments first ----------

export const subscriptionStatusEnum = pgEnum('subscription_status', ['active', 'past_due', 'canceled']);
export const requestStatusEnum = pgEnum('plan_request_status', ['pending', 'approved', 'rejected', 'canceled']);
export const invoiceStatusEnum = pgEnum('invoice_status', ['due', 'paid', 'void']);

/** The paid side of an organization's plan. organizations.plan stays the plan in force; this row
 *  says how long it is paid for and through which provider ("manual" until a card provider joins). */
export const subscriptions = pgTable('subscriptions', {
  organizationId: uuid('organization_id').primaryKey().references(() => organizations.id, { onDelete: 'cascade' }),
  plan: planEnum('plan').notNull(),
  status: subscriptionStatusEnum('status').notNull().default('active'),
  provider: text('provider').notNull().default('manual'),
  providerRef: text('provider_ref'),
  periodEnd: timestamp('period_end', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** An owner asking for a plan. With manual payments it waits until Savora confirms the transfer;
 *  the reference goes on the bank transfer so the payment can be matched. */
export const planRequests = pgTable('plan_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  plan: planEnum('plan').notNull(),
  locations: integer('locations').notNull(),
  amountCents: integer('amount_cents').notNull(),
  reference: text('reference').notNull(),
  status: requestStatusEnum('status').notNull().default('pending'),
  contactName: text('contact_name'),
  contactPhone: text('contact_phone'),
  note: text('note'),
  requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
  decisionNote: text('decision_note'),
}, (t) => [uniqueIndex('plan_requests_reference_key').on(t.reference), index('plan_requests_org_idx').on(t.organizationId, t.status)]);

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  /** SV-2026-0001: sequential per year, printed on receipts. */
  number: text('number').notNull(),
  plan: planEnum('plan').notNull(),
  locations: integer('locations').notNull(),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull().default('USD'),
  periodStart: timestamp('period_start', { withTimezone: true }),
  periodEnd: timestamp('period_end', { withTimezone: true }),
  status: invoiceStatusEnum('status').notNull().default('due'),
  /** bank_transfer, cash, or a card provider's name. */
  method: text('method'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  requestId: uuid('request_id').references(() => planRequests.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('invoices_number_key').on(t.number), index('invoices_org_idx').on(t.organizationId, t.createdAt)]);

// ---------- Menu themes ----------

/** A theme made with the Theme assistant, available to every location of the organization. */
export const customThemes = pgTable('custom_themes', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  nameEn: text('name_en').notNull(),
  nameAr: text('name_ar'),
  colors: jsonb('colors').$type<ThemeColors>().notNull(),
  font: text('font').notNull().default('sans'),
  boldPrices: boolean('bold_prices').notNull().default(false),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [index('custom_themes_org_idx').on(t.organizationId)]);

// ---------- Virtual trial ----------

/** One per location once a scene is added. The draft is the scenes below; publishing copies them. */
export const tours = pgTable('tours', {
  locationId: uuid('location_id').primaryKey().references(() => locations.id, { onDelete: 'cascade' }),
  published: jsonb('published').$type<TourSnapshot>(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: createdAt(),
});

/** A photo of the place, in tour order. */
export const tourScenes = pgTable('tour_scenes', {
  id: uuid('id').primaryKey().defaultRandom(),
  locationId: uuid('location_id').notNull().references(() => locations.id, { onDelete: 'cascade' }),
  photoId: uuid('photo_id').notNull().references(() => media.id, { onDelete: 'cascade' }),
  nameEn: text('name_en'),
  nameAr: text('name_ar'),
  position: integer('position').notNull(),
  seconds: integer('seconds').notNull().default(10),
  quality: jsonb('quality').$type<TourQuality>().notNull(),
  createdAt: createdAt(),
}, (t) => [index('tour_scenes_location_idx').on(t.locationId, t.position)]);

/** Something guests can tap on a scene: a dish, a note, or a way to another scene. */
export const tourSpots = pgTable('tour_spots', {
  id: uuid('id').primaryKey().defaultRandom(),
  sceneId: uuid('scene_id').notNull().references(() => tourScenes.id, { onDelete: 'cascade' }),
  x: doublePrecision('x').notNull(),
  y: doublePrecision('y').notNull(),
  kind: text('kind', { enum: ['dish', 'info', 'scene'] }).notNull(),
  labelEn: text('label_en'),
  labelAr: text('label_ar'),
  noteEn: text('note_en'),
  noteAr: text('note_ar'),
  // A deleted dish or scene removes the spot: a spot that leads nowhere is worse than none.
  itemId: uuid('item_id').references(() => menuItems.id, { onDelete: 'cascade' }),
  targetSceneId: uuid('target_scene_id').references((): AnyPgColumn => tourScenes.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => [index('tour_spots_scene_idx').on(t.sceneId)]);
