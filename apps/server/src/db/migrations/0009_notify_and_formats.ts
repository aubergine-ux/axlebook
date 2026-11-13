import type { AnyDb } from './helpers';
import { withId } from './helpers';

/**
 * Per-person notification preferences (quiet hours, weekly digest), muting per vehicle, a queue
 * for messages held back during quiet hours, and each person's own currency and date format.
 */
export async function up(db: AnyDb): Promise<void> {
  await db.schema.alterTable('users').addColumn('notify_prefs', 'text').execute();
  await db.schema.alterTable('users').addColumn('last_digest_on', 'text').execute();
  await db.schema.alterTable('users').addColumn('currency', 'text').execute();
  await db.schema.alterTable('users').addColumn('date_format', 'text').execute();

  await db.schema
    .createTable('vehicle_mutes')
    .addColumn('vehicle_id', 'integer', (c) =>
      c.notNull().references('vehicles.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'integer', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('created_at', 'text', (c) => c.notNull())
    .addPrimaryKeyConstraint('vehicle_mutes_pk', ['vehicle_id', 'user_id'])
    .execute();

  await withId(db, db.schema.createTable('notification_queue'))
    .addColumn('user_id', 'integer', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('reminder_id', 'integer')
    .addColumn('message', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute();
}

export async function down(db: AnyDb): Promise<void> {
  await db.schema.dropTable('notification_queue').execute();
  await db.schema.dropTable('vehicle_mutes').execute();
  for (const c of ['date_format', 'currency', 'last_digest_on', 'notify_prefs'])
    await db.schema.alterTable('users').dropColumn(c).execute();
}
