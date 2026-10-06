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
| 6 | Plans & billing | Plan entitlements and locks (Starter / Growth / Multi-location), payment provider; Plans & billing screen | Next |
| 7 | AI features | Menu import from photo or PDF, Theme gallery, Theme assistant with contrast checks; Menu themes screens | |
| 8 | Virtual trial | Research spike on a photos-to-3D service, then upload, quality checks, spots, guided tour; Virtual trial screen | |
| 9 | Launch | Landing page, SEO, accessibility and performance passes, monitoring, production deploy | |

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
  reviews the result before it joins the draft. Phase 7 adds AI import from photos and PDFs; its card
  shows as coming soon until then.
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
