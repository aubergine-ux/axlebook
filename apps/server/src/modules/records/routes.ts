import { createHash } from 'node:crypto';
import {
  ApiError,
  Attachment,
  IdParam,
  LogRecord,
  RecordInput,
  RecordListQuery,
  RecordPage,
  RecordUpdate,
} from '@axlebook/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { DB } from '../../db/connection';
import { AppError } from '../../lib/errors';
import { type FileStore, sniffAttachment } from '../../lib/files';
import { nowIso } from '../../lib/time';
import { currentUser } from '../../plugins/auth';
import { requireVehicle } from '../vehicles/access';
import { attachmentDto, type RecordService } from './service';

const tags = ['records'];
const errors = { 400: ApiError, 403: ApiError, 404: ApiError };
const VehicleParam = z.object({ vehicleId: z.coerce.number().int().positive() });

export const recordRoutes =
  ({
    db,
    records,
    files,
  }: {
    db: DB;
    records: RecordService;
    files: FileStore;
  }): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/records',
      {
        schema: {
          tags,
          summary: 'Search and filter records across your garage',
          description:
            '`kind` takes a comma-separated list. `q` matches title, notes, station and tags. Add `vehicleId` to limit to one vehicle.',
          querystring: RecordListQuery,
          response: { 200: RecordPage },
        },
      },
      async (req) => records.list(currentUser(req), req.query),
    );

    app.get(
      '/vehicles/:vehicleId/records',
      {
        schema: {
          tags,
          summary: "A vehicle's records",
          params: VehicleParam,
          querystring: RecordListQuery,
          response: { 200: RecordPage, ...errors },
        },
      },
      async (req) =>
        records.list(currentUser(req), { ...req.query, vehicleId: req.params.vehicleId }),
    );

    app.post(
      '/vehicles/:vehicleId/records',
      {
        schema: {
          tags,
          summary: 'Log a record (service, repair, upgrade, fuel or expense)',
          description:
            'Money and fuel volume are integer milli-units. Fuel needs `fuel` and `odometer`. A repeated `clientId` returns the existing record (safe retries).',
          params: VehicleParam,
          body: RecordInput,
          response: { 201: LogRecord, ...errors },
        },
      },
      async (req, reply) =>
        reply
          .status(201)
          .send(await records.create(currentUser(req), req.params.vehicleId, req.body)),
    );

    app.get(
      '/records/:id',
      {
        schema: {
          tags,
          summary: 'Get a record',
          params: IdParam,
          response: { 200: LogRecord, ...errors },
        },
      },
      async (req) => records.get(currentUser(req), req.params.id),
    );

    app.put(
      '/records/:id',
      {
        schema: {
          tags,
          summary: 'Replace a record',
          params: IdParam,
          body: RecordUpdate,
          response: { 200: LogRecord, ...errors },
        },
      },
      async (req) => records.update(currentUser(req), req.params.id, req.body),
    );

    app.delete(
      '/records/:id',
      {
        schema: {
          tags,
          summary: 'Delete a record',
          description: 'Restores any parts it used and undoes reminder completions it made.',
          params: IdParam,
          response: { 204: z.null(), ...errors },
        },
      },
      async (req, reply) => {
        await records.remove(currentUser(req), req.params.id);
        return reply.status(204).send(null);
      },
    );

    // ── Attachments ──────────────────────────────────────────────────────────

    app.post(
      '/records/:id/attachments',
      {
        schema: {
          tags: ['attachments'],
          summary: 'Attach a receipt or photo to a record',
          description:
            'multipart/form-data with one `file` field: JPEG, PNG, WebP, GIF, HEIC or PDF.',
          params: IdParam,
          consumes: ['multipart/form-data'],
          response: { 201: Attachment, ...errors, 413: ApiError, 415: ApiError },
        },
      },
      async (req, reply) => {
        const user = currentUser(req);
        const record = await db
          .selectFrom('records')
          .select(['id', 'vehicle_id'])
          .where('id', '=', req.params.id)
          .executeTakeFirst();
        if (!record) throw new AppError('not_found', { entity: 'record' });
        await requireVehicle(db, user, record.vehicle_id, 'edit');
        const file = await req.file();
        if (!file) throw new AppError('validation_failed', { field: 'file', reason: 'missing' });
        const data = await file.toBuffer();
        const kind = sniffAttachment(data);
        if (!kind) throw new AppError('unsupported_file');
        const key = await files.save(data, kind.ext);
        const name = (file.filename || `attachment.${kind.ext}`)
          .replace(/[\r\n"\\/]/g, '_')
          .slice(0, 200);
        const row = await db
          .insertInto('attachments')
          .values({
            vehicle_id: record.vehicle_id,
            record_id: record.id,
            storage_key: key,
            original_name: name,
            mime_type: kind.mime,
            size_bytes: data.length,
            sha256: createHash('sha256').update(data).digest('hex'),
            created_at: nowIso(),
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        return reply.status(201).send(attachmentDto(row));
      },
    );

    app.get(
      '/attachments/:id',
      {
        schema: {
          tags: ['attachments'],
          summary: 'Download an attachment',
          querystring: z.object({ download: z.enum(['1']).optional() }),
          params: IdParam,
          response: { 200: z.unknown().describe('File bytes'), 404: ApiError },
        },
      },
      async (req, reply) => {
        const row = await db
          .selectFrom('attachments')
          .selectAll()
          .where('id', '=', req.params.id)
          .executeTakeFirst();
        if (!row) throw new AppError('not_found');
        await requireVehicle(db, currentUser(req), row.vehicle_id, 'view');
        const disposition = req.query.download ? 'attachment' : 'inline';
        return (
          reply
            .header('Content-Type', row.mime_type)
            .header('Content-Length', String(row.size_bytes))
            .header(
              'Content-Disposition',
              `${disposition}; filename*=UTF-8''${encodeURIComponent(row.original_name)}`,
            )
            .header('Cache-Control', 'private, max-age=31536000, immutable')
            .header('X-Content-Type-Options', 'nosniff')
            // Uploaded files never run as active content in the app's origin.
            .header(
              'Content-Security-Policy',
              "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
            )
            .send(files.stream(row.storage_key))
        );
      },
    );

    app.delete(
      '/attachments/:id',
      {
        schema: {
          tags: ['attachments'],
          summary: 'Delete an attachment',
          params: IdParam,
          response: { 204: z.null(), ...errors },
        },
      },
      async (req, reply) => {
        const row = await db
          .selectFrom('attachments')
          .selectAll()
          .where('id', '=', req.params.id)
          .executeTakeFirst();
        if (!row) throw new AppError('not_found');
        await requireVehicle(db, currentUser(req), row.vehicle_id, 'edit');
        await db.deleteFrom('attachments').where('id', '=', row.id).execute();
        await files.remove(row.storage_key);
        return reply.status(204).send(null);
      },
    );
  };
