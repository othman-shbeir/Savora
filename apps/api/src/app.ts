import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import type { Db } from '@savora/db';
import { sql } from 'drizzle-orm';
import Fastify from 'fastify';
import { registerSessions } from './auth/session';
import type { Env } from './env';
import { manualProvider } from './lib/billing';
import { nominatim, type Geocoder } from './lib/geocode';
import { diskStore, MAX_UPLOAD_BYTES, type MediaStore } from './lib/media';
import { consoleMailer, type Mailer } from './mailer';
import { authRoutes } from './routes/auth';
import { billingRoutes } from './routes/billing';
import { menuRoutes } from './routes/menu';
import { publicRoutes } from './routes/public';
import { scanRoutes } from './routes/scans';
import { settingsRoutes } from './routes/settings';
import { workspaceRoutes } from './routes/workspace';

/** Builds the API without listening, so tests can drive it with app.inject(). */
export async function buildApp(env: Env, db: Db, opts: { mailer?: Mailer; store?: MediaStore; clock?: () => Date; geocode?: Geocoder } = {}) {
  const app = Fastify({ logger: env.NODE_ENV === 'test' ? false : { level: 'info' }, trustProxy: env.TRUST_PROXY.split(',').map((s) => s.trim()) });
  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
  await app.register(cookie, { secret: env.SESSION_SECRET });
  // Limits apply only to routes that opt in (sign-in links); everything else is unlimited.
  await app.register(rateLimit, { global: false, hook: 'preHandler' }); // after body parsing, so keys can use the email
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 } });
  registerSessions(app, db);

  app.get('/health', async (_req, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { ok: true, db: 'up' };
    } catch {
      return reply.code(503).send({ ok: false, db: 'down' });
    }
  });

  authRoutes(app, db, env, opts.mailer ?? consoleMailer(app.log));
  const clock = opts.clock ?? (() => new Date());
  const { isStaff } = billingRoutes(app, db, env, manualProvider(env), clock);
  workspaceRoutes(app, db, { isStaff, clock });
  menuRoutes(app, db, opts.store ?? diskStore(env.MEDIA_DIR || undefined));
  publicRoutes(app, db);
  scanRoutes(app, db, env, clock);
  settingsRoutes(app, db, opts.geocode ?? nominatim(env.WEB_ORIGIN));
  return app;
}
