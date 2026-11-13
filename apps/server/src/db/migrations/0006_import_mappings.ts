import type { AnyDb } from './helpers';
import { withId, withTimestamps } from './helpers';

/** Column mappings remembered per person and spreadsheet layout, so a re-import needs no setup. */
export async function up(db: AnyDb): Promise<void> {
  await withTimestamps(
    withId(db, db.schema.createTable('import_mappings'))
      .addColumn('user_id', 'integer', (c) =>
        c.notNull().references('users.id').onDelete('cascade'),
      )
      .addColumn('signature', 'text', (c) => c.notNull())
      .addColumn('file_name', 'text', (c) => c.notNull())
      .addColumn('plan', 'text', (c) => c.notNull()),
  ).execute();
  await db.schema
    .createIndex('import_mappings_user_signature_idx')
    .on('import_mappings')
    .columns(['user_id', 'signature'])
    .unique()
    .execute();
}

export async function down(db: AnyDb): Promise<void> {
  await db.schema.dropTable('import_mappings').execute();
}
