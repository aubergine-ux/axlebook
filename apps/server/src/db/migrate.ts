import { sql } from 'kysely';
import { Migrator } from 'kysely/migration';
import { type DB, isPostgres } from './connection';
import { migrations } from './migrations';

/** Runs pending migrations; `target` stops at that migration (tests use it to stage an upgrade). */
export async function migrateToLatest(db: DB, target?: string): Promise<string[]> {
  // Kysely checks for its migration table across *all* schemas. Pin it to the current
  // one so several Axlebook schemas can share a Postgres database.
  const schema = isPostgres(db)
    ? (await sql<{ s: string }>`select current_schema() as s`.execute(db)).rows[0]?.s
    : undefined;
  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
    migrationTableName: 'axlebook_migrations',
    migrationLockTableName: 'axlebook_migrations_lock',
    ...(schema && { migrationTableSchema: schema }),
  });
  const { error, results } = target
    ? await migrator.migrateTo(target)
    : await migrator.migrateToLatest();
  const failed = results?.find((r) => r.status === 'Error');
  if (error || failed) {
    throw new Error(`Migration failed${failed ? ` at ${failed.migrationName}` : ''}`, {
      cause: error,
    });
  }
  return (results ?? []).filter((r) => r.status === 'Success').map((r) => r.migrationName);
}
