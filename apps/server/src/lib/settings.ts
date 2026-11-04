import type { DB } from '../db/connection';
import { nowIso } from './time';

/** Instance-wide key/value settings (JSON-encoded). */
export async function getSetting<T>(db: DB, key: string, fallback: T): Promise<T> {
  const row = await db
    .selectFrom('instance_settings')
    .select('value')
    .where('key', '=', key)
    .executeTakeFirst();
  return row ? (JSON.parse(row.value) as T) : fallback;
}

export async function setSetting(db: DB, key: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  const updated_at = nowIso();
  await db
    .insertInto('instance_settings')
    .values({ key, value: json, updated_at })
    .onConflict((oc) => oc.column('key').doUpdateSet({ value: json, updated_at }))
    .execute();
}
