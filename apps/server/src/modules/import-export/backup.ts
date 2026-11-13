import fsp from 'node:fs/promises';
import path from 'node:path';
import { fromMilli, type RecordKind } from '@axlebook/shared';
import type { FastifyBaseLogger } from 'fastify';
import { strFromU8, strToU8, unzipSync, type Zippable, zipSync } from 'fflate';
import type { Config } from '../../config';
import type { DB } from '../../db/connection';
import type { Database, User } from '../../db/schema';
import { stringifyCsv } from '../../lib/csv';
import { AppError } from '../../lib/errors';
import type { FileStore } from '../../lib/files';
import { getInstanceSettings } from '../../lib/instance-settings';
import { VERSION } from '../../lib/version';
import type { RecordService } from '../records/service';
import { AXLEBOOK_HEADERS } from './parse';

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
  { name: 'vehicle_mutes', fks: { vehicle_id: 'vehicles', user_id: 'users' }, noId: true },
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
  { name: 'recalls', fks: { vehicle_id: 'vehicles' } },
  { name: 'trips', fks: { vehicle_id: 'vehicles', created_by: 'users' }, optional: ['created_by'] },
  { name: 'vehicle_documents', fks: { vehicle_id: 'vehicles' } },
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
  'history_links', // access grants: make new ones after a restore
  'notification_queue',
  'import_mappings', // point at vehicle ids; saved again by the next import
] as const;
export const BACKED_UP = BACKUP_TABLES.map((t) => t.name);

type Rows = Record<string, Record<string, unknown>[]>;

/** A backup kept on the server's data volume. */
export interface StoredBackup {
  name: string;
  size: number;
  createdAt: string;
}

const STORED_NAME = /^axlebook-backup-\d{8}-\d{6}(-[a-z]+)?\.zip$/;

/**
 * Makes and restores backups: one zip with `backup.json` (what restore reads), a CSV per vehicle,
 * and every photo and attachment. Also keeps scheduled backups on the data volume and prunes them.
 */
export class BackupService {
  private timer: NodeJS.Timeout | null = null;
  private readonly dir: string;

  constructor(
    private readonly db: DB,
    private readonly config: Config,
    private readonly records: RecordService,
    private readonly photos: FileStore,
    private readonly attachments: FileStore,
    private readonly log?: FastifyBaseLogger,
  ) {
    this.dir = path.join(config.dataDir, 'backups');
  }

  /** A vehicle's records in Axlebook's own CSV columns, oldest first. */
  async vehicleCsv(user: User, vehicleId: number, kind: 'all' | RecordKind) {
    const query = {
      vehicleId,
      kind: kind === 'all' ? [] : [kind],
      sort: 'date_asc' as const,
      limit: 500,
    };
    const page = await this.records.list(user, { ...query, offset: 0 });
    let items = page.items;
    for (let offset = 500; offset < page.total; offset += 500)
      items = items.concat((await this.records.list(user, { ...query, offset })).items);
    return stringifyCsv([
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
    ]);
  }

  private async collect(user: User): Promise<Rows> {
    const all = user.role === 'admin';
    const vq = this.db.selectFrom('vehicles').selectAll();
    const vehicles = all ? await vq.execute() : await vq.where('owner_id', '=', user.id).execute();
    const vIds = vehicles.map((v) => v.id);
    const none = <T>(): Promise<T[]> => Promise.resolve([]);
    const records = vIds.length
      ? await this.db.selectFrom('records').selectAll().where('vehicle_id', 'in', vIds).execute()
      : [];
    const rIds = records.map((r) => r.id);
    const recordTags = rIds.length
      ? await this.db.selectFrom('record_tags').selectAll().where('record_id', 'in', rIds).execute()
      : [];
    const tagIds = [...new Set(recordTags.map((t) => t.tag_id))];
    const reminders = vIds.length
      ? await this.db.selectFrom('reminders').selectAll().where('vehicle_id', 'in', vIds).execute()
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
      all ? this.db.selectFrom('users').selectAll().execute() : Promise.resolve([user]),
      all ? this.db.selectFrom('vehicle_shares').selectAll().execute() : none(),
      tagIds.length
        ? this.db.selectFrom('tags').selectAll().where('id', 'in', tagIds).execute()
        : none(),
      vIds.length
        ? this.db.selectFrom('attachments').selectAll().where('vehicle_id', 'in', vIds).execute()
        : none(),
      vIds.length
        ? this.db
            .selectFrom('odometer_readings')
            .selectAll()
            .where('vehicle_id', 'in', vIds)
            .execute()
        : none(),
      remIds.length
        ? this.db
            .selectFrom('reminder_completions')
            .selectAll()
            .where('reminder_id', 'in', remIds)
            .execute()
        : none(),
      all
        ? this.db.selectFrom('parts').selectAll().execute()
        : this.db.selectFrom('parts').selectAll().where('owner_id', '=', user.id).execute(),
      rIds.length
        ? this.db.selectFrom('record_parts').selectAll().where('record_id', 'in', rIds).execute()
        : none(),
      vIds.length
        ? this.db.selectFrom('plan_items').selectAll().where('vehicle_id', 'in', vIds).execute()
        : none(),
      all
        ? this.db.selectFrom('notification_channels').selectAll().execute()
        : this.db
            .selectFrom('notification_channels')
            .selectAll()
            .where('user_id', '=', user.id)
            .execute(),
      vIds.length
        ? this.db.selectFrom('inspections').selectAll().where('vehicle_id', 'in', vIds).execute()
        : none(),
    ]);
    const recalls = vIds.length
      ? await this.db.selectFrom('recalls').selectAll().where('vehicle_id', 'in', vIds).execute()
      : [];
    const mutes = vIds.length
      ? await this.db
          .selectFrom('vehicle_mutes')
          .selectAll()
          .where('vehicle_id', 'in', vIds)
          .where(
            'user_id',
            'in',
            users.map((u) => u.id),
          )
          .execute()
      : [];
    const trips = vIds.length
      ? await this.db.selectFrom('trips').selectAll().where('vehicle_id', 'in', vIds).execute()
      : [];
    const documents = vIds.length
      ? await this.db
          .selectFrom('vehicle_documents')
          .selectAll()
          .where('vehicle_id', 'in', vIds)
          .execute()
      : [];
    return {
      users,
      vehicles,
      vehicle_shares: shares,
      vehicle_mutes: mutes,
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
      recalls,
      trips,
      vehicle_documents: documents,
    } as unknown as Rows;
  }

  /** The backup zip: the whole instance for an admin, their own vehicles for anyone else. */
  async zip(user: User): Promise<Buffer> {
    const rows = await this.collect(user);
    const settings =
      user.role === 'admin'
        ? await this.db.selectFrom('instance_settings').selectAll().execute()
        : [];
    const files: Zippable = {};
    const read = async (store: FileStore, key: string) => {
      const chunks: Buffer[] = [];
      for await (const c of store.stream(key)) chunks.push(c as Buffer);
      return new Uint8Array(Buffer.concat(chunks));
    };
    for (const v of rows.vehicles ?? []) {
      const key = v.photo_key as string | null;
      if (key) files[`photos/${key}`] = await read(this.photos, key).catch(() => new Uint8Array());
    }
    for (const a of rows.attachments ?? []) {
      const key = a.storage_key as string;
      files[`attachments/${key}`] = [
        await read(this.attachments, key).catch(() => new Uint8Array()),
        { level: 0 },
      ];
    }
    // Scans of documents live in the same store as receipts.
    for (const d of rows.vehicle_documents ?? []) {
      const key = d.storage_key as string | null;
      if (key)
        files[`attachments/${key}`] = [
          await read(this.attachments, key).catch(() => new Uint8Array()),
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
    // The same records as plain CSV, one file per vehicle, readable without Axlebook.
    for (const v of rows.vehicles ?? []) {
      const slug = `${v.year}-${v.make}-${v.model}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      files[`csv/${v.id}-${slug}.csv`] = strToU8(
        await this.vehicleCsv(user, v.id as number, 'all'),
      );
    }
    return Buffer.from(zipSync(files, { level: 6 }));
  }

  /**
   * Load a backup. An instance that already has vehicles is only overwritten when `replace` is
   * set: what's there is deleted in the same transaction, so a backup that fails to load
   * leaves everything as it was.
   */
  async restore(bytes: Uint8Array, { replace = false } = {}): Promise<Record<string, number>> {
    const any = await this.db.selectFrom('vehicles').select('id').limit(1).executeTakeFirst();
    if (any && !replace) throw new AppError('restore_not_empty');
    // Files that belong to what's about to be replaced; removed afterwards unless restored.
    const stale = any ? await this.fileKeys() : { photos: [], attachments: [] };
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(bytes);
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
    await this.db.transaction().execute(async (trx) => {
      if (replace) {
        // Everything a backup holds goes, newest dependants first. Accounts and tags stay:
        // restoring matches them by name instead of duplicating them.
        for (const t of [...BACKUP_TABLES].reverse())
          if (t.name !== 'users' && t.name !== 'tags') await trx.deleteFrom(t.name).execute();
      }
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
      const store =
        dir === 'photos' ? this.photos : dir === 'attachments' ? this.attachments : null;
      if (store) await store.write(key, Buffer.from(bytes));
    }
    for (const key of stale.photos) if (!entries[`photos/${key}`]) await this.photos.remove(key);
    for (const key of stale.attachments)
      if (!entries[`attachments/${key}`]) await this.attachments.remove(key);
    return counts;
  }

  /** Storage keys of every file the database points at. */
  private async fileKeys() {
    const [vehicles, attachments, documents] = await Promise.all([
      this.db.selectFrom('vehicles').select('photo_key').execute(),
      this.db.selectFrom('attachments').select('storage_key').execute(),
      this.db.selectFrom('vehicle_documents').select('storage_key').execute(),
    ]);
    return {
      photos: vehicles.flatMap((v) => (v.photo_key ? [v.photo_key] : [])),
      attachments: [
        ...attachments.map((a) => a.storage_key),
        ...documents.flatMap((d) => (d.storage_key ? [d.storage_key] : [])),
      ],
    };
  }

  // ── Backups kept on the server ───────────────────────────────────────────

  private file(name: string): string {
    if (!STORED_NAME.test(name)) throw new AppError('not_found', { entity: 'backup' });
    return path.join(this.dir, name);
  }

  async stored(): Promise<StoredBackup[]> {
    const names = await fsp.readdir(this.dir).catch(() => [] as string[]);
    const out: StoredBackup[] = [];
    for (const name of names.filter((n) => STORED_NAME.test(n))) {
      const stat = await fsp.stat(path.join(this.dir, name)).catch(() => null);
      if (stat) out.push({ name, size: stat.size, createdAt: stat.mtime.toISOString() });
    }
    return out.sort((a, b) => b.name.localeCompare(a.name));
  }

  async read(name: string): Promise<Buffer> {
    return fsp.readFile(this.file(name)).catch(() => {
      throw new AppError('not_found', { entity: 'backup' });
    });
  }

  async remove(name: string): Promise<void> {
    await fsp.rm(this.file(name), { force: true });
  }

  /** Write a whole-instance backup to the data volume, then drop the oldest beyond `keep`. */
  async store(kind: 'scheduled' | 'manual' | 'prerestore' = 'manual', now = new Date()) {
    const admin = await this.db
      .selectFrom('users')
      .selectAll()
      .where('role', '=', 'admin')
      .where('disabled', '=', 0)
      .orderBy('id')
      .executeTakeFirst();
    // Without an admin there's nobody whose view covers the whole instance.
    if (!admin) throw new AppError('setup_required');
    const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const name = `axlebook-backup-${stamp}${kind === 'scheduled' ? '' : `-${kind}`}.zip`;
    await fsp.mkdir(this.dir, { recursive: true });
    const data = await this.zip(admin);
    // Written under another name first, so a crash can't leave half a backup that looks whole.
    const tmp = path.join(this.dir, `${name}.part`);
    await fsp.writeFile(tmp, data);
    await fsp.rename(tmp, path.join(this.dir, name));
    const { backupKeep } = await getInstanceSettings(this.db, this.config);
    await this.prune(backupKeep);
    return { name, size: data.length, createdAt: now.toISOString() };
  }

  /** Keep the newest `keep` backups and delete the rest. */
  async prune(keep: number): Promise<string[]> {
    const extra = (await this.stored()).slice(Math.max(1, keep));
    for (const b of extra) await this.remove(b.name);
    return extra.map((b) => b.name);
  }

  /** Restore one of the stored backups over what's here, after saving what's here first. */
  async restoreStored(name: string): Promise<Record<string, number>> {
    const data = await this.read(name);
    await this.store('prerestore');
    return this.restore(new Uint8Array(data), { replace: true });
  }

  /** Make the scheduled backup if one is due. */
  async tick(now = new Date()): Promise<StoredBackup | null> {
    const { backupEnabled, backupEveryHours } = await getInstanceSettings(this.db, this.config);
    if (!backupEnabled) return null;
    const last = (await this.stored())[0];
    if (last && now.getTime() - Date.parse(last.createdAt) < backupEveryHours * 3_600_000)
      return null;
    if (!(await this.db.selectFrom('vehicles').select('id').limit(1).executeTakeFirst()))
      return null;
    return this.store('scheduled', now);
  }

  start() {
    const run = () => this.tick().catch((err) => this.log?.error({ err }, 'backup failed'));
    this.timer = setInterval(run, 15 * 60_000);
    this.timer.unref();
    setTimeout(run, 60_000).unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}
