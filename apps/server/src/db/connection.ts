import fs from 'node:fs';
import path from 'node:path';
import Sqlite from 'better-sqlite3';
import { Kysely, PostgresAdapter, PostgresDialect, SqliteDialect } from 'kysely';
import pg from 'pg';
import type { Config } from '../config';
import type { Database } from './schema';

export type Dialect = 'sqlite' | 'postgres';
export type DB = Kysely<Database>;

// Return BIGINT (int8) and COUNT(*) as JS numbers. Values stay well below 2^53.
pg.types.setTypeParser(20, (v) => Number(v));
// NUMERIC as number (used by aggregate SUM on bigint columns).
pg.types.setTypeParser(1700, (v) => Number(v));

export interface DbHandle {
  db: DB;
  dialect: Dialect;
  close: () => Promise<void>;
}

export function connect(database: Config['database'], opts: { pgSchema?: string } = {}): DbHandle {
  if (database.kind === 'postgres') {
    const pool = new pg.Pool({
      connectionString: database.url,
      ...(opts.pgSchema ? { options: `-c search_path=${opts.pgSchema}` } : {}),
    });
    const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    return { db, dialect: 'postgres', close: () => db.destroy() };
  }

  if (database.file !== ':memory:') fs.mkdirSync(path.dirname(database.file), { recursive: true });
  const sqlite = new Sqlite(database.file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });
  return { db, dialect: 'sqlite', close: () => db.destroy() };
}

// biome-ignore lint/suspicious/noExplicitAny: migrations operate on an untyped schema
export function isPostgres(db: Kysely<any>): boolean {
  return db.getExecutor().adapter instanceof PostgresAdapter;
}
