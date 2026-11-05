import { ApiError, fromMilli, ImportResult, RECORD_KINDS, RecordInput } from '@axlebook/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { strFromU8, strToU8, unzipSync, type Zippable, zipSync } from 'fflate';
import { z } from 'zod';
import type { Config } from '../../config';
import type { DB } from '../../db/connection';
import type { Database, User } from '../../db/schema';
import { parseCsv, stringifyCsv } from '../../lib/csv';
import { AppError } from '../../lib/errors';
import type { FileStore } from '../../lib/files';
import { VERSION } from '../../lib/version';
import { currentUser, requireAdmin } from '../../plugins/auth';
import type { RecordService } from '../records/service';
import { requireVehicle } from '../vehicles/access';
import { AXLEBOOK_HEADERS, rowsToRecords } from './parse';

const VehicleParam = z.object({ vehicleId: z.coerce.number().int().positive() });
const errors = { 400: ApiError, 403: ApiError, 404: ApiError };

/**
 * Tables in a backup, in insert order. `fks` are remapped to the new ids; a required
 * link that can't be resolved drops the row, an optional one (`optional`) becomes null.
 * `noId` tables have composite keys.
 */
const BACKUP_TABLES: {
  name: keyof Database;
  fks: Record<string, keyof Database>;
  optional?: string[];
  noId?: true;
}[] = [
  { name: 'users', fks: {} },
  { name: 'vehicles', fks: { owner_id: 'users' } },
  { name: 'vehicle_shares', fks: { vehicle_id: 'vehicles', user_id: 'users' }, noId: true },
  {
    name: 'records',
    fks: { vehicle_id: 'vehicles', created_by: 'users' },
    optional: ['created_by'],
  },
  { name: 'tags', fks: {} },
  { name: 'record_tags', fks: { record_id: 'records', tag_id: 'tags' }, noId: true },
  {
    name: 'attachments',
    fks: { vehicle_id: 'vehicles', record_id: 'records' },
    optional: ['record_id'],
  },
  {
    name: 'odometer_readings',
    fks: { vehicle_id: 'vehicles', record_id: 'records' },
    optional: ['record_id'],
  },
  { name: 'reminders', fks: { vehicle_id: 'vehicles' } },
  {
    name: 'reminder_completions',
    fks: { reminder_id: 'reminders', record_id: 'records' },
    optional: ['record_id'],
  },
  { name: 'parts', fks: { owner_id: 'users', vehicle_id: 'vehicles' }, optional: ['vehicle_id'] },
  { name: 'record_parts', fks: { record_id: 'records', part_id: 'parts' }, optional: ['part_id'] },
  {
    name: 'plan_items',
    fks: { vehicle_id: 'vehicles', converted_record_id: 'records' },
    optional: ['converted_record_id'],
  },
  { name: 'notification_channels', fks: { user_id: 'users' } },
  {
    name: 'inspections',
    fks: { vehicle_id: 'vehicles', created_by: 'users' },
    optional: ['created_by'],
  },
];

/** Tables deliberately left out of backups: sign-ins, delivery history and regenerable caches. */
export const NOT_BACKED_UP = [
  'sessions',
  'api_tokens',
  'instance_settings', // saved separately as `settings`, admins only
  'notification_log',
  'vehicle_insights',
] as const;
export const BACKED_UP = BACKUP_TABLES.map((t) => t.name);

type Rows = Record<string, Record<string, unknown>[]>;

export const importExportRoutes =
  ({
    db,
    records,
    photos,
    attachments,
  }: {
    db: DB;
    config?: Config;
    records: RecordService;
    photos: FileStore;
    attachments: FileStore;
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
        const v = await requireVehicle(db, currentUser(req), req.params.vehicleId, 'view');
        const page = await records.list(currentUser(req), {
          vehicleId: v.id,
          kind: req.query.kind === 'all' ? [] : [req.query.kind],
          sort: 'date_asc',
          limit: 500,
          offset: 0,
        });
        let items = page.items;
        for (let offset = 500; offset < page.total; offset += 500) {
          items = items.concat(
            (
              await records.list(currentUser(req), {
                vehicleId: v.id,
                kind: req.query.kind === 'all' ? [] : [req.query.kind],
                sort: 'date_asc',
                limit: 500,
                offset,
              })
            ).items,
          );
        }
        const rows: unknown[][] = [
          [...AXLEBOOK_HEADERS],
          ...items.map((r) => [
            r.date,
            r.odometer,
            r.kind,
            r.title,
            fromMilli(r.cost).toFixed(2),
            r.notes,
            r.tags.join('; '),
            r.expenseCategory,
            r.fuel ? fromMilli(r.fuel.volume) : null,
            r.fuel?.pricePerUnit != null ? fromMilli(r.fuel.pricePerUnit) : null,
            r.fuel ? r.fuel.isFull : null,
            r.fuel ? r.fuel.missedPrevious : null,
            r.fuel?.grade,
            r.fuel?.station,
          ]),
        ];
        const name = `${v.year}-${v.make}-${v.model}-${req.query.kind}`
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-');
        return reply
          .header('Content-Type', 'text/csv; charset=utf-8')
          .header('Content-Disposition', `attachment; filename="${name}.csv"`)
          .send(stringifyCsv(rows));
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
            'Accepts Axlebook exports and (experimentally) LubeLogger exports; columns are matched by name. `kind` applies when the file has no kind column. Rows identical to an existing record are skipped. Use `dryRun` to preview.',
          params: VehicleParam,
          body: z.object({
            csv: z.string().max(3_500_000),
            kind: z.enum(RECORD_KINDS).default('service'),
            dateOrder: z.enum(['mdy', 'dmy']).default('mdy'),
            dryRun: z.boolean().default(true),
          }),
          response: { 200: ImportResult, ...errors },
        },
      },
      async (req) => {
        const user = currentUser(req);
        const v = await requireVehicle(db, user, req.params.vehicleId, 'edit');
        const rows = parseCsv(req.body.csv);
        if (rows.length < 2)
          throw new AppError('validation_failed', { field: 'csv', reason: 'empty' });
        const { format, parsed } = rowsToRecords(rows, {
          kind: req.body.kind,
          dateOrder: req.body.dateOrder,
        });

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
        };
      },
    );

    // ── Backup ─────────────────────────────────────────────────────────────
    async function collect(user: User): Promise<Rows> {
      const all = user.role === 'admin';
      const vq = db.selectFrom('vehicles').selectAll();
      const vehicles = all
        ? await vq.execute()
        : await vq.where('owner_id', '=', user.id).execute();
      const vIds = vehicles.map((v) => v.id);
      const none = <T>(): Promise<T[]> => Promise.resolve([]);
      const records = vIds.length
        ? await db.selectFrom('records').selectAll().where('vehicle_id', 'in', vIds).execute()
        : [];
      const rIds = records.map((r) => r.id);
      const recordTags = rIds.length
        ? await db.selectFrom('record_tags').selectAll().where('record_id', 'in', rIds).execute()
        : [];
      const tagIds = [...new Set(recordTags.map((t) => t.tag_id))];
      const reminders = vIds.length
        ? await db.selectFrom('reminders').selectAll().where('vehicle_id', 'in', vIds).execute()
        : [];
      const remIds = reminders.map((r) => r.id);
      const [
        users,
        shares,
        tagsRows,
        files,
        readings,
        completions,
        parts,
        recordParts,
        plan,
        channels,
        inspections,
      ] = await Promise.all([
        all ? db.selectFrom('users').selectAll().execute() : Promise.resolve([user]),
        all ? db.selectFrom('vehicle_shares').selectAll().execute() : none(),
        tagIds.length
          ? db.selectFrom('tags').selectAll().where('id', 'in', tagIds).execute()
          : none(),
        vIds.length
          ? db.selectFrom('attachments').selectAll().where('vehicle_id', 'in', vIds).execute()
          : none(),
        vIds.length
          ? db.selectFrom('odometer_readings').selectAll().where('vehicle_id', 'in', vIds).execute()
          : none(),
        remIds.length
          ? db
              .selectFrom('reminder_completions')
              .selectAll()
              .where('reminder_id', 'in', remIds)
              .execute()
          : none(),
        all
          ? db.selectFrom('parts').selectAll().execute()
          : db.selectFrom('parts').selectAll().where('owner_id', '=', user.id).execute(),
        rIds.length
          ? db.selectFrom('record_parts').selectAll().where('record_id', 'in', rIds).execute()
          : none(),
        vIds.length
          ? db.selectFrom('plan_items').selectAll().where('vehicle_id', 'in', vIds).execute()
          : none(),
        all
          ? db.selectFrom('notification_channels').selectAll().execute()
          : db
              .selectFrom('notification_channels')
              .selectAll()
              .where('user_id', '=', user.id)
              .execute(),
        vIds.length
          ? db.selectFrom('inspections').selectAll().where('vehicle_id', 'in', vIds).execute()
          : none(),
      ]);
      return {
        users,
        vehicles,
        vehicle_shares: shares,
        records,
        tags: tagsRows,
        record_tags: recordTags,
        attachments: files,
        odometer_readings: readings,
        reminders,
        reminder_completions: completions,
        parts,
        record_parts: recordParts,
        plan_items: plan,
        notification_channels: channels,
        inspections,
      } as unknown as Rows;
    }

    app.get(
      '/backup',
      {
        schema: {
          tags,
          summary: 'Download a full backup (zip: JSON + photos + attachments)',
          description: 'Admins get the whole instance. Everyone else gets the vehicles they own.',
          response: { 200: z.unknown().describe('application/zip') },
        },
      },
      async (req, reply) => {
        const user = currentUser(req);
        const rows = await collect(user);
        const settings =
          user.role === 'admin'
            ? await db.selectFrom('instance_settings').selectAll().execute()
            : [];
        const files: Zippable = {};
        const read = async (store: FileStore, key: string) => {
          const chunks: Buffer[] = [];
          for await (const c of store.stream(key)) chunks.push(c as Buffer);
          return new Uint8Array(Buffer.concat(chunks));
        };
        for (const v of rows.vehicles ?? []) {
          const key = v.photo_key as string | null;
          if (key) files[`photos/${key}`] = await read(photos, key).catch(() => new Uint8Array());
        }
        for (const a of rows.attachments ?? []) {
          const key = a.storage_key as string;
          files[`attachments/${key}`] = [
            await read(attachments, key).catch(() => new Uint8Array()),
            { level: 0 },
          ];
        }
        const manifest = {
          format: 'axlebook-backup',
          version: 1,
          appVersion: VERSION,
          exportedAt: new Date().toISOString(),
          settings,
          tables: rows,
        };
        files['backup.json'] = strToU8(JSON.stringify(manifest));
        const zip = zipSync(files, { level: 6 });
        const date = new Date().toISOString().slice(0, 10);
        return reply
          .header('Content-Type', 'application/zip')
          .header('Content-Disposition', `attachment; filename="axlebook-backup-${date}.zip"`)
          .send(Buffer.from(zip));
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
        const any = await db.selectFrom('vehicles').select('id').limit(1).executeTakeFirst();
        if (any) throw new AppError('restore_not_empty');
        const file = await req.file();
        if (!file) throw new AppError('validation_failed', { field: 'file', reason: 'missing' });
        let entries: Record<string, Uint8Array>;
        try {
          entries = unzipSync(new Uint8Array(await file.toBuffer()));
        } catch {
          throw new AppError('unsupported_file');
        }
        const manifestBytes = entries['backup.json'];
        if (!manifestBytes) throw new AppError('unsupported_file');
        const manifest = JSON.parse(strFromU8(manifestBytes)) as {
          format?: string;
          version?: number;
          settings?: { key: string; value: string; updated_at: string }[];
          tables?: Rows;
        };
        if (manifest.format !== 'axlebook-backup' || manifest.version !== 1 || !manifest.tables)
          throw new AppError('unsupported_file');
        const tables = manifest.tables;

        const counts: Record<string, number> = {};
        await db.transaction().execute(async (trx) => {
          const maps = new Map<string, Map<number, number>>();
          const mapFor = (t: string) => {
            let m = maps.get(t);
            if (!m) {
              m = new Map();
              maps.set(t, m);
            }
            return m;
          };
          for (const s of manifest.settings ?? []) {
            await trx
              .insertInto('instance_settings')
              .values(s)
              .onConflict((oc) =>
                oc.column('key').doUpdateSet({ value: s.value, updated_at: s.updated_at }),
              )
              .execute();
          }
          for (const t of BACKUP_TABLES) {
            let n = 0;
            for (const raw of tables[t.name] ?? []) {
              const row: Record<string, unknown> = { ...raw };
              const oldId = row.id as number | undefined;
              delete row.id;
              let orphan = false;
              for (const [col, target] of Object.entries(t.fks)) {
                if (row[col] == null) continue;
                const mapped = maps.get(target)?.get(row[col] as number);
                if (mapped != null) row[col] = mapped;
                else if (t.optional?.includes(col)) row[col] = null;
                else orphan = true;
              }
              if (orphan) continue;
              if (t.name === 'users') {
                const existing = await trx
                  .selectFrom('users')
                  .select('id')
                  .where('username', '=', row.username as string)
                  .executeTakeFirst();
                if (existing) {
                  mapFor('users').set(oldId as number, existing.id);
                  continue;
                }
              }
              if (t.name === 'tags') {
                const existing = await trx
                  .selectFrom('tags')
                  .select('id')
                  .where('name_key', '=', row.name_key as string)
                  .executeTakeFirst();
                if (existing) {
                  mapFor('tags').set(oldId as number, existing.id);
                  continue;
                }
              }
              if (t.noId) {
                await trx
                  .insertInto(t.name)
                  .values(row as never)
                  .execute();
              } else {
                const inserted = await trx
                  .insertInto(t.name)
                  .values(row as never)
                  .returning('id' as never)
                  .executeTakeFirstOrThrow();
                mapFor(t.name).set(oldId as number, (inserted as { id: number }).id);
              }
              n++;
            }
            counts[t.name] = n;
          }
        });

        for (const [path, bytes] of Object.entries(entries)) {
          const [dir, key] = path.split('/');
          if (!key || bytes.length === 0) continue;
          const store = dir === 'photos' ? photos : dir === 'attachments' ? attachments : null;
          if (store) await store.write(key, Buffer.from(bytes));
        }
        return { restored: counts };
      },
    );
  };
