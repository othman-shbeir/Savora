# @savora/db

The database layer: the Drizzle ORM schema, the SQL migrations generated from it, and a client that
connects to either real Postgres or embedded PGlite with the same API.

```ts
import { createDb, schema } from '@savora/db';

const { db, migrate, close } = createDb(process.env.DATABASE_URL!);
await migrate(); // applies migrations/ in order; safe to run on every start
```

| `DATABASE_URL` | Client |
|---|---|
| `postgres://user:pass@host:5432/db` | `postgres` (postgres.js), pool of 10. Production and Docker. |
| `pglite://local` | Embedded Postgres in `~/.savora/pglite`. Development default. |
| `pglite://<folder>` / `pglite://memory` | Embedded, in a folder or in memory (tests). |

## Changing the schema

```mermaid
flowchart LR
  E["Edit src/schema.ts"] --> G["npm run db:generate<br/>(drizzle-kit)"]
  G --> S["New SQL file in migrations/<br/>review it, commit it"]
  S --> A["API start-up runs migrate()"]
  A --> D[("Database up to date")]
```

- Migrations are append-only and run before the API listens; there are no down-migrations, so fix
  forward.
- Review the generated SQL before committing it: renames can show up as drop-and-add.
- Shapes stored as JSON (menu snapshots, hours, theme colours, tour snapshots) are typed with types
  from `@savora/shared`.

## Data model

```mermaid
erDiagram
  users ||--o{ sessions : "signs in with"
  users ||--o{ oauth_accounts : "links"
  users ||--o{ memberships : has
  organizations ||--o{ memberships : "has members"
  organizations ||--o{ brands : owns
  organizations ||--o{ locations : owns
  organizations ||--o{ media : uploads
  organizations ||--o{ custom_themes : saves
  organizations ||--o| subscriptions : "pays for"
  organizations ||--o{ plan_requests : makes
  organizations ||--o{ invoices : receives
  plan_requests ||--o| invoices : "billed by"
  brands ||--o{ locations : "has branches"
  locations ||--o{ menu_categories : has
  menu_categories ||--o{ menu_items : contains
  locations ||--o{ menu_versions : publishes
  locations ||--o{ scan_events : "counts (48 h)"
  locations ||--o{ scan_hourly : "counts (kept)"
  locations ||--o| tours : publishes
  locations ||--o{ tour_scenes : has
  tour_scenes ||--o{ tour_spots : has
  tour_spots }o--o| menu_items : "opens dish"
  tour_spots }o--o| tour_scenes : "walks to"
  media ||--o{ menu_items : "dish photo"
  media ||--o{ tour_scenes : "scene photo"

  organizations {
    uuid id PK
    text name_en
    plan plan "starter | growth | multi_location"
  }
  memberships {
    uuid organization_id PK
    uuid user_id PK
    member_role role "owner | admin | editor"
  }
  locations {
    uuid id PK
    text slug UK "the QR link"
    location_status status "draft | live"
    text theme_ref "auto | preset | custom:uuid"
  }
  menu_versions {
    uuid id PK
    int version
    jsonb content "snapshot guests see"
  }
```

Plus `login_tokens` (hashed one-time sign-in links). Notes:

- **Draft and published:** owners edit `menu_categories` and `menu_items`; publishing copies them into
  an immutable `menu_versions` snapshot, which is all guests ever read. Tours work the same way
  (`tours.published`).
- **Prices** are integers in minor units (agorot, fils, cents) with the location's currency.
- **Names** have English and Arabic columns; at least one is required.
- **Deletes cascade** from an organization down; a deleted dish or scene also removes the tour spots
  that pointed at it.
- **Scans:** `scan_events` holds de-duplication keys for 48 hours; `scan_hourly` keeps the counts.
