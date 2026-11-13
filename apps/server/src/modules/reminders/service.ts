import {
  compareReminders,
  computeReminderStatus,
  distancePerDay,
  type OdometerPoint,
  predictDue,
  type Reminder,
  ReminderInput,
  type ReminderInput as ReminderInputType,
  today,
  vehicleTitle,
} from '@axlebook/shared';
import type { Config } from '../../config';
import type { DB } from '../../db/connection';
import type { ReminderRow, User, VehicleRow } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { getInstanceSettings } from '../../lib/instance-settings';
import { nowIso } from '../../lib/time';
import { currentOdometers } from '../odometer/routes';
import { completeReminder } from '../records/service';
import { garageVehicleIds, requireVehicle, type VehicleAccess } from '../vehicles/access';

/** Each vehicle's usual distance per day, from its odometer log. */
export async function vehiclePace(
  db: DB,
  vehicleIds: number[],
  todayIso: string,
): Promise<Map<number, number>> {
  if (vehicleIds.length === 0) return new Map();
  const rows = await db
    .selectFrom('odometer_readings')
    .select(['vehicle_id', 'date', 'odometer'])
    .where('vehicle_id', 'in', vehicleIds)
    .execute();
  const byVehicle = new Map<number, OdometerPoint[]>();
  for (const r of rows) {
    const list = byVehicle.get(r.vehicle_id) ?? [];
    list.push({ date: r.date, odometer: r.odometer });
    byVehicle.set(r.vehicle_id, list);
  }
  const out = new Map<number, number>();
  for (const [id, points] of byVehicle) {
    const perDay = distancePerDay(points, todayIso);
    if (perDay != null) out.set(id, perDay);
  }
  return out;
}

export class ReminderService {
  constructor(
    private readonly db: DB,
    private readonly config: Config,
  ) {}

  today() {
    return today(this.config.timeZone);
  }

  /** Turn rows into DTOs with live status, sorted most urgent first. */
  async present(
    rows: ReminderRow[],
    vehicles: Map<number, VehicleRow>,
    access: Map<number, VehicleAccess>,
  ): Promise<Reminder[]> {
    if (rows.length === 0) return [];
    const odo = await currentOdometers(this.db, [...new Set(rows.map((r) => r.vehicle_id))]);
    const last = await this.db
      .selectFrom('reminder_completions')
      .select((eb) => ['reminder_id', eb.fn.max('completed_at').as('at')])
      .where(
        'reminder_id',
        'in',
        rows.map((r) => r.id),
      )
      .groupBy('reminder_id')
      .execute();
    const lastBy = new Map(last.map((l) => [l.reminder_id, String(l.at)]));
    const t = this.today();
    const pace = await this.pace([...odo.keys()], t);
    const list = rows.map((r) => {
      const v = vehicles.get(r.vehicle_id) as VehicleRow;
      const state = computeReminderStatus(
        {
          dueMode: r.due_mode,
          dueDate: r.due_date,
          dueOdometer: r.due_odometer,
          soonDays: r.soon_days,
          soonDistance: r.soon_distance,
          archived: r.archived_at != null,
        },
        t,
        odo.get(r.vehicle_id) ?? null,
      );
      const perDay = pace.get(r.vehicle_id) ?? null;
      const prediction =
        state.status === 'inactive'
          ? { predictedDueDate: null, predictedBy: null }
          : predictDue(
              { dueMode: r.due_mode, dueDate: r.due_date, dueOdometer: r.due_odometer },
              odo.get(r.vehicle_id) ?? null,
              perDay,
              t,
            );
      return {
        id: r.id,
        vehicleId: r.vehicle_id,
        vehicleTitle: v.nickname ?? vehicleTitle(v),
        odometerUnit: v.odometer_unit,
        title: r.title,
        notes: r.notes,
        dueMode: r.due_mode,
        dueDate: r.due_date,
        dueOdometer: r.due_odometer,
        intervalMonths: r.interval_months,
        intervalDistance: r.interval_distance,
        soonDays: r.soon_days,
        soonDistance: r.soon_distance,
        archivedAt: r.archived_at,
        ...state,
        ...prediction,
        distancePerDay: perDay == null ? null : Math.round(perDay * 10) / 10,
        lastCompletedAt: lastBy.get(r.id) ?? null,
        canEdit: (access.get(r.vehicle_id) ?? 'view') !== 'view',
      } satisfies Reminder;
    });
    return list.sort(compareReminders);
  }

  pace(vehicleIds: number[], todayIso: string) {
    return vehiclePace(this.db, vehicleIds, todayIso);
  }

  async listForVehicle(
    user: User,
    vehicleId: number,
    includeArchived: boolean,
  ): Promise<Reminder[]> {
    const v = await requireVehicle(this.db, user, vehicleId, 'view');
    let q = this.db.selectFrom('reminders').selectAll().where('vehicle_id', '=', vehicleId);
    if (!includeArchived) q = q.where('archived_at', 'is', null);
    return this.present(await q.execute(), new Map([[v.id, v]]), new Map([[v.id, v.access]]));
  }

  /** Every active reminder across the garage (archived vehicles excluded). */
  async listAll(user: User): Promise<Reminder[]> {
    const access = await garageVehicleIds(this.db, user);
    if (access.size === 0) return [];
    const vehicles = await this.db
      .selectFrom('vehicles')
      .selectAll()
      .where('id', 'in', [...access.keys()])
      .where('archived_at', 'is', null)
      .execute();
    if (vehicles.length === 0) return [];
    const rows = await this.db
      .selectFrom('reminders')
      .selectAll()
      .where(
        'vehicle_id',
        'in',
        vehicles.map((v) => v.id),
      )
      .where('archived_at', 'is', null)
      .execute();
    return this.present(rows, new Map(vehicles.map((v) => [v.id, v])), access);
  }

  private async load(user: User, id: number, need: VehicleAccess) {
    const row = await this.db
      .selectFrom('reminders')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw new AppError('not_found', { entity: 'reminder' });
    const vehicle = await requireVehicle(this.db, user, row.vehicle_id, need);
    return { row, vehicle };
  }

  private async one(user: User, id: number): Promise<Reminder> {
    const { row, vehicle } = await this.load(user, id, 'view');
    return (
      await this.present(
        [row],
        new Map([[vehicle.id, vehicle]]),
        new Map([[vehicle.id, vehicle.access]]),
      )
    )[0] as Reminder;
  }

  get(user: User, id: number) {
    return this.one(user, id);
  }

  private async columns(input: ReminderInputType, vehicle: VehicleRow) {
    const d = ReminderInput.parse(input);
    const defaults = await getInstanceSettings(this.db, this.config);
    return {
      title: d.title,
      notes: d.notes ?? null,
      due_mode: d.dueMode,
      due_date: d.dueMode === 'distance' ? null : (d.dueDate ?? null),
      due_odometer: d.dueMode === 'date' ? null : (d.dueOdometer ?? null),
      interval_months: d.dueMode === 'distance' ? null : (d.intervalMonths ?? null),
      interval_distance: d.dueMode === 'date' ? null : (d.intervalDistance ?? null),
      soon_days: d.soonDays ?? defaults.soonDays,
      soon_distance:
        d.soonDistance ??
        (vehicle.odometer_unit === 'km' ? defaults.soonDistanceKm : defaults.soonDistanceMi),
    };
  }

  async create(user: User, vehicleId: number, input: ReminderInputType): Promise<Reminder> {
    const vehicle = await requireVehicle(this.db, user, vehicleId, 'edit');
    const ts = nowIso();
    const row = await this.db
      .insertInto('reminders')
      .values({
        ...(await this.columns(input, vehicle)),
        vehicle_id: vehicleId,
        created_at: ts,
        updated_at: ts,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return this.one(user, row.id);
  }

  async update(user: User, id: number, input: ReminderInputType): Promise<Reminder> {
    const { vehicle } = await this.load(user, id, 'edit');
    await this.db
      .updateTable('reminders')
      .set({
        ...(await this.columns(input, vehicle)),
        last_notified_status: null,
        updated_at: nowIso(),
      })
      .where('id', '=', id)
      .execute();
    return this.one(user, id);
  }

  async setArchived(user: User, id: number, archived: boolean): Promise<Reminder> {
    await this.load(user, id, 'edit');
    await this.db
      .updateTable('reminders')
      .set({
        archived_at: archived ? nowIso() : null,
        last_notified_status: null,
        updated_at: nowIso(),
      })
      .where('id', '=', id)
      .execute();
    return this.one(user, id);
  }

  async remove(user: User, id: number): Promise<void> {
    await this.load(user, id, 'edit');
    await this.db.deleteFrom('reminders').where('id', '=', id).execute();
  }

  /** Mark done without logging a record (e.g. "checked tire pressure"). */
  async complete(
    user: User,
    id: number,
    done: { date: string; odometer?: number | null },
  ): Promise<Reminder> {
    const { row } = await this.load(user, id, 'edit');
    let odometer = done.odometer ?? null;
    if (odometer == null)
      odometer = (await currentOdometers(this.db, [row.vehicle_id])).get(row.vehicle_id) ?? null;
    await this.db
      .transaction()
      .execute((trx) => completeReminder(trx, row, { date: done.date, odometer, recordId: null }));
    return this.one(user, id);
  }

  /** Most urgent active reminder per vehicle, for garage cards. */
  async nextByVehicle(vehicleIds: number[]) {
    if (vehicleIds.length === 0) return new Map<number, Reminder>();
    const vehicles = await this.db
      .selectFrom('vehicles')
      .selectAll()
      .where('id', 'in', vehicleIds)
      .execute();
    const rows = await this.db
      .selectFrom('reminders')
      .selectAll()
      .where('vehicle_id', 'in', vehicleIds)
      .where('archived_at', 'is', null)
      .execute();
    const list = await this.present(rows, new Map(vehicles.map((v) => [v.id, v])), new Map());
    const map = new Map<number, Reminder>();
    for (const r of list) if (!map.has(r.vehicleId)) map.set(r.vehicleId, r);
    return map;
  }
}
