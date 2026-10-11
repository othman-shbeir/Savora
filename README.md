# Savora

**Bilingual (English and Arabic) QR menus for cafés and restaurants.** Owners turn a photo or text
menu into a polished guest menu, print one QR code per table, and change dishes and prices without
ever reprinting it. Guests scan and read the menu in their language, right to left when it's Arabic.

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Scripts](#scripts)
- [Testing](#testing)
- [Deployment](#deployment)
- [Conventions](#conventions)
- [Documentation](#documentation)

## What it does

| For | Features |
|---|---|
| **Owners** | Menu editor (EN/AR, photos, availability), paste or photo/PDF import (AI), publish with version history, branded QR codes and print cards, scan analytics, location settings (hours, map, delivery radius, order and booking links), menu themes with an AI Theme assistant, a Virtual trial (photo walk-through with tappable dishes), several locations per brand, team roles |
| **Guests** | A fast, accessible menu at `/{en,ar}/r/<slug>`: one-tap language switch, opening hours, directions, the place's theme, and the Virtual trial |
| **Savora staff** | A payments page to confirm bank transfers and cash, which activates plans |

Plans: **Starter** (free, one location), **Growth** ($9 per location a month, up to three) and
**Multi-location** ($29 a month, up to five). Billing is manual for now, behind a provider-neutral
interface; see [docs/ROADMAP.md](docs/ROADMAP.md) (Phase 6).

## Architecture

A Next.js web app and a Fastify API in one npm-workspaces monorepo, sharing TypeScript types and
rules. The browser only ever talks to the web app's origin; `/api/*` is rewritten to the API, so the
session cookie stays first-party.

```mermaid
flowchart LR
  subgraph Clients
    G["Guest phone<br/>(scans the QR)"]
    O["Owner / staff browser"]
  end

  subgraph Server["One server (Docker Compose)"]
    C["Caddy<br/>HTTPS"]
    W["Web<br/>Next.js 16"]
    A["API<br/>Fastify 5"]
    P[("Postgres 17")]
    M[("Media volume<br/>WebP photos")]
  end

  subgraph External["External services"]
    OR["OpenRouter<br/>(AI models)"]
    SM["SMTP provider<br/>(sign-in emails)"]
    GG["Google OAuth"]
    OSM["OpenStreetMap<br/>tiles + Nominatim"]
  end

  G & O -->|HTTPS| C --> W
  W -->|"/api/* rewrite<br/>+ server-side fetch"| A
  A --> P
  A --> M
  A -.->|optional| OR
  A --> SM
  A -.->|optional| GG
  A -.->|address search| OSM
  G & O -.->|map tiles| OSM
```

### A guest opens a menu

```mermaid
sequenceDiagram
  autonumber
  participant Guest as Guest's phone
  participant Web as Web (Next.js)
  participant API as API (Fastify)
  participant DB as Postgres

  Guest->>Web: GET /r/saltandstem (from the QR code)
  Web-->>Guest: 307 to /ar/r/saltandstem (browser prefers Arabic)
  Guest->>Web: GET /ar/r/saltandstem
  Web->>API: GET /public/menu/saltandstem
  API->>DB: latest published version, theme, tour
  API-->>Web: menu JSON (cached 30 s at the edge)
  Web-->>Guest: server-rendered page in Arabic, RTL
  Guest->>Web: POST /api/public/scan (after load, no cookies)
  Web->>API: scan + visitor address
  API->>DB: count once per visitor per 30 min, hourly totals
```

Guests are never tracked with cookies; a daily-salted one-way key de-duplicates reloads and is
deleted after 48 hours (see the Privacy page and Phase 4 notes).

## Repository layout

```
savora-app/
├─ apps/
│  ├─ web/            Next.js 16 app: landing, owner workspace, guest menu   → apps/web/README.md
│  └─ api/            Fastify API: auth, menus, billing, AI, tours           → apps/api/README.md
├─ packages/
│  ├─ db/             Drizzle schema, SQL migrations, Postgres/PGlite client → packages/db/README.md
│  └─ shared/         Types, validation, plan rules, formatting (web + API)  → packages/shared/README.md
├─ deploy/            Caddyfile for HTTPS
├─ docs/              ROADMAP.md (phases and decisions), DEPLOY.md (runbook)
├─ docker-compose.yml        Optional local Postgres for development
├─ docker-compose.prod.yml   Production: Postgres, API, web, Caddy
└─ Dockerfile.api / Dockerfile.web
```

```mermaid
flowchart TD
  web["@savora/web"] --> shared["@savora/shared"]
  api["@savora/api"] --> db["@savora/db"]
  api --> shared
  db --> shared
```

## Getting started

**Requirements:** Node 22 or newer. Docker is optional (the default database is embedded).

```bash
npm install
cp .env.example .env       # then fill in what you need (see Configuration)
npm run dev:api            # API on http://localhost:4000 (health: /health)
npm run dev:web            # Web on http://localhost:3000
```

On first start the API runs the database migrations and, with `SEED_DEMO=1`, creates a demo
workspace: **Salt & Stem Group** with three locations and a published menu.

| Try | How |
|---|---|
| Owner workspace | Sign in as `nadia@saltandstem.co`. In development the sign-in page shows the link instead of emailing it. |
| Guest menu | http://localhost:3000/r/saltandstem |
| Staff payments | Sign in as `staff@savora.local` (listed in `SAVORA_STAFF_EMAILS`), then open `/en/staff`. |

### Database options

| `DATABASE_URL` | What you get |
|---|---|
| `pglite://local` (default) | Embedded Postgres in `~/.savora/pglite`, kept out of synced folders. Nothing to install. |
| `postgres://savora:savora@localhost:5433/savora` | Real Postgres 17 in Docker: `npm run db:up` (on Windows Docker Desktop needs WSL). |
| `pglite://memory` | In memory; used by the tests. |

## Configuration

All settings are environment variables, read from the root `.env` by both apps (the API validates
them at start-up and stops with a clear message if something is missing). The full list with
comments is in [.env.example](.env.example); production values in
[.env.production.example](.env.production.example).

| Setting | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | API | Postgres or PGlite (see above). |
| `SESSION_SECRET` | API | Signs cookies. 32+ random characters in production. |
| `WEB_ORIGIN` | API | The site's address, for links in emails and CORS. `https://` in production. |
| `SMTP_URL`, `MAIL_FROM` | API | Sign-in emails. Empty in development prints them to the API console; required in production. |
| `SAVORA_STAFF_EMAILS` | API | Who can confirm payments. |
| `BILLING_*` | API | Bank and contact details owners see when paying. |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | API | AI menu reading and Theme assistant. Empty key: those features say "not switched on yet". |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | API | Google sign-in. Redirect URI: `<site>/api/auth/google/callback`. |
| `NEXT_PUBLIC_PLANS_ENABLED` | both | `false` switches plans off for testing (everything unlocked). On unless set to `false`. |
| `PUBLIC_MENU_ORIGIN`, `SITE_ORIGIN` | web | Where QR codes point and canonical links. Set before anyone prints a code. |
| `NEXT_PUBLIC_MAP_TILES` | web | Map tile URL template for production (OpenStreetMap's public tiles otherwise). |
| `EXAMPLE_MENU_SLUG`, `SUPPORT_EMAIL` | web | The landing page's live example; the contact on Privacy and Terms. |

> **Testing mode.** `NEXT_PUBLIC_PLANS_ENABLED=false` unlocks every paid feature for every place, with
> no location limit and nothing paused. Restart both apps after changing it, and keep it `true` in
> production.

## Scripts

Run from the repository root.

| Command | Does |
|---|---|
| `npm run dev:web` / `npm run dev:api` | Start the web app / API with live reload |
| `npm run typecheck` | TypeScript in every workspace |
| `npm run lint` | ESLint (web) |
| `npm test` | Unit and API tests (Vitest) |
| `npm run db:generate` | Create a migration after changing `packages/db/src/schema.ts` |
| `npm run db:migrate` | Apply migrations without starting the API |
| `npm run db:up` / `npm run db:down` | Start / stop the optional Docker Postgres |

## Testing

```bash
npm test
```

- **`packages/shared`**: pure rules (plans and billing periods, contrast checks, photo quality,
  analytics, price parsing).
- **`apps/api`**: the real API against real Postgres (PGlite in memory) with the real migrations, via
  `app.inject()`. External services (email, AI, geocoding) are swapped for in-memory stand-ins.

Before a release also run `npm run typecheck`, `npm run lint` and a production build
(`npm run build -w @savora/web`).

## Deployment

One Linux server running Docker Compose. Caddy terminates HTTPS and renews certificates itself.

```mermaid
flowchart LR
  I((Internet)) -->|":80 / :443"| C[caddy]
  C --> W["web :3000"]
  W --> A["api :4000"]
  A --> P[("db: postgres")]
  A --- V[("media volume")]
  P --- D[("db-data volume")]
```

Step by step, including backups, monitoring and updates: **[docs/DEPLOY.md](docs/DEPLOY.md)**.

## Conventions

- **Text:** every user-facing string lives in `apps/web/src/app/[lang]/dictionaries/{en,ar}.json`.
  Both files have the same keys; Arabic adds plural forms.
- **Right to left:** use logical CSS (`ms-`, `pe-`, `start-`), never left/right, so layouts mirror.
  Digits stay Latin (`ar-u-nu-latn`).
- **Colours:** use the tokens in `apps/web/src/app/globals.css` (`bg-surface`, `text-muted`,
  `bg-brand-fill`…). They switch for dark mode and meet WCAG AA contrast.
- **Browser bundles:** client components import from `@savora/shared/locale` or
  `@savora/shared/format`, not the package root, to keep validation code off public pages.
- **Next.js 16** differs from older versions: read `node_modules/next/dist/docs/` before using a new
  API.
- **Secrets** stay in `.env` files, which are never committed.

## Documentation

| Document | Contents |
|---|---|
| [docs/ROADMAP.md](docs/ROADMAP.md) | The ten phases, what each delivered, and the decisions behind them |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Production runbook |
| [apps/web/README.md](apps/web/README.md) | Pages, rendering, translations, themes |
| [apps/api/README.md](apps/api/README.md) | Endpoints, sign-in, plans and billing, AI, media |
| [packages/db/README.md](packages/db/README.md) | Data model and migrations |
| [packages/shared/README.md](packages/shared/README.md) | Shared rules and how to import them |

## Status

All ten phases are built (see the roadmap). Before launch: a server, a domain and an email service;
legal review of the Privacy and Terms pages; and licences for three Unsplash+ photos on the landing
page. No licence has been chosen for this code yet; all rights reserved.
