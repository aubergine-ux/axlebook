import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerCsrfProtection } from './csrf';
import { registerErrorHandler } from './error-handler';

function makeApp(baseUrl?: string) {
  const app = Fastify();
  registerErrorHandler(app);
  registerCsrfProtection(app, { baseUrl: baseUrl ? new URL(baseUrl) : undefined });
  app.post('/thing', async () => ({ ok: true }));
  app.get('/thing', async () => ({ ok: true }));
  return app;
}

describe('csrf origin check', () => {
  it('allows safe methods without Origin', async () => {
    const res = await makeApp().inject({ method: 'GET', url: '/thing' });
    expect(res.statusCode).toBe(200);
  });

  it('rejects unsafe requests without Origin or Referer', async () => {
    const res = await makeApp().inject({ method: 'POST', url: '/thing' });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: { code: 'csrf_origin_mismatch' } });
  });

  it('accepts a same-origin Origin header (derived from Host)', async () => {
    const res = await makeApp().inject({
      method: 'POST',
      url: '/thing',
      headers: { host: 'garage.local:8080', origin: 'http://garage.local:8080' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects a cross-site Origin', async () => {
    const res = await makeApp().inject({
      method: 'POST',
      url: '/thing',
      headers: { host: 'garage.local:8080', origin: 'https://evil.example' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('falls back to Referer when Origin is absent', async () => {
    const app = makeApp();
    const ok = await app.inject({
      method: 'POST',
      url: '/thing',
      headers: { host: 'garage.local', referer: 'http://garage.local/vehicles/1' },
    });
    expect(ok.statusCode).toBe(200);
    const bad = await app.inject({
      method: 'POST',
      url: '/thing',
      headers: { host: 'garage.local', referer: 'http://evil.example/x' },
    });
    expect(bad.statusCode).toBe(403);
  });

  it('treats Origin "null" as missing', async () => {
    const res = await makeApp().inject({
      method: 'POST',
      url: '/thing',
      headers: { origin: 'null' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('uses BASE_URL instead of Host when configured', async () => {
    const app = makeApp('https://cars.example.com');
    const ok = await app.inject({
      method: 'POST',
      url: '/thing',
      headers: { host: 'internal:8080', origin: 'https://cars.example.com' },
    });
    expect(ok.statusCode).toBe(200);
    const spoofedHost = await app.inject({
      method: 'POST',
      url: '/thing',
      headers: { host: 'evil.example', origin: 'http://evil.example' },
    });
    expect(spoofedHost.statusCode).toBe(403);
  });

  it('exempts bearer-token requests', async () => {
    const res = await makeApp().inject({
      method: 'POST',
      url: '/thing',
      headers: { authorization: 'Bearer abc123' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('applies to PUT, PATCH and DELETE', async () => {
    const app = makeApp();
    for (const method of ['PUT', 'PATCH', 'DELETE'] as const) {
      const res = await app.inject({ method, url: '/thing' });
      expect(res.statusCode).toBe(403);
    }
  });
});

describe('csrf origin normalization', () => {
  it('matches default ports in Host against port-less Origin', async () => {
    const res = await makeApp().inject({
      method: 'POST',
      url: '/thing',
      headers: { host: 'garage.local:80', origin: 'http://garage.local' },
    });
    expect(res.statusCode).toBe(200);
  });
});
