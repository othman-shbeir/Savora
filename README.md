# Savora

Bilingual (English / Arabic) QR menus for cafés and restaurants. See [docs/ROADMAP.md](docs/ROADMAP.md)
for the phase plan and decisions.

## Layout

```
apps/web        Next.js 16 web app (owner workspace + guest menu)
apps/api        Fastify API
packages/db     Drizzle schema, migrations and database client
packages/shared Types, validation and locale helpers shared by web and API
```

## Getting started

Requirements: Node 22 or newer. Docker Desktop is optional.

```bash
npm install
cp .env.example .env        # already done once; edit if needed
npm run dev:api             # http://localhost:4000/health
npm run dev:web             # http://localhost:3000
```

The database is set by `DATABASE_URL` in `.env`:

- `pglite://local` (default): embedded Postgres stored in `~/.savora/pglite`, kept out of OneDrive.
  Nothing to install.
- `postgres://savora:savora@localhost:5433/savora`: real Postgres 17 in Docker (`npm run db:up`).
  Docker Desktop needs WSL on Windows (`wsl --install` in an admin terminal, then restart).

Uploaded dish photos go to `MEDIA_DIR` (default `~/.savora/media`).

Migrations run when the API starts. With `SEED_DEMO=1` the API also creates the demo workspace
(Salt & Stem Group, three locations, and a published menu for the Ramallah counter). Sign in as `nadia@saltandstem.co`: in development the
sign-in page shows the link instead of emailing it.

Google sign-in appears once `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
(redirect URI: `http://localhost:3000/api/auth/google/callback`).

Guest menus live at `http://localhost:3000/r/<slug>` (the demo: `/r/saltandstem`). QR codes point at
`PUBLIC_MENU_ORIGIN`, an environment variable of the web app that defaults to `http://localhost:3000`;
set it to `https://savora.menu` in production before anyone prints a code.

Maps use OpenStreetMap tiles by default, fine for development. For production set
`NEXT_PUBLIC_MAP_TILES` (web app) to a tile provider's URL template, and replace the Nominatim
address search in `apps/api/src/lib/geocode.ts` with a paid or self-hosted geocoder.

## Checks

```bash
npm run typecheck
npm run lint
npm test
```

## Conventions

- Every user-facing string lives in `apps/web/src/app/[lang]/dictionaries/{en,ar}.json`.
- Use logical CSS (`ms-`, `pe-`, `start-`) rather than left/right so layouts mirror in Arabic.
- Colours come from the tokens in `apps/web/src/app/globals.css` (`bg-surface`, `text-muted`, `bg-brand`…);
  they switch for dark mode automatically.
- Next.js 16 differs from older versions: read `node_modules/next/dist/docs/` before using a new API.
