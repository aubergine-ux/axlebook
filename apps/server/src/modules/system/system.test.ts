import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, sameOrigin } from '../../test/helpers';

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeAll(async () => {
  t = await createTestApp({ DEFAULT_CURRENCY: 'EUR' });
});
afterAll(() => t.close());

describe('system routes', () => {
  it('reports health', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('exposes public config with env defaults', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/config' });
    expect(res.json()).toMatchObject({ currency: 'EUR', defaultUnitSystem: 'imperial' });
  });

  it('serves an OpenAPI document that lists the routes', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/openapi.json' });
    expect(res.statusCode).toBe(200);
    const doc = res.json();
    expect(doc.openapi).toMatch(/^3\./);
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(['/api/v1/health', '/api/v1/config']),
    );
  });

  it('returns JSON 404s for unknown API paths', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'not_found' } });
  });

  it('applies the CSRF check before routing', async () => {
    const blocked = await t.app.inject({ method: 'POST', url: '/api/v1/nope' });
    expect(blocked.statusCode).toBe(403);
    const passes = await t.app.inject({ method: 'POST', url: '/api/v1/nope', headers: sameOrigin });
    expect(passes.statusCode).toBe(404);
  });

  it('bootstraps a single owner account', async () => {
    const users = await t.db.selectFrom('users').select(['username', 'role']).execute();
    expect(users).toEqual([{ username: 'owner', role: 'admin' }]);
  });
});
