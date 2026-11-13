import type { AnyDb } from './helpers';
import { withId, withTimestamps } from './helpers';

/** The trip log for business vehicles, and documents that expire (registration, insurance, permits). */
export async function up(db: AnyDb): Promise<void> {
  await withTimestamps(
    withId(db, db.schema.createTable('trips'))
      .addColumn('vehicle_id', 'integer', (c) =>
        c.notNull().references('vehicles.id').onDelete('cascade'),
      )
      .addColumn('date', 'text', (c) => c.notNull())
      .addColumn('start_odometer', 'integer', (c) => c.notNull())
      .addColumn('end_odometer', 'integer', (c) => c.notNull())
      .addColumn('purpose', 'text', (c) => c.notNull())
      .addColumn('from_place', 'text')
      .addColumn('to_place', 'text')
      .addColumn('business', 'integer', (c) => c.notNull().defaultTo(1))
      .addColumn('notes', 'text')
      .addColumn('created_by', 'integer', (c) => c.references('users.id').onDelete('set null')),
  ).execute();
  await db.schema
    .createIndex('trips_vehicle_idx')
    .on('trips')
    .columns(['vehicle_id', 'date'])
    .execute();

  await withTimestamps(
    withId(db, db.schema.createTable('vehicle_documents'))
      .addColumn('vehicle_id', 'integer', (c) =>
        c.notNull().references('vehicles.id').onDelete('cascade'),
      )
      .addColumn('type', 'text', (c) => c.notNull())
      .addColumn('title', 'text', (c) => c.notNull())
      .addColumn('number', 'text')
      .addColumn('expires_on', 'text')
      .addColumn('notes', 'text')
      .addColumn('storage_key', 'text')
      .addColumn('original_name', 'text')
      .addColumn('mime_type', 'text')
      .addColumn('size_bytes', 'integer')
      .addColumn('last_notified_status', 'text'),
  ).execute();
  await db.schema
    .createIndex('vehicle_documents_vehicle_idx')
    .on('vehicle_documents')
    .column('vehicle_id')
    .execute();
}

export async function down(db: AnyDb): Promise<void> {
  await db.schema.dropTable('vehicle_documents').execute();
  await db.schema.dropTable('trips').execute();
}
