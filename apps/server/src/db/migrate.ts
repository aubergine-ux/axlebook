import { Migrator } from 'kysely/migration';
import type { DB } from './connection';
import { migrations } from './migrations';

export async function migrateToLatest(db: DB): Promise<string[]> {
  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
    migrationTableName: 'axlebook_migrations',
    migrationLockTableName: 'axlebook_migrations_lock',
  });
  const { error, results } = await migrator.migrateToLatest();
  const failed = results?.find((r) => r.status === 'Error');
  if (error || failed) {
    throw new Error(`Migration failed${failed ? ` at ${failed.migrationName}` : ''}`, {
      cause: error,
    });
  }
  return (results ?? []).filter((r) => r.status === 'Success').map((r) => r.migrationName);
}
