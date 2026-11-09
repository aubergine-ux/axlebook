import { type Me, parseViewPrefs, type UserAdmin } from '@axlebook/shared';
import type { Config } from '../../config';
import type { DB } from '../../db/connection';
import type { User } from '../../db/schema';
import { hashPassword } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import { nowIso } from '../../lib/time';

export function toMe(user: User, config: Config): Me {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    email: user.email,
    role: user.role,
    unitSystem: user.unit_system ?? config.defaults.unitSystem,
    locale: user.locale ?? config.defaults.locale,
    theme: user.theme,
    ...parseViewPrefs(user.view_prefs),
    hasPassword: Boolean(user.password_hash),
    oidcLinked: Boolean(user.oidc_subject),
  };
}

export function toUserAdmin(user: User): UserAdmin {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    email: user.email,
    role: user.role,
    disabled: Boolean(user.disabled),
    hasPassword: Boolean(user.password_hash),
    oidcLinked: Boolean(user.oidc_subject),
    createdAt: user.created_at,
  };
}

/** No one can sign in yet: no password and no linked SSO identity on any account. */
export async function isSetupRequired(db: DB): Promise<boolean> {
  const row = await db
    .selectFrom('users')
    .select('id')
    .where((eb) => eb.or([eb('password_hash', 'is not', null), eb('oidc_subject', 'is not', null)]))
    .limit(1)
    .executeTakeFirst();
  return !row;
}

/**
 * Create the first admin. If an account already exists without credentials (data
 * entered before sign-in existed), it becomes the admin so nothing is orphaned.
 */
export async function performSetup(
  db: DB,
  input: { username: string; password: string; displayName?: string | null },
): Promise<User> {
  if (!(await isSetupRequired(db))) throw new AppError('already_set_up');
  const ts = nowIso();
  const password_hash = await hashPassword(input.password);
  const existing = await db.selectFrom('users').selectAll().orderBy('id').executeTakeFirst();
  if (existing) {
    return db
      .updateTable('users')
      .set({
        username: input.username,
        password_hash,
        display_name: input.displayName ?? null,
        role: 'admin',
        disabled: 0,
        updated_at: ts,
      })
      .where('id', '=', existing.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
  return db
    .insertInto('users')
    .values({
      username: input.username,
      password_hash,
      display_name: input.displayName ?? null,
      role: 'admin',
      theme: 'system',
      disabled: 0,
      created_at: ts,
      updated_at: ts,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function assertUsernameFree(db: DB, username: string, exceptId?: number) {
  let q = db.selectFrom('users').select('id').where('username', '=', username);
  if (exceptId) q = q.where('id', '!=', exceptId);
  if (await q.executeTakeFirst()) throw new AppError('conflict', { field: 'username' });
}

export async function countActiveAdmins(db: DB): Promise<number> {
  const r = await db
    .selectFrom('users')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('role', '=', 'admin')
    .where('disabled', '=', 0)
    .executeTakeFirstOrThrow();
  return Number(r.n);
}
