import type {
  Vehicle,
  VehicleInput,
  VehicleSection,
  VehicleSummary,
  VehicleUpdate,
} from '@axlebook/shared';
import {
  VEHICLE_SECTIONS,
  VehicleInput as VehicleInputSchema,
  VehicleUpdate as VehicleUpdateSchema,
} from '@axlebook/shared';
import type { DB } from '../../db/connection';
import type { User, VehicleRow } from '../../db/schema';
import { AppError } from '../../lib/errors';
import type { FileStore } from '../../lib/files';
import { nowIso } from '../../lib/time';
import { garageVehicleIds, requireVehicle, type VehicleAccess } from './access';

export function toVehicle(row: VehicleRow, access: VehicleAccess): Vehicle {
  return {
    id: row.id,
    ownerId: row.owner_id,
    category: row.category,
    year: row.year,
    make: row.make,
    model: row.model,
    trim: row.trim,
    nickname: row.nickname,
    unitNumber: row.unit_number,
    vin: row.vin,
    licensePlate: row.license_plate,
    color: row.color,
    odometerUnit: row.odometer_unit,
    fuelUnit: row.fuel_unit,
    fuelType: row.fuel_type as Vehicle['fuelType'],
    purchaseDate: row.purchase_date,
    purchasePrice: row.purchase_price,
    notes: row.notes,
    // The key segment busts caches when the photo is replaced.
    photoUrl: row.photo_key
      ? `/api/v1/vehicles/${row.id}/photo?v=${row.photo_key.slice(0, 8)}`
      : null,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    access,
  };
}

type Columns = Partial<
  Omit<VehicleRow, 'id' | 'owner_id' | 'photo_key' | 'archived_at' | 'created_at' | 'updated_at'>
>;

function toColumns(input: VehicleUpdate): Columns {
  const parsed = VehicleUpdateSchema.parse(input);
  const map: Record<string, keyof Columns> = {
    category: 'category',
    year: 'year',
    make: 'make',
    model: 'model',
    trim: 'trim',
    nickname: 'nickname',
    unitNumber: 'unit_number',
    vin: 'vin',
    licensePlate: 'license_plate',
    color: 'color',
    odometerUnit: 'odometer_unit',
    fuelUnit: 'fuel_unit',
    fuelType: 'fuel_type',
    purchaseDate: 'purchase_date',
    purchasePrice: 'purchase_price',
    notes: 'notes',
  };
  const cols: Record<string, unknown> = {};
  for (const [key, col] of Object.entries(map)) {
    const value = (parsed as Record<string, unknown>)[key];
    if (value !== undefined)
      cols[col] = key === 'vin' && typeof value === 'string' ? value.toUpperCase() : value;
  }
  return cols as Columns;
}

/** Extra garage-card figures computed by other modules (odometer, cost, reminders). */
export type SummaryProvider = (
  vehicleIds: number[],
) => Promise<Map<number, Pick<VehicleSummary, 'currentOdometer' | 'costToDate' | 'nextReminder'>>>;

export class VehicleService {
  private summaryProvider: SummaryProvider = async () => new Map();

  constructor(
    private readonly db: DB,
    private readonly photos: FileStore,
  ) {}

  setSummaryProvider(provider: SummaryProvider) {
    this.summaryProvider = provider;
  }

  /** The user's garage: vehicles they own plus vehicles shared with them. */
  async list(
    user: User,
    archived: 'false' | 'true' | 'all',
    section?: VehicleSection,
  ): Promise<VehicleSummary[]> {
    const access = await garageVehicleIds(this.db, user);
    if (access.size === 0) return [];
    let q = this.db
      .selectFrom('vehicles')
      .selectAll()
      .where('id', 'in', [...access.keys()]);
    if (archived === 'false') q = q.where('archived_at', 'is', null);
    if (archived === 'true') q = q.where('archived_at', 'is not', null);
    if (section) q = q.where('category', 'in', [...VEHICLE_SECTIONS[section]]);
    const rows = await q
      .orderBy('archived_at')
      .orderBy('year', 'desc')
      .orderBy('make')
      .orderBy('model')
      .execute();
    const extra = await this.summaryProvider(rows.map((r) => r.id));
    return rows.map((r) => ({
      ...toVehicle(r, access.get(r.id) ?? 'view'),
      currentOdometer: null,
      costToDate: 0,
      nextReminder: null,
      ...extra.get(r.id),
    }));
  }

  async get(user: User, id: number): Promise<Vehicle> {
    const v = await requireVehicle(this.db, user, id, 'view');
    return toVehicle(v, v.access);
  }

  async create(user: User, input: VehicleInput): Promise<Vehicle> {
    if (user.role === 'viewer') throw new AppError('forbidden');
    VehicleInputSchema.parse(input);
    const ts = nowIso();
    const row = await this.db
      .insertInto('vehicles')
      .values({
        ...(toColumns(input) as Required<Columns>),
        owner_id: user.id,
        created_at: ts,
        updated_at: ts,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toVehicle(row, 'owner');
  }

  async update(user: User, id: number, input: VehicleUpdate): Promise<Vehicle> {
    const existing = await requireVehicle(this.db, user, id, 'edit');
    const cols = toColumns(input);
    const row = await this.db
      .updateTable('vehicles')
      .set({ ...cols, updated_at: nowIso() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toVehicle(row, existing.access);
  }

  async setArchived(user: User, id: number, archived: boolean): Promise<Vehicle> {
    const existing = await requireVehicle(this.db, user, id, 'owner');
    const ts = nowIso();
    const row = await this.db
      .updateTable('vehicles')
      .set({ archived_at: archived ? (existing.archived_at ?? ts) : null, updated_at: ts })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toVehicle(row, existing.access);
  }

  /** Deletes the vehicle, its records and every stored file that belonged to it. */
  async remove(
    user: User,
    id: number,
    removeFiles: (vehicleIds: number[]) => Promise<void>,
  ): Promise<void> {
    await requireVehicle(this.db, user, id, 'owner');
    await removeFiles([id]);
    await this.db.deleteFrom('vehicles').where('id', '=', id).execute();
  }

  async setPhoto(user: User, id: number, data: Buffer, ext: string): Promise<Vehicle> {
    const existing = await requireVehicle(this.db, user, id, 'edit');
    const key = await this.photos.save(data, ext);
    const row = await this.db
      .updateTable('vehicles')
      .set({ photo_key: key, updated_at: nowIso() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    if (existing.photo_key) await this.photos.remove(existing.photo_key);
    return toVehicle(row, existing.access);
  }

  async removePhoto(user: User, id: number): Promise<Vehicle> {
    const existing = await requireVehicle(this.db, user, id, 'edit');
    const row = await this.db
      .updateTable('vehicles')
      .set({ photo_key: null, updated_at: nowIso() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    if (existing.photo_key) await this.photos.remove(existing.photo_key);
    return toVehicle(row, existing.access);
  }

  photoStream(key: string) {
    return this.photos.stream(key);
  }

  async photoKey(user: User, id: number): Promise<string> {
    const v = await requireVehicle(this.db, user, id, 'view');
    if (!v.photo_key) throw new AppError('not_found', { entity: 'photo' });
    return v.photo_key;
  }
}
