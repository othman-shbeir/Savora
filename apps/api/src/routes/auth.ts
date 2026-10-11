import { schema, type Db } from '@savora/db';
import { LOCALES } from '@savora/shared';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { endSession, startSession } from '../auth/session';
import { upsertUserByEmail } from '../auth/users';
import { googleEnabled, type Env } from '../env';
import { hashToken, randomToken } from '../lib/tokens';
import type { Mailer } from '../mailer';

const LINK_MINUTES = 15;
const OAUTH_COOKIE = 'savora_oauth';
const Locale = z.enum(LOCALES).default('en');

const EMAIL_COPY = {
  en: (link: string) => ({
    subject: 'Your Savora sign-in link',
    text: `Open this link to sign in to Savora:\n\n${link}\n\nIt works once and expires in ${LINK_MINUTES} minutes. If you didn't ask for it, you can ignore this email.`,
  }),
  ar: (link: string) => ({
    subject: 'رابط تسجيل الدخول إلى سافورا',
    text: `افتح هذا الرابط لتسجيل الدخول إلى سافورا:\n\n${link}\n\nيعمل الرابط مرة واحدة وتنتهي صلاحيته خلال ${LINK_MINUTES} دقيقة. إن لم تطلبه، يمكنك تجاهل هذه الرسالة.`,
  }),
};

export function authRoutes(app: FastifyInstance, db: Db, env: Env, mailer: Mailer) {
  app.get('/auth/providers', async () => ({ email: true, google: googleEnabled(env) }));

  // 1) Email: ask for a link. Always answers the same way so it can't be used to probe which emails exist.
  app.post(
    '/auth/email/start',
    {
      config: {
        // 5 links per email per network every 10 minutes: stops inbox flooding without
        // locking out everyone who shares a café's Wi-Fi.
        rateLimit: {
          max: 5,
          timeWindow: '10 minutes',
          keyGenerator: (req) => `${req.ip}:${String((req.body as { email?: unknown } | undefined)?.email ?? '').trim().toLowerCase()}`,
        },
      },
    },
    async (req, reply) => {
      const body = z.object({ email: z.string().trim().toLowerCase().email().max(254), locale: Locale }).safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'invalid_email' });
      const { email, locale } = body.data;
      const token = randomToken();
      await db.insert(schema.loginTokens).values({ email, tokenHash: hashToken(token), locale, expiresAt: new Date(Date.now() + LINK_MINUTES * 6e4) });
      // The token travels in the URL fragment, which browsers never send to servers or in Referer headers.
      const link = `${env.WEB_ORIGIN}/${locale}/auth/verify#token=${token}`;
      await mailer.send({ to: email, ...EMAIL_COPY[locale](link) });
      return { ok: true, ...(env.NODE_ENV === 'development' ? { devLink: link } : {}) };
    },
  );

  // 2) Email: exchange the one-time token for a session.
  app.post('/auth/email/verify', async (req, reply) => {
    const body = z.object({ token: z.string().min(20).max(200) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_token' });
    const now = new Date();
    // Marking the token used in the same statement that finds it makes a link single-use even under double clicks.
    const [row] = await db
      .update(schema.loginTokens)
      .set({ usedAt: now })
      .where(and(eq(schema.loginTokens.tokenHash, hashToken(body.data.token)), isNull(schema.loginTokens.usedAt), gt(schema.loginTokens.expiresAt, now)))
      .returning();
    if (!row) return reply.code(400).send({ error: 'link_expired' });
    const { user, isNew } = await upsertUserByEmail(db, { email: row.email, locale: row.locale });
    await startSession(db, env, reply, user.id, req.headers['user-agent']);
    return { user: { id: user.id, email: user.email, name: user.name }, isNew, locale: row.locale };
  });

  // 3) Google: redirect to the consent screen. Without credentials, back to sign-in with a note.
  if (!googleEnabled(env)) {
    app.get('/auth/google/start', async (req, reply) => {
      const locale = Locale.catch('en').parse((req.query as { locale?: string }).locale);
      return reply.redirect(`${env.WEB_ORIGIN}/${locale}/sign-in?error=google_setup`);
    });
  } else {
    const redirectUri = `${env.WEB_ORIGIN}/api/auth/google/callback`;

    app.get('/auth/google/start', async (req, reply) => {
      const locale = Locale.catch('en').parse((req.query as { locale?: string }).locale);
      const state = randomToken();
      reply.setCookie(OAUTH_COOKIE, `${state}.${locale}`, { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', path: '/', maxAge: 600, signed: true });
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' }).toString();
      return reply.redirect(url.toString());
    });

    app.get('/auth/google/callback', async (req, reply) => {
      const q = req.query as { code?: string; state?: string };
      const raw = req.cookies[OAUTH_COOKIE];
      const unsigned = raw ? req.unsignCookie(raw) : null;
      reply.clearCookie(OAUTH_COOKIE, { path: '/' });
      const [state, locale = 'en'] = unsigned?.valid && unsigned.value ? unsigned.value.split('.') : [];
      const fail = () => reply.redirect(`${env.WEB_ORIGIN}/${locale}/sign-in?error=google`);
      if (!q.code || !state || q.state !== state) return fail();

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code: q.code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
      });
      if (!tokenRes.ok) return fail();
      const { access_token } = (await tokenRes.json()) as { access_token?: string };
      const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${access_token}` } });
      if (!infoRes.ok) return fail();
      const info = (await infoRes.json()) as { sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
      if (!info.email || !info.email_verified) return fail();

      const [linked] = await db.select().from(schema.oauthAccounts).where(and(eq(schema.oauthAccounts.provider, 'google'), eq(schema.oauthAccounts.providerUserId, info.sub))).limit(1);
      const userId = linked
        ? linked.userId
        : await (async () => {
            const { user } = await upsertUserByEmail(db, { email: info.email!, name: info.name, avatarUrl: info.picture, locale });
            await db.insert(schema.oauthAccounts).values({ provider: 'google', providerUserId: info.sub, userId: user.id }).onConflictDoNothing();
            return user.id;
          })();
      await startSession(db, env, reply, userId, req.headers['user-agent']);
      return reply.redirect(`${env.WEB_ORIGIN}/${locale}/app`);
    });
  }

  app.post('/auth/logout', async (req, reply) => {
    await endSession(db, req, reply);
    return { ok: true };
  });
}
