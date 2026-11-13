import {
  ApiError,
  computeReminderStatus,
  DocumentInput,
  IdParam,
  today,
  VehicleDocument,
  vehicleTitle,
} from '@axlebook/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Selectable } from 'kysely';
import { z } from 'zod';
import type { Config } from '../../config';
import type { DB } from '../../db/connection';
import type { User, VehicleDocumentsTable, VehicleRow } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { type FileStore, sniffAttachment } from '../../lib/files';
import { getInstanceSettings } from '../../lib/instance-settings';
import { nowIso } from '../../lib/time';
import { currentUser } from '../../plugins/auth';
import { garageVehicleIds, requireVehicle, type VehicleAccess } from '../vehicles/access';

const tags = ['documents'];
const errors = { 400: ApiError, 403: ApiError, 404: ApiError };
const VehicleParam = z.object({ vehicleId: z.coerce.number().int().positive() });
type Row = Selectable<VehicleDocumentsTable>;

const RANK = { overdue: 0, due_soon: 1, upcoming: 2 } as const;

/** Documents as DTOs with their expiry status, most urgent first. */
export function presentDocuments(
  rows: Row[],
  vehicles: Map<number, VehicleRow>,
  access: Map<number, VehicleAccess>,
  todayIso: string,
  soonDays: number,
): VehicleDocument[] {
  return rows
    .map((r): VehicleDocument => {
      const v = vehicles.get(r.vehicle_id) as VehicleRow;
      const state = computeReminderStatus(
        {
          dueMode: 'date',
          dueDate: r.expires_on,
          dueOdometer: null,
          soonDays,
          soonDistance: 0,
          archived: false,
        },
        todayIso,
        null,
      );
      return {
        id: r.id,
        vehicleId: r.vehicle_id,
        vehicleTitle: v.nickname ?? vehicleTitle(v),
        type: r.type,
        title: r.title,
        number: r.number,
        expiresOn: r.expires_on,
        notes: r.notes,
        status: state.status === 'inactive' ? 'upcoming' : state.status,
        daysLeft: state.daysLeft,
        file:
          r.storage_key && r.original_name && r.mime_type
            ? {
                name: r.original_name,
                mimeType: r.mime_type,
                size: r.size_bytes ?? 0,
                url: `/api/v1/documents/${r.id}/file?v=${r.storage_key.slice(0, 8)}`,
              }
            : null,
        canEdit: (access.get(r.vehicle_id) ?? 'view') !== 'view',
      };
    })
    .sort(
      (a, b) =>
        RANK[a.status] - RANK[b.status] ||
        (a.expiresOn ?? '9999').localeCompare(b.expiresOn ?? '9999') ||
        a.title.localeCompare(b.title),
    );
}

export const documentRoutes =
  ({ db, config, files }: { db: DB; config: Config; files: FileStore }): FastifyPluginAsyncZod =>
  async (app) => {
    const soon = async () => (await getInstanceSettings(db, config)).soonDays;
    const present = async (
      rows: Row[],
      vehicles: VehicleRow[],
      access: Map<number, VehicleAccess>,
    ) =>
      presentDocuments(
        rows,
        new Map(vehicles.map((v) => [v.id, v])),
        access,
        today(config.timeZone),
        await soon(),
      );
    const load = async (user: User, id: number, need: VehicleAccess) => {
      const row = await db
        .selectFrom('vehicle_documents')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) throw new AppError('not_found', { entity: 'document' });
      const v = await requireVehicle(db, user, row.vehicle_id, need);
      return { row, v };
    };
    const one = async (row: Row, v: VehicleRow & { access: VehicleAccess }) =>
      (await present([row], [v], new Map([[v.id, v.access]])))[0] as VehicleDocument;
    const columns = (d: z.infer<typeof DocumentInput>) => ({
      type: d.type,
      title: d.title,
      number: d.number ?? null,
      expires_on: d.expiresOn ?? null,
      notes: d.notes ?? null,
    });

    app.get(
      '/documents',
      {
        schema: {
          tags,
          summary: 'Documents across your garage, soonest to expire first',
          response: { 200: z.array(VehicleDocument) },
        },
      },
      async (req) => {
        const access = await garageVehicleIds(db, currentUser(req));
        if (access.size === 0) return [];
        const vehicles = await db
          .selectFrom('vehicles')
          .selectAll()
          .where('id', 'in', [...access.keys()])
          .where('archived_at', 'is', null)
          .execute();
        if (vehicles.length === 0) return [];
        const rows = await db
          .selectFrom('vehicle_documents')
          .selectAll()
          .where(
            'vehicle_id',
            'in',
            vehicles.map((v) => v.id),
          )
          .execute();
        return present(rows, vehicles, access);
      },
    );

    app.get(
      '/vehicles/:vehicleId/documents',
      {
        schema: {
          tags,
          summary: "A vehicle's documents",
          description:
            'Registration, insurance, inspection certificates and permits, each with an optional expiry date and file. `status` is `overdue` once expired and `due_soon` inside the instance\'s "due soon" window.',
          params: VehicleParam,
          response: { 200: z.array(VehicleDocument), ...errors },
        },
      },
      async (req) => {
        const v = await requireVehicle(db, currentUser(req), req.params.vehicleId, 'view');
        const rows = await db
          .selectFrom('vehicle_documents')
          .selectAll()
          .where('vehicle_id', '=', v.id)
          .execute();
        return present(rows, [v], new Map([[v.id, v.access]]));
      },
    );

    app.post(
      '/vehicles/:vehicleId/documents',
      {
        schema: {
          tags,
          summary: 'Add a document',
          params: VehicleParam,
          body: DocumentInput,
          response: { 201: VehicleDocument, ...errors },
        },
      },
      async (req, reply) => {
        const v = await requireVehicle(db, currentUser(req), req.params.vehicleId, 'edit');
        const ts = nowIso();
        const row = await db
          .insertInto('vehicle_documents')
          .values({ ...columns(req.body), vehicle_id: v.id, created_at: ts, updated_at: ts })
          .returningAll()
          .executeTakeFirstOrThrow();
        return reply.status(201).send(await one(row, v));
      },
    );

    app.patch(
      '/documents/:id',
      {
        schema: {
          tags,
          summary: 'Change a document',
          description: 'Renewing it (a later expiry date) starts its notifications over.',
          params: IdParam,
          body: DocumentInput,
          response: { 200: VehicleDocument, ...errors },
        },
      },
      async (req) => {
        const { row, v } = await load(currentUser(req), req.params.id, 'edit');
        const updated = await db
          .updateTable('vehicle_documents')
          .set({
            ...columns(req.body),
            ...((req.body.expiresOn ?? null) !== row.expires_on && { last_notified_status: null }),
            updated_at: nowIso(),
          })
          .where('id', '=', row.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return one(updated, v);
      },
    );

    app.delete(
      '/documents/:id',
      {
        schema: {
          tags,
          summary: 'Delete a document and its file',
          params: IdParam,
          response: { 204: z.null(), ...errors },
        },
      },
      async (req, reply) => {
        const { row } = await load(currentUser(req), req.params.id, 'edit');
        await db.deleteFrom('vehicle_documents').where('id', '=', row.id).execute();
        if (row.storage_key) await files.remove(row.storage_key);
        return reply.status(204).send(null);
      },
    );

    app.put(
      '/documents/:id/file',
      {
        schema: {
          tags,
          summary: 'Upload or replace the scan of a document',
          description:
            'multipart/form-data with one `file` field: JPEG, PNG, WebP, GIF, HEIC or PDF.',
          params: IdParam,
          consumes: ['multipart/form-data'],
          response: { 200: VehicleDocument, ...errors, 413: ApiError, 415: ApiError },
        },
      },
      async (req) => {
        const { row, v } = await load(currentUser(req), req.params.id, 'edit');
        const file = await req.file();
        if (!file) throw new AppError('validation_failed', { field: 'file', reason: 'missing' });
        const data = await file.toBuffer();
        const kind = sniffAttachment(data);
        if (!kind) throw new AppError('unsupported_file');
        const key = await files.save(data, kind.ext);
        const updated = await db
          .updateTable('vehicle_documents')
          .set({
            storage_key: key,
            original_name: (file.filename || `document.${kind.ext}`)
              .replace(/[\r\n"\\/]/g, '_')
              .slice(0, 200),
            mime_type: kind.mime,
            size_bytes: data.length,
            updated_at: nowIso(),
          })
          .where('id', '=', row.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        if (row.storage_key) await files.remove(row.storage_key);
        return one(updated, v);
      },
    );

    app.get(
      '/documents/:id/file',
      {
        schema: {
          tags,
          summary: 'Download the scan of a document',
          params: IdParam,
          querystring: z.object({ download: z.enum(['1']).optional(), v: z.string().optional() }),
          response: { 200: z.unknown().describe('File bytes'), 404: ApiError },
        },
      },
      async (req, reply) => {
        const { row } = await load(currentUser(req), req.params.id, 'view');
        if (!row.storage_key || !row.mime_type) throw new AppError('not_found', { entity: 'file' });
        return (
          reply
            .header('Content-Type', row.mime_type)
            .header('Content-Length', String(row.size_bytes ?? 0))
            .header(
              'Content-Disposition',
              `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(row.original_name ?? 'document')}`,
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
      '/documents/:id/file',
      {
        schema: {
          tags,
          summary: 'Remove the scan, keeping the document',
          params: IdParam,
          response: { 200: VehicleDocument, ...errors },
        },
      },
      async (req) => {
        const { row, v } = await load(currentUser(req), req.params.id, 'edit');
        const updated = await db
          .updateTable('vehicle_documents')
          .set({
            storage_key: null,
            original_name: null,
            mime_type: null,
            size_bytes: null,
            updated_at: nowIso(),
          })
          .where('id', '=', row.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        if (row.storage_key) await files.remove(row.storage_key);
        return one(updated, v);
      },
    );
  };
