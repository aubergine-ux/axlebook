import { isPostgres } from '../connection';
import type { AnyDb } from './helpers';
import { withId, withTimestamps } from './helpers';

/**
 * Vehicle details: engine, the parts-and-fluids sheet (JSON), personal or business use, and what
 * the vehicle is worth today. Plus safety recalls looked up for a vehicle, with their state.
 */
export async function up(db: AnyDb): Promise<void> {
  const money = isPostgres(db) ? 'bigint' : 'integer';
  await db.schema.alterTable('vehicles').addColumn('engine', 'text').execute();
  await db.schema.alterTable('vehicles').addColumn('specs', 'text').execute();
  await db.schema
    .alterTable('vehicles')
    .addColumn('usage', 'text', (c) => c.notNull().defaultTo('personal'))
    .execute();
  await db.schema.alterTable('vehicles').addColumn('current_value', money).execute();
  await db.schema.alterTable('vehicles').addColumn('recalls_checked_at', 'text').execute();

  await withTimestamps(
    withId(db, db.schema.createTable('recalls'))
      .addColumn('vehicle_id', 'integer', (c) =>
        c.notNull().references('vehicles.id').onDelete('cascade'),
      )
      .addColumn('campaign', 'text', (c) => c.notNull())
      .addColumn('component', 'text')
      .addColumn('summary', 'text')
      .addColumn('consequence', 'text')
      .addColumn('remedy', 'text')
      .addColumn('report_date', 'text')
      .addColumn('state', 'text', (c) => c.notNull().defaultTo('open'))
      .addColumn('state_at', 'text'),
  ).execute();
  await db.schema
    .createIndex('recalls_vehicle_campaign_idx')
    .on('recalls')
    .columns(['vehicle_id', 'campaign'])
    .unique()
    .execute();
}

export async function down(db: AnyDb): Promise<void> {
  await db.schema.dropTable('recalls').execute();
  for (const c of ['recalls_checked_at', 'current_value', 'usage', 'specs', 'engine'])
    await db.schema.alterTable('vehicles').dropColumn(c).execute();
}
