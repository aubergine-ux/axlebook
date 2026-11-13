import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { InjectOptions } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app';
import { loadConfig } from '../config';
import { connect } from '../db/connection';
import { migrateToLatest } from '../db/migrate';
import type { User } from '../db/schema';
import type { Ai, AiPrompt } from '../lib/ai';
import { hashPassword, randomToken, sha256 } from '../lib/crypto';
import { nowIso } from '../lib/time';

/** Headers a same-origin browser request would carry for app.inject (host: localhost:80). */
export const sameOrigin = { origin: 'http://localhost:80' } as const;

/** An empty database: SQLite in memory, or a schema of its own when TEST_DATABASE_URL is set. */
export async function freshDb(config: ReturnType<typeof loadConfig>) {
  const pgUrl = process.env.TEST_DATABASE_URL;
  let pgSchema: string | undefined;
  if (pgUrl) {
    pgSchema = `test_${randomUUID().replaceAll('-', '')}`;
    const client = new pg.Client({ connectionString: pgUrl });
    await client.connect();
    await client.query(`CREATE SCHEMA ${pgSchema}`);
    await client.end();
  }
  return connect(config.database, { pgSchema });
}

/**
 * Builds an app on a fresh database (SQLite in memory, or an isolated Postgres schema
 * when TEST_DATABASE_URL is set) with a signed-in admin. `t.req()` sends requests as
 * that admin; `t.user()` creates more accounts with their own `req`.
 */
export async function createTestApp(
  env: Record<string, string> = {},
  opts: { ai?: Ai; db?: Awaited<ReturnType<typeof freshDb>> } = {},
) {
  const pgUrl = process.env.TEST_DATABASE_URL;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axlebook-test-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    DATA_DIR: dataDir,
    DATABASE_URL: pgUrl ?? ':memory:',
    WEB_DIR: '/nonexistent-web-dir',
    TZ: 'UTC',
    ...env,
  });
  const handle = opts.db ?? (await freshDb(config));
  await migrateToLatest(handle.db);
  const app = await buildApp({ config, db: handle, ai: opts.ai });
  await app.ready();
  const db = handle.db;

  async function user(
    username: string,
    role: User['role'] = 'editor',
    password = 'correct-horse-battery',
  ) {
    const ts = nowIso();
    const row = await db
      .insertInto('users')
      .values({
        username,
        role,
        password_hash: await hashPassword(password),
        theme: 'system',
        disabled: 0,
        created_at: ts,
        updated_at: ts,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const token = randomToken();
    await db
      .insertInto('sessions')
      .values({
        user_id: row.id,
        token_hash: sha256(token),
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        last_seen_at: ts,
        created_at: ts,
      })
      .execute();
    const cookie = `axlebook_session=${token}`;
    const req = (opts: InjectOptions) =>
      app.inject({ ...opts, headers: { ...sameOrigin, cookie, ...(opts.headers ?? {}) } });
    return { user: row, cookie, req, password };
  }

  const admin = await user('admin', 'admin');

  return {
    app,
    db,
    config,
    dataDir,
    admin: admin.user,
    req: admin.req,
    user,
    /** Unauthenticated request (still same-origin). */
    anon: (opts: InjectOptions) =>
      app.inject({ ...opts, headers: { ...sameOrigin, ...(opts.headers ?? {}) } }),
    async close() {
      await app.close();
      await handle.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
      // Postgres schemas are dropped by the global teardown (see global-setup.ts).
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

/** Build a multipart/form-data body with a single file field for app.inject. */
export function multipartFile(field: string, filename: string, data: Buffer, contentType: string) {
  const boundary = `----axlebook${randomUUID()}`;
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

/** Smallest valid images for upload tests. */
export const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
export const tinyPdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

export const vehicleBody = (patch: Record<string, unknown> = {}) => ({
  year: 2015,
  make: 'Toyota',
  model: 'Tacoma',
  odometerUnit: 'mi',
  fuelUnit: 'gal_us',
  fuelType: 'gasoline',
  ...patch,
});

/** A stand-in for the local model: answers each call from `answer` (by schema), records prompts. */
export function fakeAi(
  answer: (prompt: AiPrompt) => unknown,
  opts: { vision?: boolean } = {},
): Ai & { calls: AiPrompt[] } {
  const calls: AiPrompt[] = [];
  let model = 'fake:1b';
  return {
    enabled: true,
    get model() {
      return model;
    },
    calls,
    status: async () => ({
      enabled: true,
      model,
      reachable: true,
      modelReady: true,
      pullProgress: null,
      vision: opts.vision ?? false,
      error: null,
    }),
    json: async (schema, prompt) => {
      calls.push(prompt);
      return schema.parse(answer(prompt));
    },
    models: async () => [
      { name: 'fake:1b', size: 1, vision: opts.vision ?? false },
      { name: 'other:2b', size: 2, vision: true },
    ],
    setModel: (name) => {
      model = name;
    },
    test: async () => ({ ms: 5 }),
  };
}
