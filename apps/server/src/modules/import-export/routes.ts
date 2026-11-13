import { ApiError, ImportResult, RECORD_KINDS, RecordInput } from '@axlebook/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { DB } from '../../db/connection';
import { parseCsv } from '../../lib/csv';
import { AppError } from '../../lib/errors';
import { currentUser, requireAdmin } from '../../plugins/auth';
import type { RecordService } from '../records/service';
import { requireVehicle } from '../vehicles/access';
import type { BackupService } from './backup';
import { readForeign } from './foreign';
import { rowsToRecords } from './parse';

const VehicleParam = z.object({ vehicleId: z.coerce.number().int().positive() });
const errors = { 400: ApiError, 403: ApiError, 404: ApiError };

export { BACKED_UP, NOT_BACKED_UP } from './backup';

export const importExportRoutes =
  ({
    db,
    records,
    backups,
  }: {
    db: DB;
    records: RecordService;
    backups: BackupService;
  }): FastifyPluginAsyncZod =>
  async (app) => {
    const tags = ['import-export'];

    // ── CSV export ─────────────────────────────────────────────────────────
    app.get(
      '/vehicles/:vehicleId/export.csv',
      {
        schema: {
          tags,
          summary: "Export a vehicle's records as CSV",
          description:
            "Amounts are decimals in the instance currency; fuel volume is in the vehicle's fuel unit.",
          params: VehicleParam,
          querystring: z.object({ kind: z.enum(['all', ...RECORD_KINDS]).default('all') }),
          response: { 200: z.string(), ...errors },
        },
      },
      async (req, reply) => {
        const user = currentUser(req);
        const v = await requireVehicle(db, user, req.params.vehicleId, 'view');
        const csv = await backups.vehicleCsv(user, v.id, req.query.kind);
        const name = `${v.year}-${v.make}-${v.model}-${req.query.kind}`
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-');
        return reply
          .header('Content-Type', 'text/csv; charset=utf-8')
          .header('Content-Disposition', `attachment; filename="${name}.csv"`)
          .send(csv);
      },
    );

    // ── CSV import ─────────────────────────────────────────────────────────
    app.post(
      '/vehicles/:vehicleId/import/csv',
      {
        schema: {
          tags,
          summary: 'Import records from CSV',
          description:
            'Accepts Axlebook exports and exports from LubeLogger, Fuelly, Drivvo and Simply Auto (Fuel_Log.csv); other files have their columns matched by name. `kind` applies when the file has no kind column. Rows identical to an existing record are skipped. Use `dryRun` to preview.',
          params: VehicleParam,
          body: z.object({
            csv: z.string().max(3_500_000),
            kind: z.enum(RECORD_KINDS).default('service'),
            dateOrder: z.enum(['mdy', 'dmy']).default('mdy'),
            dryRun: z.boolean().default(true),
            /** For a file that covers several vehicles: import only this one's rows. */
            onlyVehicle: z.string().max(200).optional(),
          }),
          response: { 200: ImportResult, ...errors },
        },
      },
      async (req) => {
        const user = currentUser(req);
        const v = await requireVehicle(db, user, req.params.vehicleId, 'edit');
        const foreign = readForeign(req.body.csv);
        const rows = foreign?.rows ?? parseCsv(req.body.csv);
        if (rows.length < 2)
          throw new AppError('validation_failed', { field: 'csv', reason: 'empty' });
        const all = rowsToRecords(rows, {
          kind: req.body.kind,
          dateOrder: req.body.dateOrder,
          format: foreign?.format,
          lines: foreign?.lines,
        });
        const format = all.format;
        // Fuelly and Simply Auto put every car in one file; this import fills a single vehicle.
        const vehiclesInFile = [...new Set(foreign?.vehicles.filter(Boolean) ?? [])].sort();
        const only = req.body.onlyVehicle;
        if (vehiclesInFile.length > 1 && !only && !req.body.dryRun)
          throw new AppError('validation_failed', { field: 'onlyVehicle', reason: 'required' });
        const parsed =
          only && foreign ? all.parsed.filter((_, i) => foreign.vehicles[i] === only) : all.parsed;

        const existing = await db
          .selectFrom('records')
          .select(['kind', 'date', 'odometer', 'cost', 'title'])
          .where('vehicle_id', '=', v.id)
          .execute();
        const fingerprint = (r: {
          kind: string;
          date: string;
          odometer?: number | null;
          cost?: number | null;
          title?: string | null;
        }) =>
          [r.kind, r.date, r.odometer ?? '', r.cost ?? 0, (r.title ?? '').toLowerCase()].join('|');
        const seen = new Set(existing.map(fingerprint));

        const errorsOut: { row: number; message: string }[] = [];
        const valid: RecordInput[] = [];
        let skipped = 0;
        for (const p of parsed) {
          if (p.error || !p.input) {
            errorsOut.push({ row: p.row, message: p.error ?? 'invalid' });
            continue;
          }
          const check = RecordInput.safeParse(p.input);
          if (!check.success) {
            errorsOut.push({
              row: p.row,
              message: check.error.issues.map((i) => i.path.join('.') || i.message).join(', '),
            });
            continue;
          }
          const fp = fingerprint({ ...p.input, cost: check.data.cost });
          if (seen.has(fp)) {
            skipped++;
            continue;
          }
          seen.add(fp);
          valid.push(p.input);
        }

        let imported = 0;
        if (!req.body.dryRun) {
          for (const input of valid) {
            await records.create(user, v.id, input);
            imported++;
          }
        }
        return {
          dryRun: req.body.dryRun,
          total: parsed.length,
          imported: req.body.dryRun ? 0 : imported,
          skipped,
          errors: errorsOut.slice(0, 200),
          preview: valid.slice(0, 20) as Record<string, unknown>[],
          detectedFormat: format,
          vehiclesInFile,
        };
      },
    );

    app.get(
      '/backup',
      {
        schema: {
          tags,
          summary: 'Download a full backup (zip: JSON + CSV + photos + attachments)',
          description:
            'Admins get the whole instance. Everyone else gets the vehicles they own. `backup.json` is what restore reads; `csv/` holds the same records per vehicle in plain CSV.',
          response: { 200: z.unknown().describe('application/zip') },
        },
      },
      async (req, reply) => {
        const user = currentUser(req);
        const zip = await backups.zip(user);
        const date = new Date().toISOString().slice(0, 10);
        return reply
          .header('Content-Type', 'application/zip')
          .header('Content-Disposition', `attachment; filename="axlebook-backup-${date}.zip"`)
          .send(zip);
      },
    );

    app.post(
      '/backup/restore',
      {
        schema: {
          tags,
          summary: 'Restore a backup into this instance (admin)',
          description:
            'multipart/form-data with one `file` field (the backup zip). Only allowed while the instance has no vehicles. Accounts whose username already exists are matched rather than duplicated.',
          consumes: ['multipart/form-data'],
          response: {
            200: z.object({ restored: z.record(z.string(), z.number().int()) }),
            ...errors,
            409: ApiError,
          },
        },
      },
      async (req) => {
        requireAdmin(req);
        const file = await req.file();
        if (!file) throw new AppError('validation_failed', { field: 'file', reason: 'missing' });
        const counts = await backups.restore(new Uint8Array(await file.toBuffer()));
        return { restored: counts };
      },
    );

    // ── Backups kept on the server ─────────────────────────────────────────
    const Stored = z.object({ name: z.string(), size: z.number().int(), createdAt: z.string() });
    const NameParam = z.object({ name: z.string().max(80) });

    app.get(
      '/backups',
      {
        schema: {
          tags,
          summary: 'Backups kept on the server, newest first (admin)',
          description:
            'Scheduled backups are written to `backups/` on the data volume when switched on in Settings, and the oldest are deleted beyond the number to keep.',
          response: { 200: z.array(Stored), 403: ApiError },
        },
      },
      async (req) => {
        requireAdmin(req);
        return backups.stored();
      },
    );

    app.post(
      '/backups',
      {
        schema: {
          tags,
          summary: 'Make a backup on the server now (admin)',
          response: { 201: Stored, 403: ApiError },
        },
      },
      async (req, reply) => {
        requireAdmin(req);
        return reply.status(201).send(await backups.store('manual'));
      },
    );

    app.get(
      '/backups/:name',
      {
        schema: {
          tags,
          summary: 'Download a stored backup (admin)',
          params: NameParam,
          response: { 200: z.unknown().describe('application/zip'), 403: ApiError, 404: ApiError },
        },
      },
      async (req, reply) => {
        requireAdmin(req);
        const data = await backups.read(req.params.name);
        return reply
          .header('Content-Type', 'application/zip')
          .header('Content-Disposition', `attachment; filename="${req.params.name}"`)
          .send(data);
      },
    );

    app.delete(
      '/backups/:name',
      {
        schema: {
          tags,
          summary: 'Delete a stored backup (admin)',
          params: NameParam,
          response: { 204: z.null(), 403: ApiError, 404: ApiError },
        },
      },
      async (req, reply) => {
        requireAdmin(req);
        await backups.read(req.params.name);
        await backups.remove(req.params.name);
        return reply.status(204).send(null);
      },
    );

    app.post(
      '/backups/:name/restore',
      {
        schema: {
          tags,
          summary: 'Restore a stored backup over this instance (admin)',
          description:
            "Replaces every vehicle and its records with what the backup holds. What is here now is saved as a new backup first (its name ends in `-prerestore`), so this can be undone. Accounts are kept; `confirm` must be the backup's name.",
          params: NameParam,
          body: z.object({ confirm: z.string() }),
          response: {
            200: z.object({ restored: z.record(z.string(), z.number().int()) }),
            ...errors,
          },
        },
      },
      async (req) => {
        requireAdmin(req);
        if (req.body.confirm !== req.params.name)
          throw new AppError('validation_failed', { field: 'confirm', reason: 'mismatch' });
        return { restored: await backups.restoreStored(req.params.name) };
      },
    );
  };
