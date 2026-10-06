import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { migrate as migratePg } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema';

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

/**
 * Connects to Postgres. Two forms of DATABASE_URL:
 *  - postgres://user:pass@host:port/db  real Postgres (Docker locally, managed in production)
 *  - pglite://local                   embedded Postgres in ~/.savora/pglite (outside synced folders)
 *  - pglite://<dir> or pglite://memory  embedded Postgres in a folder, or in memory for tests
 * Both expose the same Drizzle API and run the same migrations.
 */
export function createDb(url: string) {
  if (url.startsWith('pglite:')) {
    const target = url.slice('pglite://'.length);
    const dir = target === 'local' ? path.join(homedir(), '.savora', 'pglite') : path.resolve(target);
    if (target !== 'memory') mkdirSync(dir, { recursive: true });
    const client = target === 'memory' ? new PGlite() : new PGlite(dir);
    const db = drizzlePglite(client, { schema });
    return {
      db: db as unknown as PgDb,
      migrate: () => migratePglite(db, { migrationsFolder }),
      close: () => client.close(),
    };
  }
  const client = postgres(url, { max: 10 });
  const db = drizzlePg(client, { schema });
  return { db, migrate: () => migratePg(db, { migrationsFolder }), close: () => client.end({ timeout: 5 }) };
}

type PgDb = ReturnType<typeof drizzlePg<typeof schema>>;
export type Db = PgDb;

export { schema };
