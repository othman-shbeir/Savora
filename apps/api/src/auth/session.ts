import { schema, type Db } from '@savora/db';
import { and, eq, gt } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Env } from '../env';
import { hashToken, randomToken } from '../lib/tokens';

export const SESSION_COOKIE = 'savora_session';
const SESSION_DAYS = 30;

export type SessionUser = { id: string; email: string; name: string | null; locale: string };

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

/** Resolves the session cookie into request.user on every request (null when signed out). */
export function registerSessions(app: FastifyInstance, db: Db) {
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (req) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return;
    const [row] = await db
      .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, locale: schema.users.locale })
      .from(schema.sessions)
      .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
      .where(and(eq(schema.sessions.id, hashToken(token)), gt(schema.sessions.expiresAt, new Date())))
      .limit(1);
    req.user = row ?? null;
  });
}

export async function startSession(db: Db, env: Env, reply: FastifyReply, userId: string, userAgent?: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.insert(schema.sessions).values({ id: hashToken(token), userId, expiresAt, userAgent: userAgent?.slice(0, 300) });
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, userId));
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export async function endSession(db: Db, req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies[SESSION_COOKIE];
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token)));
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Guard for routes that need a signed-in user. */
export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
}
