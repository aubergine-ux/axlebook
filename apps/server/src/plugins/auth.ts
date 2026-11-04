import type { FastifyInstance } from 'fastify';
import type { DB } from '../db/connection';
import type { User } from '../db/schema';
import { nowIso } from '../lib/time';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
}

/**
 * TEMPORARY single-user auth (until the auth milestone). Every API request runs as
 * the bootstrap "owner" admin. Ownership columns are real from day one, so moving
 * to real sessions only changes this file.
 */
export async function ensureBootstrapOwner(db: DB): Promise<User> {
  const existing = await db
    .selectFrom('users')
    .selectAll()
    .where('role', '=', 'admin')
    .orderBy('id')
    .executeTakeFirst();
  if (existing) return existing;
  const ts = nowIso();
  return db
    .insertInto('users')
    .values({
      username: 'owner',
      role: 'admin',
      theme: 'system',
      disabled: 0,
      created_at: ts,
      updated_at: ts,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function registerAuth(app: FastifyInstance, db: DB) {
  const owner = await ensureBootstrapOwner(db);
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (request) => {
    request.user = owner;
  });
}
