import { ApiError, Channel, ChannelInput, IdParam } from '@axlebook/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { DB } from '../../db/connection';
import { nowIso } from '../../lib/time';
import { currentUser, requireAdmin } from '../../plugins/auth';
import { requireVehicle } from '../vehicles/access';
import type { NotificationService } from './service';

const tags = ['notifications'];
const errors = { 400: ApiError, 403: ApiError, 404: ApiError };

export const notificationRoutes =
  ({ db, notifications }: { db: DB; notifications: NotificationService }): FastifyPluginAsyncZod =>
  async (app) => {
    const VehicleParam = z.object({ vehicleId: z.coerce.number().int().positive() });
    const Mute = z.object({ muted: z.boolean() });
    const isMuted = async (vehicleId: number, userId: number) =>
      Boolean(
        await db
          .selectFrom('vehicle_mutes')
          .select('vehicle_id')
          .where('vehicle_id', '=', vehicleId)
          .where('user_id', '=', userId)
          .executeTakeFirst(),
      );

    app.get(
      '/vehicles/:vehicleId/notifications',
      {
        schema: {
          tags,
          summary: 'Whether you get notifications for this vehicle',
          params: VehicleParam,
          response: { 200: Mute, ...errors },
        },
      },
      async (req) => {
        const user = currentUser(req);
        const v = await requireVehicle(db, user, req.params.vehicleId, 'view');
        return { muted: await isMuted(v.id, user.id) };
      },
    );
    app.put(
      '/vehicles/:vehicleId/notifications',
      {
        schema: {
          tags,
          summary: 'Mute or unmute a vehicle for yourself',
          description:
            'Muting stops reminder and document notifications, and leaves the vehicle out of your weekly digest. It only affects you: other people the vehicle is shared with still hear about it.',
          params: VehicleParam,
          body: Mute,
          response: { 200: Mute, ...errors },
        },
      },
      async (req) => {
        const user = currentUser(req);
        const v = await requireVehicle(db, user, req.params.vehicleId, 'view');
        if (req.body.muted && !(await isMuted(v.id, user.id)))
          await db
            .insertInto('vehicle_mutes')
            .values({ vehicle_id: v.id, user_id: user.id, created_at: nowIso() })
            .execute();
        if (!req.body.muted)
          await db
            .deleteFrom('vehicle_mutes')
            .where('vehicle_id', '=', v.id)
            .where('user_id', '=', user.id)
            .execute();
        return { muted: req.body.muted };
      },
    );

    app.get(
      '/me/channels',
      {
        schema: {
          tags,
          summary: 'Your notification channels',
          response: { 200: z.array(Channel) },
        },
      },
      async (req) => notifications.list(currentUser(req)),
    );
    app.post(
      '/me/channels',
      {
        schema: {
          tags,
          summary: 'Add a notification channel',
          description:
            'Types: email (needs SMTP_* settings), ntfy (full topic URL), gotify (server URL + app token), discord (webhook URL), apprise (an Apprise API notify URL, optionally with Apprise URLs and a tag), webhook (signed with X-Axlebook-Signature when a secret is set).',
          body: ChannelInput,
          response: { 201: Channel, ...errors },
        },
      },
      async (req, reply) =>
        reply.status(201).send(await notifications.create(currentUser(req), req.body)),
    );
    app.put(
      '/me/channels/:id',
      {
        schema: {
          tags,
          summary: 'Update a channel',
          params: IdParam,
          body: ChannelInput,
          response: { 200: Channel, ...errors },
        },
      },
      async (req) => notifications.update(currentUser(req), req.params.id, req.body),
    );
    app.delete(
      '/me/channels/:id',
      {
        schema: {
          tags,
          summary: 'Remove a channel',
          params: IdParam,
          response: { 204: z.null(), ...errors },
        },
      },
      async (req, reply) => {
        await notifications.remove(currentUser(req), req.params.id);
        return reply.status(204).send(null);
      },
    );
    app.post(
      '/me/channels/:id/test',
      {
        schema: {
          tags,
          summary: 'Send a test notification',
          params: IdParam,
          response: { 200: Channel, ...errors },
        },
      },
      async (req) => notifications.test(currentUser(req), req.params.id),
    );
    app.post(
      '/notifications/scan',
      {
        schema: {
          tags,
          summary: 'Check reminders and send notifications now (admin)',
          response: { 200: z.object({ notified: z.number().int() }) },
        },
      },
      async (req) => {
        requireAdmin(req);
        return notifications.scan();
      },
    );
  };
