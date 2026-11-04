import type { AnyDb } from './helpers';
import { withId } from './helpers';

export async function up(db: AnyDb): Promise<void> {
  await db.schema
    .alterTable('vehicles')
    .addColumn('category', 'text', (c) => c.notNull().defaultTo('car'))
    .execute();
  await db.schema.alterTable('vehicles').addColumn('unit_number', 'text').execute();
  await db.schema.alterTable('records').addColumn('jurisdiction', 'text').execute();
  await db.schema.alterTable('odometer_readings').addColumn('jurisdiction', 'text').execute();
  // SQLite can't ADD COLUMN ... UNIQUE; a unique index works on both databases.
  await db.schema.alterTable('users').addColumn('calendar_token', 'text').execute();
  await db.schema
    .createIndex('users_calendar_token_idx')
    .on('users')
    .column('calendar_token')
    .unique()
    .execute();

  await withId(db, db.schema.createTable('inspections'))
    .addColumn('vehicle_id', 'integer', (c) =>
      c.notNull().references('vehicles.id').onDelete('cascade'),
    )
    .addColumn('type', 'text', (c) => c.notNull())
    .addColumn('date', 'text', (c) => c.notNull())
    .addColumn('odometer', 'integer')
    .addColumn('inspector', 'text')
    .addColumn('items', 'text', (c) => c.notNull())
    .addColumn('defects', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('notes', 'text')
    .addColumn('corrected_at', 'text')
    .addColumn('corrected_by', 'text')
    .addColumn('correction_notes', 'text')
    .addColumn('created_by', 'integer', (c) => c.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute();
  await db.schema
    .createIndex('inspections_vehicle_idx')
    .on('inspections')
    .columns(['vehicle_id', 'date'])
    .execute();

  await db.schema
    .createTable('vehicle_insights')
    .addColumn('vehicle_id', 'integer', (c) =>
      c.notNull().references('vehicles.id').onDelete('cascade'),
    )
    .addColumn('kind', 'text', (c) => c.notNull())
    .addColumn('data', 'text', (c) => c.notNull())
    .addColumn('model', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .addPrimaryKeyConstraint('vehicle_insights_pk', ['vehicle_id', 'kind'])
    .execute();
}

export async function down(db: AnyDb): Promise<void> {
  await db.schema.dropTable('vehicle_insights').execute();
  await db.schema.dropTable('inspections').execute();
  for (const [t, c] of [
    ['users', 'calendar_token'],
    ['odometer_readings', 'jurisdiction'],
    ['records', 'jurisdiction'],
    ['vehicles', 'unit_number'],
    ['vehicles', 'category'],
  ] as const) {
    await db.schema.alterTable(t).dropColumn(c).execute();
  }
}
