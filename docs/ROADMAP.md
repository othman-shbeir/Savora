# Savora roadmap

Savora turns a photo or text menu into a bilingual (English / Arabic) QR menu, with a workspace
for owners to edit, publish and track every location. The approved designs live in the Figma file
(Screens, Wireframes and Case Study pages) and in `../Savora.dc.html`.

## Decisions

| Topic | Decision |
|---|---|
| Web app | Next.js 16 (App Router, React 19, TypeScript), Tailwind CSS 4 |
| API | Our own service: Fastify 5 (TypeScript), in `apps/api` |
| Database | PostgreSQL 17 (embedded PGlite or Docker for local development), Drizzle ORM and migrations in `packages/db` |
| Shared code | `packages/shared`: types, validation schemas, locale helpers used by web and API |
| Languages | `/en` and `/ar` routes, right-to-left for Arabic, Poppins + Tajawal |
| Scope | All phases, 0 to 9 |
| Payments | Decided at Phase 6 (Stripe does not onboard businesses based in Palestine) |

## Phases

| # | Phase | Delivers | Status |
|---|---|---|---|
| 0 | Foundations | Monorepo, tokens (light + dark), fonts, EN/AR routing with RTL, core components, app shell, lint, typecheck, tests | Done |
| 1 | Accounts & workspace | Schema for groups, brands, locations and members; email + Google sign-in with sessions; per-location access rules; location switcher; Sign in and Overview screens; mobile navigation drawer | Done |
| 2 | Menu core | Categories and dishes (EN/AR), prices, availability, ordering, dish photos, draft vs published versions, publish flow, menu health checks; Menu editor screen | Done |
| 3 | Guest menu & QR | Public menu at `/[lang]/r/[slug]`, featured dish, permanent QR with print-ready PNG, share links; Guest menu and QR screens | Done |
| 4 | Scan analytics | Privacy-friendly scan events, daily rollups, average, busiest day, written insights; Scan analytics screen | Done |
| 5 | Location settings | Identity, address with map pin and delivery radius, opening hours, guest action links; Location settings screen | Done |
| 6 | Plans & billing | Plan entitlements and locks (Starter / Growth / Multi-location), payment provider; Plans & billing screen | Done |
| 7 | AI features | Menu import from photo or PDF, Theme gallery, Theme assistant with contrast checks; Menu themes screens | Done |
| 8 | Virtual trial | Research spike on a photos-to-3D service, then upload, quality checks, spots, guided tour; Virtual trial screen | Done (photo tour; 3D capture pending a vendor decision) |
| 9 | Launch | Landing page, SEO, accessibility and performance passes, monitoring, production deploy | Done (ready to deploy; needs a server, domain and email service) |

## Phase 0 notes

- `/` redirects to the visitor's language (`/ar` when the browser prefers Arabic). Printed links
  such as `/r/saltandstem` get the same treatment.
- `/en/design` and `/ar/design` show every token and component; they double as a visual regression page.
- Emails, links and phone numbers render left to right inside Arabic pages.

## Phase 1 notes

- Sign-in by email link: the token travels in the URL fragment (never reaches server logs), is stored
  hashed, expires after 15 minutes and works once. Requests are limited to 5 per 10 minutes per
  address and IP.
- Sessions are an httpOnly `savora_session` cookie holding a random token; only its hash is stored. 30 days.
- Google sign-in is wired but hidden until `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are set.
- The web app proxies `/api/*` to the API, so cookies stay first-party.
- Every organization route checks membership and answers 404 to non-members.
- New owners go through `/[lang]/welcome`: business, first location (EN/AR) and currency. The
  location gets a permanent link (`savora.menu/r/<slug>`) that QR codes will point to.
- Location switcher remembers the choice in a `savora_loc` cookie.
- Scan totals show 0 until Phase 4 fills them in.
- Development database defaults to embedded Postgres (PGlite) because Docker needs WSL; switching to
  Docker is a one-line change in `.env`.

## Phase 2 notes

- Each location has one draft menu: categories and items with names and descriptions in English and
  Arabic (at least one language required; the health check asks for the other), prices in minor units
  of the location's currency, an on-menu switch and an optional photo.
- Publishing freezes what guests can see (available items in non-empty categories) into a numbered
  `menu_versions` row. The Phase 3 guest page reads the latest version, so editing never changes the
  live menu. "Unpublished changes" compares the draft's snapshot with the latest version, so hiding
  and re-showing an item counts as no change.
- Health checks (shared with the API): items on show, names missing a language, categories with
  nothing on show, prices that are zero or 15x away from the menu's median. Only an empty menu blocks
  publishing.
- "Paste your menu" is a predictable rule-based parser: lines ending in a price are items, other lines
  are headings or descriptions, "Name / الاسم" splits languages, Arabic digits are accepted. The owner
  reviews the result before it joins the draft. Phase 7 added AI import from photos and PDFs, which
  uses the same review dialog.
- Photos: up to 8 MB, re-encoded by sharp into a 1600px WebP and a 480px square thumbnail, with
  metadata (including GPS) stripped. Stored in `MEDIA_DIR` (default `~/.savora/media`) and served at
  `/api/media/<id>/{full,thumb}.webp` with a one-year immutable cache. Only the organization that
  uploaded a photo can attach it.
- The demo's Ramallah counter is seeded with the menu from the designs (three dish photos from
  Unsplash), published as v1, then the croissant marked sold out so there is an unpublished change.

## Phase 3 notes

- Guest menu at `/[lang]/r/[slug]` (printed links `/r/<slug>` redirect to the guest's language). It
  reads `GET /public/menu/:slug`, which serves only the latest published version of a live location:
  404 for unknown links, 409 with the place's name for one that hasn't published (the page says it
  is getting its menu ready, and is not indexed). Draft edits never reach guests.
- Layout follows the redesigned guest screen: cover photo (`locations.cover_photo_id`, editable in
  Phase 5; the demo uses the café photo), logo badge, sticky section chips that follow the reader,
  the first dish with a photo as the "Guest favourite", dish rows with photos, one-tap EN/عربي.
  Opening hours, address and Contact/Directions/Order appear once Phase 5 stores them.
- Names without a translation fall back to the other language rather than disappearing.
- QR codes encode `PUBLIC_MENU_ORIGIN/r/<slug>?s=qr`; `?s=qr` lets Phase 4 tell scans from shared
  links (shared links have no parameter). `PUBLIC_MENU_ORIGIN` is read by the web app and defaults to
  `http://localhost:3000`; production sets `https://savora.menu`. Never change a published origin or
  slug: printed codes depend on it.
- Print studio: table card (1200×1800, 4×6 in), window sticker (1800×1800, 6×6 in) and takeaway label
  (1800×1200, 6×4 in), drawn on a canvas with Poppins and Tajawal so the preview is the download.
  Every format is verified end to end by decoding the downloaded PNG. A vector SVG of the code alone
  is offered for print shops.
- Fixed while testing: the locale proxy's matcher had a single-escaped dot, so it only ran for `/`
  and bare links like `/r/saltandstem` returned 404. The theme choice moved from localStorage plus an
  inline script to a `savora-theme` cookie read by the layout (no flash, no inline script).

## Phase 4 notes

- A "scan" is one menu open. The guest page posts it after loading (`/api/public/scan`, a Next route
  handler that passes the visitor's address on, since the `/api` rewrite proxy does not), so link
  previews and pages that never load are not counted. `?s=qr` marks printed-code scans and is then
  removed from the address bar, so a guest sharing the page shares a plain link.
- Privacy: no cookies, no stored IP addresses or user agents. A visitor key (HMAC of address, user
  agent and location, salted with the secret and the date) lets reloads, language switches and
  returns within 30 minutes count once; those raw events are deleted after 48 hours. What lasts is
  `scan_hourly`: counts per location per UTC hour (total, from QR, read in Arabic).
- Not counted: bots and headless browsers, unpublished places, and members of the place's own team
  while signed in.
- Days, "today" and hours follow `locations.timezone` (default `Asia/Hebron`, editable in Phase 5).
  "Today vs typical" compares today so far with the previous 7 days up to the same hour, so mornings
  aren't judged against whole days. The weekend is Friday and Saturday.
- Insights by range: week (busiest day, weekend share, today), month (busiest weekday on average,
  share from the printed code, main reading language), today (busiest hour, today, printed-code
  share). All come from shared, unit-tested functions.
- The chart: gold bars, the busiest in red with a permanent label, dashed average line, tooltips on
  hover and keyboard focus, full spoken labels, a table view, and mirrored time in Arabic.
- The API trusts `x-forwarded-for` only from `TRUST_PROXY` (default: loopback and private networks).
  In production, put the web app behind a proxy that sets the visitor address itself; otherwise a
  client could send a fake one to dodge rate limits or inflate its own counts.
- The demo's live branches get about 60 days of believable history, topped up to the current hour at
  every API start, so the screen never looks stale.

## Phase 5 notes

- Location settings mirror the approved settings design: identity, address & map, hours, brand kit,
  guest actions, a live guest-view preview (EN/عربي), setup health, sticky section nav with status
  dots, and a floating "Unsaved changes" bar (with a leave-page warning).
- The map is real: Leaflet with OpenStreetMap tiles (attribution kept; set `NEXT_PUBLIC_MAP_TILES` to
  a tile provider for production). Click or drag to place the pin; the delivery radius is a ring; the
  organization's other branches show with their distance. Address search goes through the API to
  Nominatim, one request a second, cached, with an identifying user agent, as its usage policy asks.
  Swap `nominatim()` for a paid or self-hosted geocoder in production.
- Not built from the design: "Scan heat" (Savora deliberately records no guest locations), and the
  palette / menu-style pickers, which belong to Menu themes (Phase 7) and link there for now.
- Hours: Sunday-first in storage, Saturday-first on screen (the regional week), 24-hour selects in
  15-minute steps, late nights past midnight, holiday closures, and a per-location time zone. The
  shared `openStatus()` (unit-tested across zones, midnight and holidays) drives both the settings
  preview and the guest menu.
- Guest menu now shows the logo (whole, never cropped), "Open now · until 23:00" or when it opens
  next, the address, buttons only for filled actions (Call or WhatsApp, Directions from the pin,
  Order, Book), and a "Find us" map card that loads only when scrolled to and doesn't trap scrolling.
- Only owners and admins can save settings (403 for editors, who see the screen read-only). Photos
  must belong to the organization. The public link stays locked whatever the name becomes.
- The logo belongs to the brand (shared by its branches); the cover belongs to the location.
- The demo's Ramallah counter is filled in as designed (setup health 67%: logo and order link left
  as suggestions); the Old City kitchen has a pin about 1.8 km away.
- Fixed while testing: browser tests read `document.body.textContent`, which includes Next's
  hydration data (every dictionary string), so some text checks could pass without the text on
  screen. All suites now read visible markup only, and all still pass.

## Phase 6 notes

- One plan table in `packages/shared/src/plans.ts` drives both enforcement (API) and explanation
  (screens). Starter: free, 1 location. Growth: $9 per location a month, up to 3 locations (at 4,
  Multi-location is cheaper). Multi-location: $29 a month, up to 5. Growth and up unlock scan
  analytics, menu import, revision history, Order/Reservation buttons, the full theme gallery and the
  Theme assistant, Virtual trial and priority help; Multi-location adds one shared theme.
- Billing is manual for now, behind a `BillingProvider` interface (`apps/api/src/lib/billing.ts`):
  the owner requests a plan and gets a payment reference (`SV-XXXXX`) and a due invoice
  (`SV-2026-0001`); they pay by bank transfer or cash; Savora staff (emails in `SAVORA_STAFF_EMAILS`)
  confirm it at `/[lang]/staff`, which activates one paid month. Renewing early extends from the end
  of the current period. A card provider will implement the same interface with a checkout URL and a
  webhook instead of the staff click.
- Time is settled by a pure, unit-tested `settle()`: cancelled plans end at the period end; unpaid
  ones get 7 days of grace, then fall back to Starter. The API settles hourly, on `/me` and on the
  billing screen.
- Nothing is ever deleted by a smaller plan: branches beyond the limit pause (oldest stay live;
  guests see "taking a short break", publishing and scan counting stop), analytics shows a locked
  screen with the count of scans already waiting, and saved order/booking links are kept but hidden.
- Only the owner changes the plan; admins can view it. Owners and admins can add locations through
  "+ Add location", which explains the plan that fits when the limit is reached.
- Payment instructions come from `BILLING_BANK_NAME`, `BILLING_ACCOUNT_NAME`, `BILLING_IBAN` and
  `BILLING_CONTACT_PHONE`; while empty, owners are told the team will contact them.
- The demo group is on Multi-location (paid ~18 days ahead, two paid invoices). A development staff
  account, `staff@savora.local`, can sign in and confirm payments.
- Fixed while testing: people with no workspace (including staff) had no way to sign out from the
  onboarding page; it now shows who is signed in, a sign-out button, and a staff link for staff.
  Test runs no longer leave Chrome profiles behind (51 of them had filled the disk).

## Phase 7 notes

- AI runs behind an `AiProvider` interface (`apps/api/src/lib/ai.ts`). Since Phase 9 the one
  implementation goes through OpenRouter (it started on the Anthropic SDK): one key, any model, set by
  `OPENROUTER_MODEL` (default `anthropic/claude-sonnet-5.5`). Requests use strict structured outputs
  built from the same zod schemas, only route to endpoints that honour them
  (`provider.require_parameters`), and the answer is validated again before use. Photos go as data
  URLs, PDFs as `file` parts. Errors map to "declined", "too long" and "busy" (rate limits, 5xx, and
  402 when the OpenRouter account is out of credit). Without `OPENROUTER_API_KEY` the API answers
  503 `ai_unavailable` and the screens say the feature is not switched on yet; everything else works.
- Menu import from photos or a PDF (Growth and up): `POST /locations/:id/menu/read`, up to 5 photos
  (each shrunk to 2,000 px JPEG first) or 1 PDF, 10 MB each. The reading becomes the same shape as
  "Paste your menu" and opens in the same review dialog, with notes on anything unclear and a
  warning when the prices look like another currency. Nothing joins the draft until the owner adds it.
- Menu themes (`/[lang]/app/themes`): nine presets from the design (Auto-match, Roasted editorial and
  After-dark on Starter; six more on Growth), custom themes from the Theme assistant (Growth), and one
  theme for every location at once (Multi-location). A locked theme can still be previewed; applying
  it leads to plans. Themes apply to guests immediately, without publishing.
- Every theme is checked for WCAG AA: body text, descriptions and prices on the card, and button
  labels (white, text or background colour, whichever reads best). Presets pass as shipped (a few
  greys and the citrus orange were darkened slightly); anything the assistant proposes, and anything
  saved, goes through `fixContrast`, which nudges text, description and primary colours only as far
  as needed, keeping their hue. Options it changed say "Adjusted for readability".
- The Theme assistant keeps the conversation in the browser and sends it back each turn (up to 15
  turns), with an optional photo from the organization's uploads, and which option is in the preview
  so "make it darker" refines that one. Three options per answer; 30 AI requests per person per hour.
- Guests: a theme other than Auto-match replaces the menu's colour tokens (Auto-match keeps Savora's,
  including dark mode). Serif themes set Latin headings in a serif; Arabic stays in Tajawal. Prices
  sit on the card without a tinted chip in themed menus, which is the pair the check measures. After
  a downgrade guests see Auto-match, but the owner's choice is kept for when they upgrade again.

## Phase 8 notes

- Research spike (October 2026) on turning photos into a 3D space:
  - KIRI Engine API: real reconstruction (Gaussian splatting) from 20 to 300 photos or a video of up
    to 3 minutes; about $1 per scan, 20 free credits, then a $500 minimum top-up; webhooks; results
    as PLY. The only option found with a documented, self-serve developer API for faithful scans.
  - World Labs World API: about $1.20 per world, $5 minimum, but it generates a world from the
    photos rather than reconstructing the room, so guests could see things that aren't there.
  - Polycam and Luma: API access only on business or enterprise tiers.
  - Self-hosting (COLMAP plus gsplat) needs a GPU server.
  - Viewing: Spark (MIT, by World Labs) or three.js r186's built-in splat renderer show splats in the
    browser, on phones too.
- Built now, with no vendor: a photo tour. Each photo is a scene guests can look around (drag, arrow
  keys); the guided tour plays scenes in order for their own number of seconds with a slow drift
  (none for reduced motion); spots open a dish (name, photo and price from the published menu), a
  note, or another scene. A 3D capture can later replace a scene's photo without changing spots,
  publishing or the guest card.
- Capture quality is measured at upload (`apps/api/src/lib/tour-quality.ts`): sharpness is the
  variance of the Laplacian on a 1024px greyscale copy (below 12 is "blurry"), brightness the mean
  grey level (below 40 "too dark", above 215 "too bright"), and the shorter side must be 720px.
  Calibrated on the demo photos and on blurred and darkened copies of them. Retaking a scene keeps
  its name and spots.
- Uploads: up to 10 photos at a time, 15 MB each, 40 scenes per tour, 12 spots per scene. Scenes
  are stored as 2400px WebP (dish photos stay 1600px). A file that isn't an image stops the whole
  upload, so nothing is half-added.
- Publishing copies the scenes and spots; edits wait for the next publish. It needs two scenes and a
  published menu (the tour opens from it). Photo quality, spots and dish links are advice, not
  blockers. Owners and admins publish; editors can build. On Starter, or when a branch is paused, the
  tour is kept but hidden from guests.
- Guests: a "Virtual trial · Step inside" card under the menu header opens `/[lang]/r/[slug]/tour`;
  "See it on the menu" jumps to the dish (`#d-<id>`). Owners can preview the draft as a guest.

## Phase 9 notes

- Landing page built from the Figma frame "Savora / Landing" (74:44), with its photos and icons
  exported from Figma into `apps/web/public/images/landing/`. Sections are server components in
  `apps/web/src/components/landing/`; English and Arabic copy lives in the dictionaries. The sample
  menus inside it stay in their own language (marked `lang`), as in the design.
- Privacy and Terms pages (`/[lang]/privacy`, `/[lang]/terms`) describe what the app actually does with
  data. They are drafts for legal review; contact details come from `SUPPORT_EMAIL`.
- SEO: metadata base, canonical and hreflang links on public pages, a 1200×630 social preview image,
  `robots.txt` (workspace, staff, auth and API kept out), a sitemap with every published guest menu
  (from `GET /public/sitemap`, refreshed hourly), schema.org `SoftwareApplication` on the landing page
  and `Restaurant` with its full `Menu` on guest menus. Private areas also send `noindex`.
- Accessibility: axe-core (WCAG 2.1 AA) on 24 page states, light and dark, now reports nothing. Fixes:
  muted text `#757575` → `#6B6B6B`, red tint `#FDEDED` → `#FEF3F3`, green `#2E7D53` → `#2B774F`,
  a `gold-ink` token for gold text on light surfaces, and a `brand-fill` token: dark mode lightens the
  brand red for red text, which white text can't sit on, so buttons and badges keep `#DB1A1A`. Faded
  (opacity) text replaced with muted colours; the guest language pill's name now includes its text.
- Performance (production build, phone, 1.6 Mbps / 150 ms, 4× CPU): guest menu LCP ≈ 1.9 s, landing
  2.1–2.6 s warm, no layout shift. Public pages dropped from 238 KB to 144 KB of JavaScript by keeping
  the validation library out of them (`@savora/shared/locale` and `@savora/shared/format` sub-paths for
  browser code), the hero's entrance animation was removed, and an unused font weight dropped.
- Monitoring: `/api/health` on the web app reports the web build and the API and database (503 when
  either is down); API errors are logged with the request id and answered without internals; web
  server errors are one JSON line each (`instrumentation.ts`). Security headers on every page.
- Production safety: the API refuses to start with a short session secret, an http origin, PGlite, the
  demo seed, or no email service. Sign-in links go out over SMTP (`SMTP_URL`), any provider.
- Deployment: `Dockerfile.api`, `Dockerfile.web` (Next standalone), `docker-compose.prod.yml` with
  Postgres and Caddy (automatic HTTPS), `.env.production.example`; runbook in `docs/DEPLOY.md`. The
  Docker files have not been built here (no Docker on this machine): the first build happens on the
  server.
- The `/[lang]/design` component showcase answers 404 in production.
