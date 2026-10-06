import { schema, type Db } from '@savora/db';
import { eq } from 'drizzle-orm';

/** Finds a user by email or creates one. Emails are compared lower-case. */
export async function upsertUserByEmail(db: Db, input: { email: string; name?: string | null; avatarUrl?: string | null; locale?: string }) {
  const email = input.email.trim().toLowerCase();
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing) {
    // Fill in profile details we learn later (e.g. a name from Google), never overwrite them.
    if ((!existing.name && input.name) || (!existing.avatarUrl && input.avatarUrl)) {
      const [updated] = await db
        .update(schema.users)
        .set({ name: existing.name ?? input.name ?? null, avatarUrl: existing.avatarUrl ?? input.avatarUrl ?? null })
        .where(eq(schema.users.id, existing.id))
        .returning();
      return { user: updated ?? existing, isNew: false };
    }
    return { user: existing, isNew: false };
  }
  const [created] = await db
    .insert(schema.users)
    .values({ email, name: input.name ?? null, avatarUrl: input.avatarUrl ?? null, locale: input.locale ?? 'en' })
    .returning();
  if (!created) throw new Error('user insert failed');
  return { user: created, isNew: true };
}
