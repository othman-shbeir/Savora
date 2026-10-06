import { z } from 'zod';

// Fails fast at start-up when configuration is missing, instead of at the first request.
const Env = z.object({
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  SESSION_SECRET: z.string().min(16),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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
  /** Uploaded photos. Empty means ~/.savora/media. */
  MEDIA_DIR: z.string().optional().default(''),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
});

export type Env = z.infer<typeof Env>;
export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => Env.parse(source);

export const googleEnabled = (env: Env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
