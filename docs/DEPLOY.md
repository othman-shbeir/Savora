# Deploying Savora

One server runs everything with Docker Compose: Postgres, the API, the web app, and Caddy, which
serves HTTPS with a certificate it renews itself. Files: `docker-compose.prod.yml`,
`Dockerfile.api`, `Dockerfile.web`, `deploy/Caddyfile`, `.env.production.example`.

## Before the first deploy

1. **A server**: any Linux VPS with 2 GB of RAM or more and Docker installed (Docker Engine with the
   Compose plugin). Open ports 80 and 443.
2. **The domain**: point an `A` record for the domain (and `www`) at the server's IP. Caddy can only
   get the HTTPS certificate once DNS resolves to the server.
3. **Email**: an SMTP service for sign-in links (Resend, Postmark, Amazon SES, Mailgun…). Verify the
   sending domain with the provider (SPF/DKIM records), or links land in spam. The API refuses to
   start in production without `SMTP_URL`.
4. **Legal**: have the Privacy and Terms pages (`apps/web/src/content/legal.ts`) reviewed for the
   markets you serve, and set `SUPPORT_EMAIL` so they show a contact.
5. **AI (optional)**: create an OpenRouter key and add credit. In OpenRouter's privacy settings,
   turn off providers that may train on or retain prompts, as the Privacy page promises.
6. **Photos**: the landing page uses photos from the design. Three of them (Honey Toast, Pistachio
   Tartine, Cardamom Cake) come from Unsplash+, which needs a paid licence for commercial use; license
   them or replace them in `apps/web/public/images/landing/`.

## First deploy

```bash
git clone <repo> savora && cd savora
cp .env.production.example .env.production   # fill in every value
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

The API runs the database migrations on start-up. Then:

- Open `https://<domain>/api/health`: it should answer `{"ok":true, … "api":{"ok":true,"db":"up"}}`.
- Sign in with an address listed in `SAVORA_STAFF_EMAILS` to confirm the staff page works.
- Create a real place, publish its menu, and set `EXAMPLE_MENU_SLUG` to its slug so the landing
  page's "Open a live example" links to it (restart `web` after changing it).
- Submit `https://<domain>/sitemap.xml` in Google Search Console.

## Updating

```bash
git pull
APP_VERSION=$(git rev-parse --short HEAD) docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Migrations are additive and run before the API starts listening. To roll back the code, check out
the previous commit and run the same command; a migration that already ran stays (Drizzle has no
down-migrations), so roll forward with a fix if a migration itself is the problem.

## Switching plans on or off

`NEXT_PUBLIC_PLANS_ENABLED` is read by the API at start-up but baked into the web app when it is
built, so after changing it in `.env.production` run the update command above (with `--build`), not a
plain restart. Keep it `true` in production.

## Backups

Two things hold data: the `db-data` volume (Postgres) and the `media` volume (uploaded photos).

```bash
# Nightly, e.g. from cron. Keep copies off the server too.
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U savora -Fc savora > savora-$(date +%F).dump
docker run --rm -v savora_media:/media -v "$PWD":/out alpine tar czf /out/media-$(date +%F).tgz -C /media .
```

Restore: `pg_restore -U savora -d savora --clean` inside the `db` container, and untar into the
`media` volume. Test a restore before you need one.

## Monitoring

- **Uptime**: point an uptime monitor (UptimeRobot, Better Stack…) at `https://<domain>/api/health`
  every minute. It answers 503 when the API or the database is down, and reports `version`.
- **Logs**: both apps log one JSON object per line. `docker compose logs -f api web`; server errors
  are `"level":"error"` (web) or `"level":50` (API) with a request id. Ship them to any log service
  that reads Docker logs if you want alerts.
- **What guests feel**: the guest menu is the page that matters. Check it on a phone after each
  deploy.

## Settings reference

All settings are environment variables; `.env.production.example` lists them with notes. The API
refuses to start in production with unsafe values: a short `SESSION_SECRET`, an `http://` origin,
PGlite instead of Postgres, the demo seed, or no `SMTP_URL`.
