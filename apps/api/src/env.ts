import { z } from 'zod';

// Fails fast at start-up when configuration is missing, instead of at the first request.
const Env = z.object({
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  SESSION_SECRET: z.string().min(16),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Shown by /health so monitors can tell which build is running (e.g. the git commit). */
  APP_VERSION: z.string().optional().default('dev'),
  SEED_DEMO: z
    .string()
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  /** Who may tell the API a visitor's address (x-forwarded-for): the web app on this machine or a
   *  private network by default. Never "true" on a public address, or anyone could fake it. */
  TRUST_PROXY: z.string().default('loopback,linklocal,uniquelocal'),
  /** Savora team members who can confirm payments and activate plans (comma-separated emails). */
  SAVORA_STAFF_EMAILS: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)),
  /** How owners pay while billing is manual. Shown on the billing screen; empty ones are left out. */
  BILLING_BANK_NAME: z.string().optional().default(''),
  BILLING_ACCOUNT_NAME: z.string().optional().default(''),
  BILLING_IBAN: z.string().optional().default(''),
  BILLING_CONTACT_PHONE: z.string().optional().default(''),
  /** Outgoing email (sign-in links). Empty prints emails to the API console, which only suits development. */
  SMTP_URL: z.string().optional().default(''),
  /** The sender, e.g. "Savora <hello@savora.menu>". */
  MAIL_FROM: z.string().optional().default('Savora <no-reply@savora.menu>'),
  /** Uploaded photos. Empty means ~/.savora/media. */
  MEDIA_DIR: z.string().optional().default(''),
  /** Turns on the AI features (reading a menu from photos, the Theme assistant). Empty: they say "unavailable". */
  OPENROUTER_API_KEY: z.string().optional().default(''),
  /** Any OpenRouter model that takes images and PDFs and supports structured outputs. Empty: the default in lib/ai.ts. */
  OPENROUTER_MODEL: z.string().optional().default(''),
  /** Builds 3D walk-throughs from owners' videos (KIRI Engine, docs.kiriengine.app). Empty: in
   *  development a stand-in builds a sample room; in production the 3D option says "unavailable". */
  KIRI_API_KEY: z.string().optional().default(''),
  /** "kiri", "demo" (the stand-in) or "off". Empty picks kiri with a key, demo in development. */
  SPACE_BUILDER: z.enum(['', 'kiri', 'demo', 'off']).optional().default(''),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
});

export type Env = z.infer<typeof Env>;

/** Production refuses settings that are fine on a laptop but unsafe or lossy on a server. */
const Production = Env.superRefine((e, ctx) => {
  if (e.NODE_ENV !== 'production') return;
  const fail = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (e.SESSION_SECRET.length < 32) fail('SESSION_SECRET', 'use at least 32 random characters in production');
  if (!e.WEB_ORIGIN.startsWith('https://')) fail('WEB_ORIGIN', 'must be https:// in production (cookies are Secure)');
  if (!/^postgres(ql)?:\/\//.test(e.DATABASE_URL)) fail('DATABASE_URL', 'production needs a real Postgres database (postgres://…), not PGlite');
  if (e.SEED_DEMO) fail('SEED_DEMO', 'the demo workspace must not be seeded in production');
  if (!e.SMTP_URL) fail('SMTP_URL', 'production needs an email service, or owners never get their sign-in links');
  if (e.SPACE_BUILDER === 'demo') fail('SPACE_BUILDER', 'the demo stand-in builds a sample room, not the owner’s place');
  if (e.SPACE_BUILDER === 'kiri' && !e.KIRI_API_KEY) fail('KIRI_API_KEY', 'SPACE_BUILDER=kiri needs an API key');
});

export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => Production.parse(source);

export const googleEnabled = (env: Env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

/** Which service builds 3D walk-throughs, if any. */
export function spaceBuilderKind(env: Env): 'kiri' | 'demo' | null {
  if (env.SPACE_BUILDER === 'off') return null;
  if (env.SPACE_BUILDER) return env.SPACE_BUILDER;
  if (env.KIRI_API_KEY) return 'kiri';
  return env.NODE_ENV === 'development' ? 'demo' : null;
}
