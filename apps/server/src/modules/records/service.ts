import {
  type Attachment,
  type LogRecord,
  multiplyMilli,
  nextDue,
  RecordInput,
  type RecordInput as RecordInputType,
  type RecordListQuery,
  type RecordPage,
} from '@axlebook/shared';
import type { Kysely } from 'kysely';
import type { z } from 'zod';
import type { DB } from '../../db/connection';
import type { Database, RecordRow, ReminderRow, User } from '../../db/schema';
import { AppError } from '../../lib/errors';
import type { FileStore } from '../../lib/files';
import { nowIso } from '../../lib/time';
import { garageVehicleIds, requireVehicle } from '../vehicles/access';

type Tx = Kysely<Database>;
type ListQuery = z.output<typeof RecordListQuery>;
type ParsedInput = z.output<typeof RecordInput>;

export function attachmentDto(a: {
  id: number;
  record_id: number | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}): Attachment {
  return {
    id: a.id,
    recordId: a.record_id,
    name: a.original_name,
    mimeType: a.mime_type,
    size: a.size_bytes,
    url: `/api/v1/attachments/${a.id}`,
    createdAt: a.created_at,
  };
}

/** Escape LIKE wildcards in user input. */
const likePattern = (q: string) => `%${q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export class RecordService {
  constructor(
    private readonly db: DB,
    private readonly attachments: FileStore,
  ) {}

  // ── Reading ──────────────────────────────────────────────────────────────

  /** Attach tags, parts, attachments and completions to rows in a few batched queries. */
  async hydrate(rows: RecordRow[], db: Tx = this.db): Promise<LogRecord[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [tags, parts, files, completions] = await Promise.all([
      db
        .selectFrom('record_tags')
        .innerJoin('tags', 'tags.id', 'record_tags.tag_id')
        .select(['record_tags.record_id', 'tags.name'])
        .where('record_tags.record_id', 'in', ids)
        .orderBy('tags.name_key')
        .execute(),
      db
        .selectFrom('record_parts')
        .selectAll()
        .where('record_id', 'in', ids)
        .orderBy('id')
        .execute(),
      db
        .selectFrom('attachments')
        .selectAll()
        .where('record_id', 'in', ids)
        .orderBy('id')
        .execute(),
      db
        .selectFrom('reminder_completions')
        .select(['record_id', 'reminder_id'])
        .where('record_id', 'in', ids)
        .execute(),
    ]);
    const group = <T extends { record_id: number | null }>(list: T[]) => {
      const m = new Map<number, T[]>();
      for (const item of list)
        if (item.record_id != null) m.set(item.record_id, [...(m.get(item.record_id) ?? []), item]);
      return m;
    };
    const tagsBy = group(tags);
    const partsBy = group(parts);
    const filesBy = group(files);
    const compBy = group(completions);

    return rows.map((r) => ({
      id: r.id,
      vehicleId: r.vehicle_id,
      kind: r.kind,
      date: r.date,
      odometer: r.odometer,
      title: r.title,
      cost: r.cost,
      notes: r.notes,
      tags: (tagsBy.get(r.id) ?? []).map((t) => t.name),
      expenseCategory: (r.expense_category as LogRecord['expenseCategory']) ?? null,
      fuel:
        r.kind === 'fuel' && r.fuel_volume != null
          ? {
              volume: r.fuel_volume,
              pricePerUnit: r.price_per_unit,
              isFull: Boolean(r.is_full),
              missedPrevious: Boolean(r.missed_previous),
              grade: r.fuel_grade,
              station: r.station,
              jurisdiction: r.jurisdiction,
            }
          : null,
      parts: (partsBy.get(r.id) ?? []).map((p) => ({
        partId: p.part_id,
        name: p.name,
        quantity: p.quantity,
        unitCost: p.unit_cost,
      })),
      attachments: (filesBy.get(r.id) ?? []).map(attachmentDto),
      completedReminderIds: (compBy.get(r.id) ?? []).map((c) => c.reminder_id),
      clientId: r.client_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  /**
   * Records across the user's garage (or one vehicle), filtered and paged.
   * `q` matches title, notes, station and tag names, case-insensitively.
   */
  async list(user: User, query: ListQuery): Promise<RecordPage> {
    let vehicleIds: number[];
    if (query.vehicleId) {
      await requireVehicle(this.db, user, query.vehicleId, 'view');
      vehicleIds = [query.vehicleId];
    } else {
      vehicleIds = [...(await garageVehicleIds(this.db, user)).keys()];
    }
    if (vehicleIds.length === 0) return { items: [], total: 0, totalCost: 0 };

    let q = this.db.selectFrom('records').where('records.vehicle_id', 'in', vehicleIds);
    if (query.kind.length) q = q.where('records.kind', 'in', query.kind);
    if (query.from) q = q.where('records.date', '>=', query.from);
    if (query.to) q = q.where('records.date', '<=', query.to);
    if (query.tag) {
      const key = query.tag.toLowerCase();
      q = q.where((eb) =>
        eb.exists(
          eb
            .selectFrom('record_tags')
            .innerJoin('tags', 'tags.id', 'record_tags.tag_id')
            .select('record_tags.record_id')
            .whereRef('record_tags.record_id', '=', 'records.id')
            .where('tags.name_key', '=', key),
        ),
      );
    }
    if (query.q) {
      const pattern = likePattern(query.q);
      q = q.where((eb) =>
        eb.or([
          eb(eb.fn('lower', ['records.title']), 'like', pattern),
          eb(eb.fn('lower', ['records.notes']), 'like', pattern),
          eb(eb.fn('lower', ['records.station']), 'like', pattern),
          eb.exists(
            eb
              .selectFrom('record_tags')
              .innerJoin('tags', 'tags.id', 'record_tags.tag_id')
              .select('record_tags.record_id')
              .whereRef('record_tags.record_id', '=', 'records.id')
              .where('tags.name_key', 'like', pattern),
          ),
        ]),
      );
    }

    const agg = await q
      .select((eb) => [
        eb.fn.countAll<number>().as('n'),
        eb.fn.coalesce(eb.fn.sum<number>('records.cost'), eb.lit(0)).as('cost'),
      ])
      .executeTakeFirstOrThrow();

    let ordered = q.selectAll('records');
    switch (query.sort) {
      case 'date_asc':
        ordered = ordered.orderBy('records.date', 'asc').orderBy('records.odometer', 'asc');
        break;
      case 'cost_desc':
        ordered = ordered.orderBy('records.cost', 'desc');
        break;
      case 'odometer_desc':
        ordered = ordered.orderBy('records.odometer', 'desc');
        break;
      default:
        ordered = ordered.orderBy('records.date', 'desc').orderBy('records.odometer', 'desc');
    }
    const rows = await ordered
      .orderBy('records.id', 'desc')
      .limit(query.limit)
      .offset(query.offset)
      .execute();
    return { items: await this.hydrate(rows), total: Number(agg.n), totalCost: Number(agg.cost) };
  }

  async get(user: User, id: number): Promise<LogRecord> {
    const row = await this.db
      .selectFrom('records')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw new AppError('not_found', { entity: 'record' });
    await requireVehicle(this.db, user, row.vehicle_id, 'view');
    return (await this.hydrate([row]))[0] as LogRecord;
  }

  // ── Writing ──────────────────────────────────────────────────────────────

  async create(user: User, vehicleId: number, input: RecordInputType): Promise<LogRecord> {
    const vehicle = await requireVehicle(this.db, user, vehicleId, 'edit');
    const data = RecordInput.parse(input);

    // Offline sync retries send the same clientId; return the record already saved.
    if (data.clientId) {
      const existing = await this.db
        .selectFrom('records')
        .selectAll()
        .where('client_id', '=', data.clientId)
        .executeTakeFirst();
      if (existing) {
        await requireVehicle(this.db, user, existing.vehicle_id, 'view');
        return (await this.hydrate([existing]))[0] as LogRecord;
      }
    }

    return this.db.transaction().execute(async (trx) => {
      const ts = nowIso();
      const row = await trx
        .insertInto('records')
        .values({
          ...this.columns(data),
          vehicle_id: vehicleId,
          client_id: data.clientId ?? null,
          created_by: user.id,
          created_at: ts,
          updated_at: ts,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await this.setTags(trx, row.id, data.tags);
      await this.applyParts(trx, row.id, data.parts, vehicle.owner_id, user.id);
      await this.syncReading(trx, row);
      await this.completeReminders(trx, row, data.completesReminderIds);
      return (await this.hydrate([row], trx))[0] as LogRecord;
    });
  }

  async update(user: User, id: number, input: RecordInputType): Promise<LogRecord> {
    const existing = await this.db
      .selectFrom('records')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!existing) throw new AppError('not_found', { entity: 'record' });
    const vehicle = await requireVehicle(this.db, user, existing.vehicle_id, 'edit');
    const data = RecordInput.parse(input);
    if (data.kind !== existing.kind && (data.kind === 'fuel' || existing.kind === 'fuel')) {
      throw new AppError('validation_failed', { field: 'kind', reason: 'fuel_kind_change' });
    }

    return this.db.transaction().execute(async (trx) => {
      const row = await trx
        .updateTable('records')
        .set({ ...this.columns(data), updated_at: nowIso() })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
      await this.setTags(trx, id, data.tags);
      await this.restoreParts(trx, id);
      await this.applyParts(trx, id, data.parts, vehicle.owner_id, user.id);
      await this.syncReading(trx, row);
      const already = new Set(
        (
          await trx
            .selectFrom('reminder_completions')
            .select('reminder_id')
            .where('record_id', '=', id)
            .execute()
        ).map((c) => c.reminder_id),
      );
      await this.completeReminders(
        trx,
        row,
        data.completesReminderIds.filter((r) => !already.has(r)),
      );
      return (await this.hydrate([row], trx))[0] as LogRecord;
    });
  }

  async remove(user: User, id: number): Promise<void> {
    const existing = await this.db
      .selectFrom('records')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!existing) throw new AppError('not_found', { entity: 'record' });
    await requireVehicle(this.db, user, existing.vehicle_id, 'edit');
    const keys = await this.db
      .selectFrom('attachments')
      .select('storage_key')
      .where('record_id', '=', id)
      .execute();
    await this.db.transaction().execute(async (trx) => {
      await this.restoreParts(trx, id);
      await this.revertReminders(trx, id);
      await trx.deleteFrom('records').where('id', '=', id).execute();
    });
    for (const k of keys) await this.attachments.remove(k.storage_key);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private columns(d: ParsedInput) {
    const fuel = d.kind === 'fuel' ? d.fuel : null;
    // For fuel, an omitted total is derived from volume × price.
    const cost =
      fuel && d.cost === 0 && fuel.pricePerUnit
        ? multiplyMilli(fuel.volume, fuel.pricePerUnit)
        : d.cost;
    return {
      kind: d.kind,
      date: d.date,
      odometer: d.odometer ?? null,
      title: d.title ?? null,
      cost,
      notes: d.notes ?? null,
      expense_category: d.kind === 'expense' ? (d.expenseCategory ?? 'other') : null,
      fuel_volume: fuel?.volume ?? null,
      price_per_unit: fuel?.pricePerUnit ?? null,
      is_full: fuel ? (fuel.isFull ? 1 : 0) : null,
      missed_previous: fuel ? (fuel.missedPrevious ? 1 : 0) : null,
      fuel_grade: fuel?.grade ?? null,
      station: fuel?.station ?? null,
      jurisdiction: fuel?.jurisdiction ?? null,
    };
  }

  private async setTags(trx: Tx, recordId: number, names: string[]) {
    await trx.deleteFrom('record_tags').where('record_id', '=', recordId).execute();
    // First spelling wins: ["Oil", "oil"] → "Oil".
    const unique = new Map<string, string>();
    for (const n of names) if (!unique.has(n.toLowerCase())) unique.set(n.toLowerCase(), n);
    for (const [key, name] of unique) {
      let tag = await trx
        .selectFrom('tags')
        .select('id')
        .where('name_key', '=', key)
        .executeTakeFirst();
      tag ??= await trx
        .insertInto('tags')
        .values({ name, name_key: key })
        .returning('id')
        .executeTakeFirstOrThrow();
      await trx.insertInto('record_tags').values({ record_id: recordId, tag_id: tag.id }).execute();
    }
  }

  /** Use parts from inventory: snapshot name and cost, decrement stock (may go negative). */
  private async applyParts(
    trx: Tx,
    recordId: number,
    parts: ParsedInput['parts'],
    ownerId: number,
    userId: number,
  ) {
    for (const use of parts) {
      const part = await trx
        .selectFrom('parts')
        .selectAll()
        .where('id', '=', use.partId)
        .executeTakeFirst();
      if (!part || (part.owner_id !== ownerId && part.owner_id !== userId)) {
        throw new AppError('validation_failed', {
          field: 'parts',
          reason: 'unknown_part',
          partId: use.partId,
        });
      }
      await trx
        .insertInto('record_parts')
        .values({
          record_id: recordId,
          part_id: part.id,
          quantity: use.quantity,
          unit_cost: part.unit_cost,
          name: part.name,
        })
        .execute();
      await trx
        .updateTable('parts')
        .set((eb) => ({ quantity: eb('quantity', '-', use.quantity), updated_at: nowIso() }))
        .where('id', '=', part.id)
        .execute();
    }
  }

  /** Put back stock taken by a record and forget its part lines. */
  private async restoreParts(trx: Tx, recordId: number) {
    const used = await trx
      .selectFrom('record_parts')
      .selectAll()
      .where('record_id', '=', recordId)
      .execute();
    for (const u of used) {
      if (u.part_id != null) {
        await trx
          .updateTable('parts')
          .set((eb) => ({ quantity: eb('quantity', '+', u.quantity), updated_at: nowIso() }))
          .where('id', '=', u.part_id)
          .execute();
      }
    }
    await trx.deleteFrom('record_parts').where('record_id', '=', recordId).execute();
  }

  /** Keep the odometer log in step with the record's reading. */
  private async syncReading(trx: Tx, row: RecordRow) {
    const existing = await trx
      .selectFrom('odometer_readings')
      .select('id')
      .where('record_id', '=', row.id)
      .executeTakeFirst();
    const ts = nowIso();
    if (row.odometer == null) {
      if (existing)
        await trx.deleteFrom('odometer_readings').where('id', '=', existing.id).execute();
      return;
    }
    if (existing) {
      await trx
        .updateTable('odometer_readings')
        .set({
          date: row.date,
          odometer: row.odometer,
          jurisdiction: row.jurisdiction,
          updated_at: ts,
        })
        .where('id', '=', existing.id)
        .execute();
    } else {
      await trx
        .insertInto('odometer_readings')
        .values({
          vehicle_id: row.vehicle_id,
          record_id: row.id,
          date: row.date,
          odometer: row.odometer,
          // A fill-up's jurisdiction also marks where the vehicle was (IFTA worksheet).
          jurisdiction: row.jurisdiction,
          created_at: ts,
          updated_at: ts,
        })
        .execute();
    }
  }

  /**
   * Completing a reminder: recurring ones reschedule from this record's date and
   * odometer, one-off ones are archived. The previous due point is kept so deleting
   * the record can undo it.
   */
  private async completeReminders(trx: Tx, row: RecordRow, reminderIds: number[]) {
    for (const reminderId of reminderIds) {
      const r = await trx
        .selectFrom('reminders')
        .selectAll()
        .where('id', '=', reminderId)
        .executeTakeFirst();
      if (!r || r.vehicle_id !== row.vehicle_id) {
        throw new AppError('validation_failed', {
          field: 'completesReminderIds',
          reason: 'unknown_reminder',
          reminderId,
        });
      }
      await completeReminder(trx, r, { date: row.date, odometer: row.odometer, recordId: row.id });
    }
  }

  /** Undo completions made by a record that's being deleted, if they're still the latest. */
  private async revertReminders(trx: Tx, recordId: number) {
    const comps = await trx
      .selectFrom('reminder_completions')
      .selectAll()
      .where('record_id', '=', recordId)
      .execute();
    for (const c of comps) {
      const latest = await trx
        .selectFrom('reminder_completions')
        .select('id')
        .where('reminder_id', '=', c.reminder_id)
        .orderBy('id', 'desc')
        .executeTakeFirst();
      if (latest?.id === c.id) {
        await trx
          .updateTable('reminders')
          .set({
            due_date: c.previous_due_date,
            due_odometer: c.previous_due_odometer,
            archived_at: null,
            last_notified_status: null,
            updated_at: nowIso(),
          })
          .where('id', '=', c.reminder_id)
          .execute();
      }
      await trx.deleteFrom('reminder_completions').where('id', '=', c.id).execute();
    }
  }
}

export async function completeReminder(
  trx: Tx,
  r: ReminderRow,
  done: { date: string; odometer: number | null; recordId: number | null },
) {
  const ts = nowIso();
  await trx
    .insertInto('reminder_completions')
    .values({
      reminder_id: r.id,
      record_id: done.recordId,
      completed_at: done.date,
      previous_due_date: r.due_date,
      previous_due_odometer: r.due_odometer,
    })
    .execute();
  const recurring = r.interval_months != null || r.interval_distance != null;
  if (recurring) {
    const next = nextDue({ months: r.interval_months, distance: r.interval_distance }, done);
    await trx
      .updateTable('reminders')
      .set({
        due_date: next.dueDate ?? (r.interval_months ? r.due_date : null),
        due_odometer: next.dueOdometer ?? (r.interval_distance ? r.due_odometer : null),
        last_notified_status: null,
        updated_at: ts,
      })
      .where('id', '=', r.id)
      .execute();
  } else {
    await trx
      .updateTable('reminders')
      .set({ archived_at: ts, last_notified_status: null, updated_at: ts })
      .where('id', '=', r.id)
      .execute();
  }
}
