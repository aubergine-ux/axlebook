import { randomBytes, scryptSync } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { loadConfig } from '../../config';
import { connect } from '../../db/connection';
import { migrateToLatest } from '../../db/migrate';
import { createTestApp, sameOrigin, type TestApp, vehicleBody } from '../../test/helpers';

let t: TestApp;
afterEach(() => t?.close());

const cookieFrom = (res: { headers: Record<string, unknown> }) => {
  const raw = res.headers['set-cookie'];
  const first = Array.isArray(raw) ? raw[0] : String(raw);
  return first.split(';')[0] as string;
};

describe('first-run setup', () => {
  it('creates the admin, signs them in, and only works once', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      DATA_DIR: '/tmp/axlebook-setup-test',
      DATABASE_URL: ':memory:',
      WEB_DIR: '/none',
    });
    const handle = connect(config.database);
    await migrateToLatest(handle.db);
    const app = await buildApp({ config, db: handle });
    try {
      const status = await app.inject({ method: 'GET', url: '/api/v1/auth/status' });
      expect(status.json()).toMatchObject({ setupRequired: true, localLogin: true, user: null });

      const weak = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/setup',
        headers: sameOrigin,
        payload: { username: 'me', password: 'short' },
      });
      expect(weak.statusCode).toBe(400);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/setup',
        headers: sameOrigin,
        payload: { username: 'Ruby', password: 'a-long-enough-password' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ username: 'ruby', role: 'admin' });
      const cookie = cookieFrom(res);
      expect(String(res.headers['set-cookie'])).toMatch(/HttpOnly/i);
      expect(String(res.headers['set-cookie'])).toMatch(/SameSite=Lax/i);

      const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } });
      expect(me.json().username).toBe('ruby');

      const again = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/setup',
        headers: sameOrigin,
        payload: { username: 'someone', password: 'another-long-password' },
      });
      expect(again.statusCode).toBe(409);
    } finally {
      await app.close();
      await handle.close();
    }
  });
});

describe('sign in and sessions', () => {
  it('hashes with argon2id, and upgrades older scrypt hashes on sign-in', async () => {
    t = await createTestApp();
    const u = await t.user('legacy', 'editor', 'old-password-123');
    expect(u.user.password_hash).toMatch(/^\$argon2id\$/);
    // A hash made by an earlier version: scrypt$N$r$p$salt$key.
    const salt = randomBytes(16);
    const key = scryptSync('old-password-123', salt, 32, { N: 32768, r: 8, p: 1, maxmem: 2 ** 26 });
    const old = ['scrypt', 32768, 8, 1, salt.toString('base64url'), key.toString('base64url')];
    await t.db
      .updateTable('users')
      .set({ password_hash: old.join('$') })
      .where('id', '=', u.user.id)
      .execute();
    const login = (password: string) =>
      t.anon({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { username: 'legacy', password },
      });
    expect((await login('wrong-password-1')).statusCode).toBe(401);
    expect((await login('old-password-123')).statusCode).toBe(200);
    const row = await t.db
      .selectFrom('users')
      .select('password_hash')
      .where('id', '=', u.user.id)
      .executeTakeFirstOrThrow();
    expect(row.password_hash).toMatch(/^\$argon2id\$/);
    expect((await login('old-password-123')).statusCode).toBe(200);
  });

  it('logs in, rejects bad passwords, and logs out', async () => {
    t = await createTestApp();
    const u = await t.user('casey', 'editor', 'casey-password-123');
    const bad = await t.anon({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'casey', password: 'nope' },
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().error.code).toBe('invalid_credentials');
    const unknown = await t.anon({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'nobody', password: 'nope' },
    });
    expect(unknown.json().error.code).toBe('invalid_credentials');

    const ok = await t.anon({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'CASEY', password: u.password },
    });
    expect(ok.statusCode).toBe(200);
    const cookie = cookieFrom(ok);
    expect(
      (await t.anon({ method: 'GET', url: '/api/v1/me', headers: { cookie } })).statusCode,
    ).toBe(200);

    const out = await t.anon({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(204);
    expect(
      (await t.anon({ method: 'GET', url: '/api/v1/me', headers: { cookie } })).statusCode,
    ).toBe(401);
  });

  it('rate-limits repeated failures', async () => {
    t = await createTestApp();
    await t.user('target');
    for (let i = 0; i < 10; i++)
      await t.anon({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { username: 'target', password: 'wrong' },
      });
    const blocked = await t.anon({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'target', password: 'correct-horse-battery' },
    });
    expect(blocked.statusCode).toBe(429);
  });

  it('refuses disabled accounts', async () => {
    t = await createTestApp();
    const u = await t.user('gone');
    await t.req({
      method: 'PATCH',
      url: `/api/v1/users/${u.user.id}`,
      payload: { disabled: true },
    });
    expect((await u.req({ method: 'GET', url: '/api/v1/me' })).statusCode).toBe(401);
  });

  it('changes the password and signs out other sessions', async () => {
    t = await createTestApp();
    const u = await t.user('pat', 'editor', 'old-password-123');
    const login = await t.anon({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'pat', password: 'old-password-123' },
    });
    const otherCookie = cookieFrom(login);
    const wrong = await u.req({
      method: 'POST',
      url: '/api/v1/me/password',
      payload: { current: 'nope', next: 'new-password-456' },
    });
    expect(wrong.statusCode).toBe(401);
    const ok = await u.req({
      method: 'POST',
      url: '/api/v1/me/password',
      payload: { current: 'old-password-123', next: 'new-password-456' },
    });
    expect(ok.statusCode).toBe(204);
    expect(
      (await t.anon({ method: 'GET', url: '/api/v1/me', headers: { cookie: otherCookie } }))
        .statusCode,
    ).toBe(401);
    expect((await u.req({ method: 'GET', url: '/api/v1/me' })).statusCode).toBe(200);
  });

  it('updates preferences', async () => {
    t = await createTestApp();
    const res = await t.req({
      method: 'PATCH',
      url: '/api/v1/me',
      payload: { unitSystem: 'metric', theme: 'dark', displayName: 'Admin Person' },
    });
    expect(res.json()).toMatchObject({
      unitSystem: 'metric',
      theme: 'dark',
      displayName: 'Admin Person',
    });
  });

  it('stores garage and tips preferences per person and rejects unknown values', async () => {
    t = await createTestApp();
    const me = await t.req({ method: 'GET', url: '/api/v1/me' });
    expect(me.json().garage).toEqual({
      sort: 'custom',
      layout: 'cards',
      fields: ['odometer', 'nextReminder', 'cost'],
      order: [],
    });
    const garage = { sort: 'due', layout: 'list', fields: ['licensePlate'], order: [3, 1] };
    const res = await t.req({ method: 'PATCH', url: '/api/v1/me', payload: { garage } });
    expect(res.statusCode).toBe(200);
    expect(res.json().garage).toEqual(garage);
    // Changing one preference keeps the other.
    const tips = await t.req({ method: 'PATCH', url: '/api/v1/me', payload: { showTips: false } });
    expect(tips.json()).toMatchObject({ garage, showTips: false });
    // Someone else's view is untouched.
    const other = await t.user('other');
    expect((await other.req({ method: 'GET', url: '/api/v1/me' })).json().garage.sort).toBe(
      'custom',
    );
    const bad = await t.req({
      method: 'PATCH',
      url: '/api/v1/me',
      payload: { garage: { ...garage, layout: 'mosaic' } },
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe('API tokens', () => {
  it('authenticates with a bearer token, skips the CSRF check, and can be revoked', async () => {
    t = await createTestApp();
    const created = await t.req({
      method: 'POST',
      url: '/api/v1/me/tokens',
      payload: { name: 'Home Assistant' },
    });
    expect(created.statusCode).toBe(201);
    const { token, id } = created.json();
    expect(token).toMatch(/^axb_/);
    const list = (await t.req({ method: 'GET', url: '/api/v1/me/tokens' })).json();
    expect(list[0]).not.toHaveProperty('token');

    // No Origin header, no cookie: fine with a bearer token.
    const post = await t.app.inject({
      method: 'POST',
      url: '/api/v1/vehicles',
      headers: { authorization: `Bearer ${token}` },
      payload: vehicleBody(),
    });
    expect(post.statusCode).toBe(201);

    await t.req({ method: 'DELETE', url: `/api/v1/me/tokens/${id}` });
    const after = await t.app.inject({
      method: 'GET',
      url: '/api/v1/vehicles',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(after.statusCode).toBe(401);
  });

  it('rejects unknown tokens', async () => {
    t = await createTestApp();
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/v1/vehicles',
      headers: { authorization: 'Bearer axb_nope' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('user administration', () => {
  it('is admin-only and protects the last admin', async () => {
    t = await createTestApp();
    const editor = await t.user('ed');
    expect((await editor.req({ method: 'GET', url: '/api/v1/users' })).statusCode).toBe(403);

    const created = await t.req({
      method: 'POST',
      url: '/api/v1/users',
      payload: { username: 'new.person', password: 'temporary-pass-1', role: 'viewer' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).not.toHaveProperty('passwordHash');
    const dup = await t.req({
      method: 'POST',
      url: '/api/v1/users',
      payload: { username: 'new.person' },
    });
    expect(dup.statusCode).toBe(409);

    const demote = await t.req({
      method: 'PATCH',
      url: `/api/v1/users/${t.admin.id}`,
      payload: { role: 'editor' },
    });
    expect(demote.statusCode).toBe(409);
    const selfDelete = await t.req({ method: 'DELETE', url: `/api/v1/users/${t.admin.id}` });
    expect(selfDelete.statusCode).toBe(409);

    const del = await t.req({ method: 'DELETE', url: `/api/v1/users/${editor.user.id}` });
    expect(del.statusCode).toBe(204);
  });
});

describe('roles and sharing', () => {
  it('enforces the owner / edit / view / viewer-role matrix', async () => {
    t = await createTestApp();
    const owner = await t.user('owner');
    const editor = await t.user('editor');
    const watcher = await t.user('watcher');
    const viewerRole = await t.user('viewer', 'viewer');
    const stranger = await t.user('stranger');

    const v = (
      await owner.req({ method: 'POST', url: '/api/v1/vehicles', payload: vehicleBody() })
    ).json();
    const share = (uid: number, permission: string) =>
      owner.req({
        method: 'PUT',
        url: `/api/v1/vehicles/${v.id}/shares/${uid}`,
        payload: { permission },
      });
    expect((await share(editor.user.id, 'edit')).statusCode).toBe(200);
    await share(watcher.user.id, 'view');
    await share(viewerRole.user.id, 'edit'); // role caps it at view

    const record = { kind: 'service', date: '2026-01-02', title: 'Oil change', cost: 50_000 };
    const post = (u: typeof owner) =>
      u.req({ method: 'POST', url: `/api/v1/vehicles/${v.id}/records`, payload: record });

    expect((await post(owner)).statusCode).toBe(201);
    expect((await post(editor)).statusCode).toBe(201);
    expect((await post(watcher)).statusCode).toBe(403);
    expect((await post(viewerRole)).statusCode).toBe(403);
    expect((await post(stranger)).statusCode).toBe(404);

    // Shared vehicles show in the garage with the right access level.
    const garage = (await editor.req({ method: 'GET', url: '/api/v1/vehicles' })).json();
    expect(garage.map((g: { id: number; access: string }) => [g.id, g.access])).toEqual([
      [v.id, 'edit'],
    ]);
    expect(
      (await viewerRole.req({ method: 'GET', url: `/api/v1/vehicles/${v.id}` })).json().access,
    ).toBe('view');
    expect((await stranger.req({ method: 'GET', url: '/api/v1/vehicles' })).json()).toEqual([]);

    // Only the owner can delete, archive or re-share.
    expect(
      (await editor.req({ method: 'DELETE', url: `/api/v1/vehicles/${v.id}` })).statusCode,
    ).toBe(403);
    expect(
      (await editor.req({ method: 'POST', url: `/api/v1/vehicles/${v.id}/archive` })).statusCode,
    ).toBe(403);
    expect(
      (
        await editor.req({
          method: 'PUT',
          url: `/api/v1/vehicles/${v.id}/shares/${stranger.user.id}`,
          payload: { permission: 'view' },
        })
      ).statusCode,
    ).toBe(403);

    // Unsharing takes access away.
    await owner.req({ method: 'DELETE', url: `/api/v1/vehicles/${v.id}/shares/${editor.user.id}` });
    expect((await editor.req({ method: 'GET', url: `/api/v1/vehicles/${v.id}` })).statusCode).toBe(
      404,
    );
  });

  it('lists people to share with, excluding yourself', async () => {
    t = await createTestApp();
    await t.user('friend');
    const dir = (await t.req({ method: 'GET', url: '/api/v1/users/directory' })).json();
    expect(dir.map((d: { username: string }) => d.username)).toEqual(['friend']);
  });
});
