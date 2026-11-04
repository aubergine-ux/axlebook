import pg from 'pg';

/**
 * Postgres test runs create one schema per test app. Dropping them while other
 * test files are migrating races Kysely's catalog introspection, so they're removed
 * once before and once after the whole run instead.
 */
async function dropTestSchemas() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const { rows } = await client.query<{ nspname: string }>(
    "select nspname from pg_namespace where nspname like 'test\\_%'",
  );
  for (const r of rows) await client.query(`DROP SCHEMA "${r.nspname}" CASCADE`);
  await client.end();
}

export default async function setup() {
  await dropTestSchemas();
  return dropTestSchemas;
}
