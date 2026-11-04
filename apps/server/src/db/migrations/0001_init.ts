import type { AnyDb } from './helpers';
import { withId, withTimestamps } from './helpers';

export async function up(db: AnyDb): Promise<void> {
  await withTimestamps(
    withId(db, db.schema.createTable('users'))
      .addColumn('username', 'text', (c) => c.notNull().unique())
      .addColumn('email', 'text')
      .addColumn('display_name', 'text')
      .addColumn('password_hash', 'text')
      .addColumn('role', 'text', (c) => c.notNull().defaultTo('editor'))
      .addColumn('oidc_issuer', 'text')
      .addColumn('oidc_subject', 'text')
      .addColumn('locale', 'text')
      .addColumn('unit_system', 'text')
      .addColumn('theme', 'text', (c) => c.notNull().defaultTo('system'))
      .addColumn('disabled', 'integer', (c) => c.notNull().defaultTo(0)),
  ).execute();

  await db.schema
    .createIndex('users_oidc_idx')
    .on('users')
    .columns(['oidc_issuer', 'oidc_subject'])
    .unique()
    .execute();

  await db.schema
    .createTable('instance_settings')
    .addColumn('key', 'text', (c) => c.primaryKey())
    .addColumn('value', 'text', (c) => c.notNull())
    .addColumn('updated_at', 'text', (c) => c.notNull())
    .execute();
}

export async function down(db: AnyDb): Promise<void> {
  await db.schema.dropTable('instance_settings').execute();
  await db.schema.dropTable('users').execute();
}
