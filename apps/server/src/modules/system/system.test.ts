import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, multipartFile, tinyPng, vehicleBody } from '../../test/helpers';

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

  it('answers a garbled upload with 400, not a server error', async () => {
    const v = (
      await t.req({ method: 'POST', url: '/api/v1/vehicles', payload: vehicleBody() })
    ).json();
    const a = multipartFile('file', 'p.png', tinyPng, 'image/png');
    const b = multipartFile('file', 'p.png', tinyPng, 'image/png');
    for (const [method, url] of [
      ['PUT', `/api/v1/vehicles/${v.id}/photo`],
      ['POST', '/api/v1/import/spreadsheet'],
    ] as const) {
      // The body's boundary doesn't match the header's.
      const res = await t.req({ method, url, payload: a.payload, headers: b.headers });
      expect(res.statusCode, url).toBe(400);
      expect(res.json().error).toMatchObject({
        code: 'validation_failed',
        params: { reason: 'malformed' },
      });
    }
  });

  it('returns JSON 404s for unknown API paths', async () => {
    const res = await t.req({ method: 'GET', url: '/api/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'not_found' } });
  });

  it('applies the CSRF check before routing', async () => {
    const blocked = await t.app.inject({ method: 'POST', url: '/api/v1/nope' });
    expect(blocked.statusCode).toBe(403);
    const passes = await t.req({ method: 'POST', url: '/api/v1/nope' });
    expect(passes.statusCode).toBe(404);
  });

  it('requires sign-in for everything except the public endpoints', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/vehicles' })).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/auth/status' })).statusCode).toBe(
      200,
    );
  });

  it('sends baseline security headers', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });
});
