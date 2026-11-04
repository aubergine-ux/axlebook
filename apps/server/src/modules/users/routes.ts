import { DirectoryUser, IdParam, UserAdmin, UserCreate, UserUpdate } from '@axlebook/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { DB } from '../../db/connection';
import { hashPassword } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import { nowIso } from '../../lib/time';
import { requireAdmin, requireWriter } from '../../plugins/auth';
import { assertUsernameFree, countActiveAdmins, toUserAdmin } from '../auth/service';

const tags = ['users'];

export const userRoutes =
  ({
    db,
    removeFiles,
  }: {
    db: DB;
    removeFiles: (vehicleIds: number[]) => Promise<void>;
  }): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/users',
      { schema: { tags, summary: 'List accounts (admin)', response: { 200: z.array(UserAdmin) } } },
      async (req) => {
        requireAdmin(req);
        return (await db.selectFrom('users').selectAll().orderBy('username').execute()).map(
          toUserAdmin,
        );
      },
    );

    app.get(
      '/users/directory',
      {
        schema: {
          tags,
          summary: 'People you can share a vehicle with',
          response: { 200: z.array(DirectoryUser) },
        },
      },
      async (req) => {
        const me = requireWriter(req);
        const rows = await db
          .selectFrom('users')
          .select(['id', 'username', 'display_name'])
          .where('disabled', '=', 0)
          .where('id', '!=', me.id)
          .orderBy('username')
          .execute();
        return rows.map((r) => ({ id: r.id, username: r.username, displayName: r.display_name }));
      },
    );

    app.post(
      '/users',
      {
        schema: {
          tags,
          summary: 'Create an account (admin)',
          body: UserCreate,
          response: { 201: UserAdmin },
        },
      },
      async (req, reply) => {
        requireAdmin(req);
        await assertUsernameFree(db, req.body.username);
        const ts = nowIso();
        const row = await db
          .insertInto('users')
          .values({
            username: req.body.username,
            password_hash: req.body.password ? await hashPassword(req.body.password) : null,
            display_name: req.body.displayName ?? null,
            email: req.body.email || null,
            role: req.body.role,
            theme: 'system',
            disabled: 0,
            created_at: ts,
            updated_at: ts,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        return reply.status(201).send(toUserAdmin(row));
      },
    );

    app.patch(
      '/users/:id',
      {
        schema: {
          tags,
          summary: 'Update an account (admin)',
          params: IdParam,
          body: UserUpdate,
          response: { 200: UserAdmin },
        },
      },
      async (req) => {
        const admin = requireAdmin(req);
        const target = await db
          .selectFrom('users')
          .selectAll()
          .where('id', '=', req.params.id)
          .executeTakeFirst();
        if (!target) throw new AppError('not_found');
        const b = req.body;
        const demoting = target.role === 'admin' && ((b.role && b.role !== 'admin') || b.disabled);
        if (demoting && (await countActiveAdmins(db)) <= 1)
          throw new AppError('conflict', { reason: 'last_admin' });
        if (target.id === admin.id && b.disabled)
          throw new AppError('conflict', { reason: 'self' });
        const row = await db
          .updateTable('users')
          .set({
            ...(b.displayName !== undefined && { display_name: b.displayName }),
            ...(b.email !== undefined && { email: b.email || null }),
            ...(b.role && { role: b.role }),
            ...(b.disabled !== undefined && { disabled: b.disabled ? 1 : 0 }),
            ...(b.password && { password_hash: await hashPassword(b.password) }),
            updated_at: nowIso(),
          })
          .where('id', '=', target.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        if (b.disabled || b.password)
          await db.deleteFrom('sessions').where('user_id', '=', target.id).execute();
        return toUserAdmin(row);
      },
    );

    app.delete(
      '/users/:id',
      {
        schema: {
          tags,
          summary: 'Delete an account and its vehicles (admin)',
          params: IdParam,
          response: { 204: z.null() },
        },
      },
      async (req, reply) => {
        const admin = requireAdmin(req);
        if (req.params.id === admin.id) throw new AppError('conflict', { reason: 'self' });
        const target = await db
          .selectFrom('users')
          .select(['id', 'role'])
          .where('id', '=', req.params.id)
          .executeTakeFirst();
        if (!target) throw new AppError('not_found');
        if (target.role === 'admin' && (await countActiveAdmins(db)) <= 1)
          throw new AppError('conflict', { reason: 'last_admin' });
        const owned = await db
          .selectFrom('vehicles')
          .select('id')
          .where('owner_id', '=', target.id)
          .execute();
        await removeFiles(owned.map((v) => v.id));
        await db.deleteFrom('users').where('id', '=', target.id).execute();
        return reply.status(204).send(null);
      },
    );
  };
