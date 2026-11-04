import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../app';
import { loadConfig } from '../config';
import { connect } from '../db/connection';
import { migrateToLatest } from '../db/migrate';

/**
 * Builds an app on a fresh database. SQLite in-memory by default. When
 * TEST_DATABASE_URL is set, the same suite runs on Postgres in an isolated schema
 * that is dropped on close.
 */
export async function createTestApp(env: Record<string, string> = {}) {
  const pgUrl = process.env.TEST_DATABASE_URL;
  const config = loadConfig({
    NODE_ENV: 'test',
    DATA_DIR: '/nonexistent-test-dir',
    DATABASE_URL: pgUrl ?? ':memory:',
    WEB_DIR: '/nonexistent-web-dir',
    ...env,
  });
  let pgSchema: string | undefined;
  if (pgUrl) {
    pgSchema = `test_${randomUUID().replaceAll('-', '')}`;
    const client = new pg.Client({ connectionString: pgUrl });
    await client.connect();
    await client.query(`CREATE SCHEMA ${pgSchema}`);
    await client.end();
  }
  const db = connect(config.database, { pgSchema });
  await migrateToLatest(db.db);
  const app = await buildApp({ config, db });
  await app.ready();

  return {
    app,
    db: db.db,
    config,
    async close() {
      await app.close();
      await db.close();
      if (pgUrl && pgSchema) {
        const client = new pg.Client({ connectionString: pgUrl });
        await client.connect();
        await client.query(`DROP SCHEMA ${pgSchema} CASCADE`);
        await client.end();
      }
    },
  };
}

/** Headers a same-origin browser request would carry for app.inject (host: localhost:80). */
export const sameOrigin = { origin: 'http://localhost:80' } as const;
