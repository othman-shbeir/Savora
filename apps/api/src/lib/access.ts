import { schema, type Db } from '@savora/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

type Role = (typeof schema.roleEnum.enumValues)[number];
const uuid = z.string().uuid();

const notFound = (reply: FastifyReply) => {
  reply.code(404).send({ error: 'not_found' });
  return null;
};

/** Loads the caller's membership, or replies 404 (not 403) so organization ids can't be probed. */
export async function membership(db: Db, req: FastifyRequest, reply: FastifyReply, orgId: string, roles?: Role[]) {
  if (!uuid.safeParse(orgId).success) return notFound(reply);
  const [m] = await db
    .select()
    .from(schema.memberships)
    .where(and(eq(schema.memberships.organizationId, orgId), eq(schema.memberships.userId, req.user!.id)))
    .limit(1);
  if (!m) return notFound(reply);
  if (roles && !roles.includes(m.role)) {
    reply.code(403).send({ error: 'forbidden' });
    return null;
  }
  return m;
}

/** A location the caller may work on, or null after replying 404. */
export async function locationAccess(db: Db, req: FastifyRequest, reply: FastifyReply, locationId: string, roles?: Role[]) {
  if (!uuid.safeParse(locationId).success) return notFound(reply);
  const [loc] = await db.select().from(schema.locations).where(eq(schema.locations.id, locationId)).limit(1);
  if (!loc) return notFound(reply);
  return (await membership(db, req, reply, loc.organizationId, roles)) ? loc : null;
}

/** A menu category the caller may edit, with its location. */
export async function categoryAccess(db: Db, req: FastifyRequest, reply: FastifyReply, id: string) {
  if (!uuid.safeParse(id).success) return notFound(reply);
  const [row] = await db.select().from(schema.menuCategories).where(eq(schema.menuCategories.id, id)).limit(1);
  if (!row) return notFound(reply);
  const loc = await locationAccess(db, req, reply, row.locationId);
  return loc ? { category: row, location: loc } : null;
}

/** A menu item the caller may edit, with its location. */
export async function itemAccess(db: Db, req: FastifyRequest, reply: FastifyReply, id: string) {
  if (!uuid.safeParse(id).success) return notFound(reply);
  const [row] = await db.select().from(schema.menuItems).where(eq(schema.menuItems.id, id)).limit(1);
  if (!row) return notFound(reply);
  const loc = await locationAccess(db, req, reply, row.locationId);
  return loc ? { item: row, location: loc } : null;
}
