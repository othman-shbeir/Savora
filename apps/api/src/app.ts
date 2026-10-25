import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import type { Db } from '@savora/db';
import { sql } from 'drizzle-orm';
import Fastify, { type FastifyError } from 'fastify';
import { registerSessions } from './auth/session';
import { spaceBuilderKind, type Env } from './env';
import { openRouterProvider, type AiProvider } from './lib/ai';
import { manualProvider } from './lib/billing';
import { nominatim, type Geocoder } from './lib/geocode';
import { diskStore, MAX_UPLOAD_BYTES, type MediaStore } from './lib/media';
import { demoSpaceBuilder, diskModelStore, kiriSpaceBuilder, type ModelStore, type SpaceBuilder } from './lib/space';
import { consoleMailer, smtpMailer, type Mailer } from './mailer';
import { authRoutes } from './routes/auth';
import { billingRoutes } from './routes/billing';
import { menuRoutes } from './routes/menu';
import { publicRoutes } from './routes/public';
import { scanRoutes } from './routes/scans';
import { settingsRoutes } from './routes/settings';
import { spaceRoutes } from './routes/space';
import { themeRoutes } from './routes/themes';
import { tourRoutes } from './routes/tour';
import { workspaceRoutes } from './routes/workspace';

/** Builds the API without listening, so tests can drive it with app.inject(). */
export async function buildApp(
  env: Env,
  db: Db,
  opts: { mailer?: Mailer; store?: MediaStore; clock?: () => Date; geocode?: Geocoder; ai?: AiProvider | null; models?: ModelStore; builder?: SpaceBuilder | null } = {},
) {
  const app = Fastify({ logger: env.NODE_ENV === 'test' ? false : { level: 'info' }, trustProxy: env.TRUST_PROXY.split(',').map((s) => s.trim()) });
  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
  await app.register(cookie, { secret: env.SESSION_SECRET });
  // Limits apply only to routes that opt in (sign-in links); everything else is unlimited.
  await app.register(rateLimit, { global: false, hook: 'preHandler' }); // after body parsing, so keys can use the email
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 } });
  registerSessions(app, db);

  // Basic hardening for every response; the web app adds the page-level headers.
  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'strict-origin-when-cross-origin');
    reply.header('x-frame-options', 'DENY');
  });

  // Unexpected errors are logged with the request id and answered without internals.
  app.setErrorHandler((err, req, reply) => {
    const error = err as FastifyError;
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    if (status >= 500) {
      req.log.error({ err: error, reqId: req.id, url: req.url, method: req.method }, 'request failed');
      return reply.code(status).send({ error: 'internal', reqId: req.id });
    }
    return reply.code(status).send({ error: error.code === 'FST_ERR_CTP_BODY_TOO_LARGE' ? 'too_large' : 'invalid', message: error.message });
  });

  const started = Date.now();
  app.get('/health', async (_req, reply) => {
    const base = { version: env.APP_VERSION, uptimeS: Math.round((Date.now() - started) / 1000) };
    try {
      await db.execute(sql`select 1`);
      return reply.header('cache-control', 'no-store').send({ ok: true, db: 'up', ...base });
    } catch (e) {
      app.log.error({ err: e }, 'health: database unreachable');
      return reply.code(503).header('cache-control', 'no-store').send({ ok: false, db: 'down', ...base });
    }
  });

  authRoutes(app, db, env, opts.mailer ?? (env.SMTP_URL ? smtpMailer(env.SMTP_URL, env.MAIL_FROM, app.log) : consoleMailer(app.log)));
  const clock = opts.clock ?? (() => new Date());
  const { isStaff } = billingRoutes(app, db, env, manualProvider(env), clock);
  const ai = opts.ai !== undefined ? opts.ai : env.OPENROUTER_API_KEY ? openRouterProvider(env.OPENROUTER_API_KEY, { model: env.OPENROUTER_MODEL, referer: env.WEB_ORIGIN }) : null;
  workspaceRoutes(app, db, { isStaff, clock, ai: Boolean(ai) });
  const store = opts.store ?? diskStore(env.MEDIA_DIR || undefined);
  menuRoutes(app, db, store);
  publicRoutes(app, db);
  scanRoutes(app, db, env, clock);
  settingsRoutes(app, db, opts.geocode ?? nominatim(env.WEB_ORIGIN));
  themeRoutes(app, db, store, ai);
  const defaults = spaceServices(env);
  const builder = opts.builder !== undefined ? opts.builder : defaults.builder;
  const models = opts.models ?? defaults.models;
  tourRoutes(app, db, store, Boolean(builder));
  spaceRoutes(app, db, { store, models, builder });
  return app;
}

/** The service that builds 3D walk-throughs (if any) and where their models are kept. */
export function spaceServices(env: Env): { builder: SpaceBuilder | null; models: ModelStore } {
  const kind = spaceBuilderKind(env);
  return {
    builder: kind === 'kiri' ? kiriSpaceBuilder(env.KIRI_API_KEY) : kind === 'demo' ? demoSpaceBuilder() : null,
    models: diskModelStore(env.MEDIA_DIR || undefined),
  };
}
