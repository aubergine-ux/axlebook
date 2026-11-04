import type { CreateTableBuilder, Kysely } from 'kysely';
import { isPostgres } from '../connection';

// biome-ignore lint/suspicious/noExplicitAny: migrations operate on an untyped schema
export type AnyDb = Kysely<any>;
// biome-ignore lint/suspicious/noExplicitAny: builder generics are irrelevant here
type Builder = CreateTableBuilder<any, any>;

/** Portable auto-increment integer primary key. */
export function withId(db: AnyDb, t: Builder): Builder {
  return isPostgres(db)
    ? t.addColumn('id', 'integer', (c) => c.primaryKey().generatedByDefaultAsIdentity())
    : t.addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement());
}

/** created_at / updated_at as ISO text, filled by the application. */
export function withTimestamps(t: Builder): Builder {
  return t
    .addColumn('created_at', 'text', (c) => c.notNull())
    .addColumn('updated_at', 'text', (c) => c.notNull());
}
