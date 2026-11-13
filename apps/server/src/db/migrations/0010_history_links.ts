import type { AnyDb } from './helpers';
import { withId } from './helpers';

/** Read-only links to a vehicle's service history: they expire and can be switched off. */
export async function up(db: AnyDb): Promise<void> {
  await withId(db, db.schema.createTable('history_links'))
    .addColumn('vehicle_id', 'integer', (c) =>
      c.notNull().references('vehicles.id').onDelete('cascade'),
    )
    .addColumn('token', 'text', (c) => c.notNull())
    .addColumn('label', 'text')
    .addColumn('show_costs', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('show_vin', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('show_notes', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('expires_at', 'text')
    .addColumn('revoked_at', 'text')
    .addColumn('views', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('last_viewed_at', 'text')
    .addColumn('created_by', 'integer', (c) => c.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute();
  await db.schema
    .createIndex('history_links_token_idx')
    .on('history_links')
    .column('token')
    .unique()
    .execute();
}

export async function down(db: AnyDb): Promise<void> {
  await db.schema.dropTable('history_links').execute();
}
