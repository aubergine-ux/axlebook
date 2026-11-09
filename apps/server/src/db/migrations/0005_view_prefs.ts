import type { AnyDb } from './helpers';

/** Per-person view preferences (JSON): garage sort, layout, fields and order; tips on or off. */
export async function up(db: AnyDb): Promise<void> {
  await db.schema.alterTable('users').addColumn('view_prefs', 'text').execute();
}

export async function down(db: AnyDb): Promise<void> {
  await db.schema.alterTable('users').dropColumn('view_prefs').execute();
}
