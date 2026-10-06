import { createDb } from '@savora/db';
import { buildApp } from './app';
import { loadEnv } from './env';
import { diskStore } from './lib/media';
import { settleAll } from './lib/billing';
import { purgeScanEvents } from './routes/scans';
import { seedDemo, seedDemoBilling, seedDemoCover, seedDemoMenu, seedDemoScans, seedDemoSettings } from './seed';

const env = loadEnv();
const { db, migrate, close } = createDb(env.DATABASE_URL);

// Migrations run at start-up so a fresh checkout works with one command.
await migrate();
const store = diskStore(env.MEDIA_DIR || undefined);
if (env.SEED_DEMO) {
  if (await seedDemo(db)) console.log('Seeded demo workspace for nadia@saltandstem.co');
  if (await seedDemoMenu(db, store)) console.log('Seeded demo menu for the Ramallah counter');
  if (await seedDemoCover(db, store)) console.log('Seeded demo cover photo for the Ramallah counter');
  if (await seedDemoSettings(db)) console.log('Seeded demo location settings');
  if (await seedDemoBilling(db)) console.log('Seeded demo billing (Multi-location)');
  const hours = await seedDemoScans(db);
  if (hours) console.log(`Seeded ${hours} hours of demo scans`);
}

const app = await buildApp(env, db, { store });

// Raw scan events are only kept long enough to spot repeat opens; counts live on in scan_hourly.
await purgeScanEvents(db);
await settleAll(db);
setInterval(() => {
  purgeScanEvents(db).catch((e) => app.log.error(e));
  settleAll(db).catch((e) => app.log.error(e));
}, 3_600_000).unref();

const shutdown = async () => {
  await app.close();
  await close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
