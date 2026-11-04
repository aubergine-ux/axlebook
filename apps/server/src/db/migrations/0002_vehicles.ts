import { isPostgres } from '../connection';
import type { AnyDb } from './helpers';
import { withId, withTimestamps } from './helpers';

export async function up(db: AnyDb): Promise<void> {
  const money = isPostgres(db) ? 'bigint' : 'integer';
  await withTimestamps(
    withId(db, db.schema.createTable('vehicles'))
      .addColumn('owner_id', 'integer', (c) =>
        c.notNull().references('users.id').onDelete('cascade'),
      )
      .addColumn('year', 'integer', (c) => c.notNull())
      .addColumn('make', 'text', (c) => c.notNull())
      .addColumn('model', 'text', (c) => c.notNull())
      .addColumn('trim', 'text')
      .addColumn('nickname', 'text')
      .addColumn('vin', 'text')
      .addColumn('license_plate', 'text')
      .addColumn('color', 'text')
      .addColumn('odometer_unit', 'text', (c) => c.notNull())
      .addColumn('fuel_unit', 'text', (c) => c.notNull())
      .addColumn('fuel_type', 'text', (c) => c.notNull())
      .addColumn('purchase_date', 'text')
      .addColumn('purchase_price', money)
      .addColumn('notes', 'text')
      .addColumn('photo_key', 'text')
      .addColumn('archived_at', 'text'),
  ).execute();
  await db.schema.createIndex('vehicles_owner_idx').on('vehicles').column('owner_id').execute();
}

export async function down(db: AnyDb): Promise<void> {
  await db.schema.dropTable('vehicles').execute();
}
