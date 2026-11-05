import { ApiError, Share, ShareInput } from '@axlebook/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { DB } from '../../db/connection';
import { AppError } from '../../lib/errors';
import { nowIso } from '../../lib/time';
import { currentUser } from '../../plugins/auth';
import { requireVehicle } from './access';

const Params = z.object({ vehicleId: z.coerce.number().int().positive() });
const UserParams = Params.extend({ userId: z.coerce.number().int().positive() });
const errors = { 400: ApiError, 403: ApiError, 404: ApiError };

export const shareRoutes =
  ({ db }: { db: DB }): FastifyPluginAsyncZod =>
  async (app) => {
    const tags = ['sharing'];
    const list = async (vehicleId: number) => {
      const rows = await db
        .selectFrom('vehicle_shares')
        .innerJoin('users', 'users.id', 'vehicle_shares.user_id')
        .select(['users.id', 'users.username', 'users.display_name', 'vehicle_shares.permission'])
        .where('vehicle_shares.vehicle_id', '=', vehicleId)
        .orderBy('users.username')
        .execute();
      return rows.map((r) => ({
        userId: r.id,
        username: r.username,
        displayName: r.display_name,
        permission: r.permission,
      }));
    };

    app.get(
      '/vehicles/:vehicleId/shares',
      {
        schema: {
          tags,
          summary: 'Who this vehicle is shared with (owner only)',
          params: Params,
          response: { 200: z.array(Share), ...errors },
        },
      },
      async (req) => {
        // Only the owner sees who else has access.
        await requireVehicle(db, currentUser(req), req.params.vehicleId, 'owner');
        return list(req.params.vehicleId);
      },
    );
    app.put(
      '/vehicles/:vehicleId/shares/:userId',
      {
        schema: {
          tags,
          summary: 'Share with someone, or change their access (owner)',
          params: UserParams,
          body: ShareInput,
          response: { 200: z.array(Share), ...errors },
        },
      },
      async (req) => {
        const v = await requireVehicle(db, currentUser(req), req.params.vehicleId, 'owner');
        if (req.params.userId === v.owner_id)
          throw new AppError('validation_failed', { field: 'userId', reason: 'owner' });
        const target = await db
          .selectFrom('users')
          .select('id')
          .where('id', '=', req.params.userId)
          .where('disabled', '=', 0)
          .executeTakeFirst();
        if (!target) throw new AppError('not_found', { entity: 'user' });
        await db
          .insertInto('vehicle_shares')
          .values({
            vehicle_id: v.id,
            user_id: target.id,
            permission: req.body.permission,
            created_at: nowIso(),
          })
          .onConflict((oc) =>
            oc.columns(['vehicle_id', 'user_id']).doUpdateSet({ permission: req.body.permission }),
          )
          .execute();
        return list(v.id);
      },
    );
    app.delete(
      '/vehicles/:vehicleId/shares/:userId',
      {
        schema: {
          tags,
          summary: 'Stop sharing with someone (owner)',
          params: UserParams,
          response: { 200: z.array(Share), ...errors },
        },
      },
      async (req) => {
        const v = await requireVehicle(db, currentUser(req), req.params.vehicleId, 'owner');
        await db
          .deleteFrom('vehicle_shares')
          .where('vehicle_id', '=', v.id)
          .where('user_id', '=', req.params.userId)
          .execute();
        return list(v.id);
      },
    );
  };
