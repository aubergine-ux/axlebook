import type { DB } from '../../db/connection';
import type { User, VehicleRow } from '../../db/schema';
import { AppError } from '../../lib/errors';

export type VehicleAccess = 'view' | 'edit' | 'owner';
const RANK: Record<VehicleAccess, number> = { view: 1, edit: 2, owner: 3 };

/**
 * What `user` may do with `vehicle`, or null for no access.
 * Owners and admins have full access. Sharing (view/edit grants) arrives with
 * the multi-user milestone and plugs in here.
 */
export function accessFor(user: User, vehicle: Pick<VehicleRow, 'owner_id'>): VehicleAccess | null {
  if (vehicle.owner_id === user.id || user.role === 'admin') return 'owner';
  return null;
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
  const access = row ? accessFor(user, row) : null;
  if (!row || !access) throw new AppError('not_found', { entity: 'vehicle' });
  if (RANK[access] < RANK[need]) throw new AppError('forbidden');
  if (need !== 'view' && user.role === 'viewer') throw new AppError('forbidden');
  return { ...row, access };
}
