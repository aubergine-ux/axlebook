import type { DB } from '../../db/connection';
import type { User, VehicleRow } from '../../db/schema';
import { AppError } from '../../lib/errors';

export type VehicleAccess = 'view' | 'edit' | 'owner';
const RANK: Record<VehicleAccess, number> = { view: 1, edit: 2, owner: 3 };

/**
 * Access rules:
 * - owner and admins: full control (admins can reach any vehicle by id)
 * - shared with "edit": add and change records; can't delete, archive or re-share the vehicle
 * - shared with "view": read only
 * - the viewer role is read-only everywhere, whatever the share says
 */
export async function accessFor(
  db: DB,
  user: User,
  vehicle: Pick<VehicleRow, 'id' | 'owner_id'>,
): Promise<VehicleAccess | null> {
  let access: VehicleAccess | null = null;
  if (vehicle.owner_id === user.id || user.role === 'admin') access = 'owner';
  else {
    const share = await db
      .selectFrom('vehicle_shares')
      .select('permission')
      .where('vehicle_id', '=', vehicle.id)
      .where('user_id', '=', user.id)
      .executeTakeFirst();
    access = share?.permission ?? null;
  }
  if (access && user.role === 'viewer') return 'view';
  return access;
}

/**
 * Load a vehicle the user can access at the required level.
 * Missing and inaccessible vehicles both give `not_found`, so ids can't be probed.
 */
export async function requireVehicle(
  db: DB,
  user: User | null,
  id: number,
  need: VehicleAccess,
): Promise<VehicleRow & { access: VehicleAccess }> {
  if (!user) throw new AppError('unauthorized');
  const row = await db.selectFrom('vehicles').selectAll().where('id', '=', id).executeTakeFirst();
  const access = row ? await accessFor(db, user, row) : null;
  if (!row || !access) throw new AppError('not_found', { entity: 'vehicle' });
  if (RANK[access] < RANK[need]) throw new AppError('forbidden');
  return { ...row, access };
}

/** Vehicles shown in the user's garage, lists and reports: owned plus shared with them. */
export async function garageVehicleIds(db: DB, user: User): Promise<Map<number, VehicleAccess>> {
  const owned = await db
    .selectFrom('vehicles')
    .select('id')
    .where('owner_id', '=', user.id)
    .execute();
  const shared = await db
    .selectFrom('vehicle_shares')
    .select(['vehicle_id', 'permission'])
    .where('user_id', '=', user.id)
    .execute();
  const viewerOnly = user.role === 'viewer';
  const map = new Map<number, VehicleAccess>();
  for (const s of shared) map.set(s.vehicle_id, viewerOnly ? 'view' : s.permission);
  for (const o of owned) map.set(o.id, viewerOnly ? 'view' : 'owner');
  return map;
}
