import { isPostgres } from '../connection';
import type { AnyDb } from './helpers';
import { withId, withTimestamps } from './helpers';

export async function up(db: AnyDb): Promise<void> {
  const big = isPostgres(db) ? 'bigint' : 'integer';

  await withTimestamps(
    withId(db, db.schema.createTable('records'))
      .addColumn('vehicle_id', 'integer', (c) =>
        c.notNull().references('vehicles.id').onDelete('cascade'),
      )
      .addColumn('kind', 'text', (c) => c.notNull())
      .addColumn('date', 'text', (c) => c.notNull())
      .addColumn('odometer', 'integer')
      .addColumn('title', 'text')
      .addColumn('cost', big, (c) => c.notNull().defaultTo(0))
      .addColumn('notes', 'text')
      .addColumn('expense_category', 'text')
      .addColumn('fuel_volume', big)
      .addColumn('price_per_unit', big)
      .addColumn('is_full', 'integer')
      .addColumn('missed_previous', 'integer')
      .addColumn('fuel_grade', 'text')
      .addColumn('station', 'text')
      .addColumn('client_id', 'text', (c) => c.unique())
      .addColumn('created_by', 'integer', (c) => c.references('users.id').onDelete('set null')),
  ).execute();
  await db.schema
    .createIndex('records_vehicle_date_idx')
    .on('records')
    .columns(['vehicle_id', 'date'])
    .execute();
  await db.schema
    .createIndex('records_vehicle_kind_idx')
    .on('records')
    .columns(['vehicle_id', 'kind'])
    .execute();

  await withId(db, db.schema.createTable('tags'))
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('name_key', 'text', (c) => c.notNull().unique())
    .execute();
  await db.schema
    .createTable('record_tags')
    .addColumn('record_id', 'integer', (c) =>
      c.notNull().references('records.id').onDelete('cascade'),
    )
    .addColumn('tag_id', 'integer', (c) => c.notNull().references('tags.id').onDelete('cascade'))
    .addPrimaryKeyConstraint('record_tags_pk', ['record_id', 'tag_id'])
    .execute();
  await db.schema.createIndex('record_tags_tag_idx').on('record_tags').column('tag_id').execute();

  await withId(db, db.schema.createTable('attachments'))
    .addColumn('vehicle_id', 'integer', (c) =>
      c.notNull().references('vehicles.id').onDelete('cascade'),
    )
    .addColumn('record_id', 'integer', (c) => c.references('records.id').onDelete('cascade'))
    .addColumn('storage_key', 'text', (c) => c.notNull().unique())
    .addColumn('original_name', 'text', (c) => c.notNull())
    .addColumn('mime_type', 'text', (c) => c.notNull())
    .addColumn('size_bytes', big, (c) => c.notNull())
    .addColumn('sha256', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute();
  await db.schema
    .createIndex('attachments_record_idx')
    .on('attachments')
    .column('record_id')
    .execute();

  await withTimestamps(
    withId(db, db.schema.createTable('odometer_readings'))
      .addColumn('vehicle_id', 'integer', (c) =>
        c.notNull().references('vehicles.id').onDelete('cascade'),
      )
      .addColumn('date', 'text', (c) => c.notNull())
      .addColumn('odometer', 'integer', (c) => c.notNull())
      .addColumn('record_id', 'integer', (c) =>
        c.unique().references('records.id').onDelete('cascade'),
      )
      .addColumn('notes', 'text'),
  ).execute();
  await db.schema
    .createIndex('odometer_vehicle_idx')
    .on('odometer_readings')
    .columns(['vehicle_id', 'odometer'])
    .execute();

  await withTimestamps(
    withId(db, db.schema.createTable('reminders'))
      .addColumn('vehicle_id', 'integer', (c) =>
        c.notNull().references('vehicles.id').onDelete('cascade'),
      )
      .addColumn('title', 'text', (c) => c.notNull())
      .addColumn('notes', 'text')
      .addColumn('due_mode', 'text', (c) => c.notNull())
      .addColumn('due_date', 'text')
      .addColumn('due_odometer', 'integer')
      .addColumn('interval_months', 'integer')
      .addColumn('interval_distance', 'integer')
      .addColumn('soon_days', 'integer', (c) => c.notNull())
      .addColumn('soon_distance', 'integer', (c) => c.notNull())
      .addColumn('archived_at', 'text')
      .addColumn('last_notified_status', 'text')
      .addColumn('last_notified_at', 'text'),
  ).execute();
  await db.schema
    .createIndex('reminders_vehicle_idx')
    .on('reminders')
    .column('vehicle_id')
    .execute();

  await withId(db, db.schema.createTable('reminder_completions'))
    .addColumn('reminder_id', 'integer', (c) =>
      c.notNull().references('reminders.id').onDelete('cascade'),
    )
    .addColumn('record_id', 'integer', (c) => c.references('records.id').onDelete('set null'))
    .addColumn('completed_at', 'text', (c) => c.notNull())
    .addColumn('previous_due_date', 'text')
    .addColumn('previous_due_odometer', 'integer')
    .execute();
  await db.schema
    .createIndex('reminder_completions_record_idx')
    .on('reminder_completions')
    .column('record_id')
    .execute();

  await withTimestamps(
    withId(db, db.schema.createTable('parts'))
      .addColumn('owner_id', 'integer', (c) =>
        c.notNull().references('users.id').onDelete('cascade'),
      )
      .addColumn('vehicle_id', 'integer', (c) => c.references('vehicles.id').onDelete('set null'))
      .addColumn('name', 'text', (c) => c.notNull())
      .addColumn('part_number', 'text')
      .addColumn('manufacturer', 'text')
      .addColumn('quantity', big, (c) => c.notNull().defaultTo(0))
      .addColumn('unit_cost', big)
      .addColumn('location', 'text')
      .addColumn('notes', 'text'),
  ).execute();

  await withId(db, db.schema.createTable('record_parts'))
    .addColumn('record_id', 'integer', (c) =>
      c.notNull().references('records.id').onDelete('cascade'),
    )
    .addColumn('part_id', 'integer', (c) => c.references('parts.id').onDelete('set null'))
    .addColumn('quantity', big, (c) => c.notNull())
    .addColumn('unit_cost', big)
    .addColumn('name', 'text', (c) => c.notNull())
    .execute();
  await db.schema
    .createIndex('record_parts_record_idx')
    .on('record_parts')
    .column('record_id')
    .execute();

  await withTimestamps(
    withId(db, db.schema.createTable('plan_items'))
      .addColumn('vehicle_id', 'integer', (c) =>
        c.notNull().references('vehicles.id').onDelete('cascade'),
      )
      .addColumn('title', 'text', (c) => c.notNull())
      .addColumn('description', 'text')
      .addColumn('kind', 'text', (c) => c.notNull())
      .addColumn('priority', 'text', (c) => c.notNull())
      .addColumn('status', 'text', (c) => c.notNull())
      .addColumn('estimated_cost', big)
      .addColumn('target_date', 'text')
      .addColumn('converted_record_id', 'integer', (c) =>
        c.references('records.id').onDelete('set null'),
      ),
  ).execute();

  await db.schema
    .createTable('vehicle_shares')
    .addColumn('vehicle_id', 'integer', (c) =>
      c.notNull().references('vehicles.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'integer', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('permission', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .addPrimaryKeyConstraint('vehicle_shares_pk', ['vehicle_id', 'user_id'])
    .execute();

  await withId(db, db.schema.createTable('sessions'))
    .addColumn('user_id', 'integer', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('token_hash', 'text', (c) => c.notNull().unique())
    .addColumn('expires_at', 'text', (c) => c.notNull())
    .addColumn('last_seen_at', 'text', (c) => c.notNull())
    .addColumn('user_agent', 'text')
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute();

  await withId(db, db.schema.createTable('api_tokens'))
    .addColumn('user_id', 'integer', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('token_hash', 'text', (c) => c.notNull().unique())
    .addColumn('prefix', 'text', (c) => c.notNull())
    .addColumn('last_used_at', 'text')
    .addColumn('expires_at', 'text')
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute();

  await withTimestamps(
    withId(db, db.schema.createTable('notification_channels'))
      .addColumn('user_id', 'integer', (c) =>
        c.notNull().references('users.id').onDelete('cascade'),
      )
      .addColumn('type', 'text', (c) => c.notNull())
      .addColumn('name', 'text', (c) => c.notNull())
      .addColumn('config', 'text', (c) => c.notNull())
      .addColumn('enabled', 'integer', (c) => c.notNull().defaultTo(1)),
  ).execute();

  await withId(db, db.schema.createTable('notification_log'))
    .addColumn('channel_id', 'integer', (c) =>
      c.references('notification_channels.id').onDelete('cascade'),
    )
    .addColumn('reminder_id', 'integer', (c) => c.references('reminders.id').onDelete('cascade'))
    .addColumn('status', 'text', (c) => c.notNull())
    .addColumn('error', 'text')
    .addColumn('sent_at', 'text', (c) => c.notNull())
    .execute();
}

export async function down(db: AnyDb): Promise<void> {
  for (const t of [
    'notification_log',
    'notification_channels',
    'api_tokens',
    'sessions',
    'vehicle_shares',
    'plan_items',
    'record_parts',
    'parts',
    'reminder_completions',
    'reminders',
    'odometer_readings',
    'attachments',
    'record_tags',
    'tags',
    'records',
  ]) {
    await db.schema.dropTable(t).execute();
  }
}
