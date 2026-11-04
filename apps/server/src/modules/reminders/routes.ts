import {
  ApiError,
  IdParam,
  Reminder,
  ReminderCompleteInput,
  ReminderInput,
} from '@axlebook/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUser } from '../../plugins/auth';
import type { ReminderService } from './service';

const tags = ['reminders'];
const errors = { 400: ApiError, 403: ApiError, 404: ApiError };
const VehicleParam = z.object({ vehicleId: z.coerce.number().int().positive() });

export const reminderRoutes =
  (svc: ReminderService): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/reminders',
      {
        schema: {
          tags,
          summary: 'Active reminders across your garage, most urgent first',
          response: { 200: z.array(Reminder) },
        },
      },
      async (req) => svc.listAll(currentUser(req)),
    );
    app.get(
      '/vehicles/:vehicleId/reminders',
      {
        schema: {
          tags,
          summary: "A vehicle's reminders",
          params: VehicleParam,
          querystring: z.object({ archived: z.enum(['true', 'false']).default('false') }),
          response: { 200: z.array(Reminder), ...errors },
        },
      },
      async (req) =>
        svc.listForVehicle(currentUser(req), req.params.vehicleId, req.query.archived === 'true'),
    );
    app.post(
      '/vehicles/:vehicleId/reminders',
      {
        schema: {
          tags,
          summary: 'Add a reminder',
          description:
            '`dueMode` is date, distance, or either (whichever comes first). Set intervals to repeat.',
          params: VehicleParam,
          body: ReminderInput,
          response: { 201: Reminder, ...errors },
        },
      },
      async (req, reply) =>
        reply.status(201).send(await svc.create(currentUser(req), req.params.vehicleId, req.body)),
    );
    app.get(
      '/reminders/:id',
      {
        schema: {
          tags,
          summary: 'Get a reminder',
          params: IdParam,
          response: { 200: Reminder, ...errors },
        },
      },
      async (req) => svc.get(currentUser(req), req.params.id),
    );
    app.put(
      '/reminders/:id',
      {
        schema: {
          tags,
          summary: 'Update a reminder',
          params: IdParam,
          body: ReminderInput,
          response: { 200: Reminder, ...errors },
        },
      },
      async (req) => svc.update(currentUser(req), req.params.id, req.body),
    );
    app.delete(
      '/reminders/:id',
      {
        schema: {
          tags,
          summary: 'Delete a reminder',
          params: IdParam,
          response: { 204: z.null(), ...errors },
        },
      },
      async (req, reply) => {
        await svc.remove(currentUser(req), req.params.id);
        return reply.status(204).send(null);
      },
    );
    for (const [action, archived] of [
      ['archive', true],
      ['unarchive', false],
    ] as const) {
      app.post(
        `/reminders/:id/${action}`,
        {
          schema: {
            tags,
            summary: archived ? 'Archive a reminder' : 'Restore a reminder',
            params: IdParam,
            response: { 200: Reminder, ...errors },
          },
        },
        async (req) => svc.setArchived(currentUser(req), req.params.id, archived),
      );
    }
    app.post(
      '/reminders/:id/complete',
      {
        schema: {
          tags,
          summary: 'Mark a reminder done without a record',
          description:
            'Recurring reminders reschedule from this date and odometer (the current reading if omitted); one-off reminders are archived.',
          params: IdParam,
          body: ReminderCompleteInput,
          response: { 200: Reminder, ...errors },
        },
      },
      async (req) => svc.complete(currentUser(req), req.params.id, req.body),
    );
  };
