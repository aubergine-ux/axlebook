import {
  ApiError,
  IdParam,
  Vehicle,
  VehicleInput,
  VehicleListQuery,
  VehicleSummary,
  VehicleUpdate,
} from '@axlebook/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../../lib/errors';
import { mimeForKey, sniffImage } from '../../lib/files';
import type { VehicleService } from './service';

const tags = ['vehicles'];
const errors = { 400: ApiError, 403: ApiError, 404: ApiError };

export const vehicleRoutes =
  (
    svc: VehicleService,
    removeFiles: (vehicleIds: number[]) => Promise<void>,
  ): FastifyPluginAsyncZod =>
  async (app) => {
    const user = (req: { user: unknown }) => {
      if (!req.user) throw new AppError('unauthorized');
      return req.user as Parameters<VehicleService['list']>[0];
    };

    app.get(
      '/vehicles',
      {
        schema: {
          tags,
          summary: 'List vehicles in your garage',
          querystring: VehicleListQuery,
          response: { 200: z.array(VehicleSummary) },
        },
      },
      async (req) => svc.list(user(req), req.query.archived),
    );

    app.post(
      '/vehicles',
      {
        schema: {
          tags,
          summary: 'Add a vehicle',
          body: VehicleInput,
          response: { 201: Vehicle, ...errors },
        },
      },
      async (req, reply) => reply.status(201).send(await svc.create(user(req), req.body)),
    );

    app.get(
      '/vehicles/:id',
      {
        schema: {
          tags,
          summary: 'Get a vehicle',
          params: IdParam,
          response: { 200: Vehicle, ...errors },
        },
      },
      async (req) => svc.get(user(req), req.params.id),
    );

    app.patch(
      '/vehicles/:id',
      {
        schema: {
          tags,
          summary: 'Update a vehicle',
          params: IdParam,
          body: VehicleUpdate,
          response: { 200: Vehicle, ...errors },
        },
      },
      async (req) => svc.update(user(req), req.params.id, req.body),
    );

    app.delete(
      '/vehicles/:id',
      {
        schema: {
          tags,
          summary: 'Delete a vehicle and everything recorded for it',
          description: 'Permanent. Prefer archiving to hide a vehicle you sold.',
          params: IdParam,
          response: { 204: z.null(), ...errors },
        },
      },
      async (req, reply) => {
        await svc.remove(user(req), req.params.id, removeFiles);
        return reply.status(204).send(null);
      },
    );

    for (const [action, archived] of [
      ['archive', true],
      ['unarchive', false],
    ] as const) {
      app.post(
        `/vehicles/:id/${action}`,
        {
          schema: {
            tags,
            summary: archived
              ? 'Archive a vehicle (hide it from the garage)'
              : 'Restore an archived vehicle',
            params: IdParam,
            response: { 200: Vehicle, ...errors },
          },
        },
        async (req) => svc.setArchived(user(req), req.params.id, archived),
      );
    }

    app.put(
      '/vehicles/:id/photo',
      {
        schema: {
          tags,
          summary: 'Upload or replace the vehicle photo',
          description: 'multipart/form-data with one `file` field: JPEG, PNG or WebP.',
          params: IdParam,
          consumes: ['multipart/form-data'],
          response: { 200: Vehicle, ...errors, 413: ApiError },
        },
      },
      async (req) => {
        const file = await req.file();
        if (!file) throw new AppError('validation_failed', { field: 'file', reason: 'missing' });
        const data = await file.toBuffer();
        const image = sniffImage(data);
        if (!image)
          throw new AppError('validation_failed', { field: 'file', reason: 'not_an_image' });
        return svc.setPhoto(user(req), req.params.id, data, image.ext);
      },
    );

    app.delete(
      '/vehicles/:id/photo',
      {
        schema: {
          tags,
          summary: 'Remove the vehicle photo',
          params: IdParam,
          response: { 200: Vehicle, ...errors },
        },
      },
      async (req) => svc.removePhoto(user(req), req.params.id),
    );

    app.get(
      '/vehicles/:id/photo',
      {
        schema: {
          tags,
          summary: 'Download the vehicle photo',
          params: IdParam,
          // Streams are sent as-is (not serialized); this documents the binary body.
          response: { 200: z.unknown().describe('Image bytes: JPEG, PNG or WebP'), 404: ApiError },
        },
      },
      async (req, reply) => {
        const key = await svc.photoKey(user(req), req.params.id);
        return reply
          .header('Content-Type', mimeForKey(key))
          .header('Cache-Control', 'private, max-age=31536000, immutable')
          .header('X-Content-Type-Options', 'nosniff')
          .send(svc.photoStream(key));
      },
    );
  };
