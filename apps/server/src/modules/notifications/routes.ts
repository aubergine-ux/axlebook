import { ApiError, Channel, ChannelInput, IdParam } from '@axlebook/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { DB } from '../../db/connection';
import { currentUser, requireAdmin } from '../../plugins/auth';
import type { NotificationService } from './service';

const tags = ['notifications'];
const errors = { 400: ApiError, 403: ApiError, 404: ApiError };

export const notificationRoutes =
  ({ notifications }: { db: DB; notifications: NotificationService }): FastifyPluginAsyncZod =>
  async (app) => {
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
            'Types: email (needs SMTP_* settings), ntfy (full topic URL), gotify (server URL + app token), discord (webhook URL), webhook (signed with X-Axlebook-Signature when a secret is set).',
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
