import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { appUrl, normalizeBasePath, stripBasePath } from '../lib/urls';
import { createTestApp, type TestApp, vehicleBody } from '../test/helpers';
import { withBaseTag } from './static-spa';

/** A stand-in for the built web app: a page with relative assets, the way the real build is. */
let webDir: string;
beforeAll(() => {
  webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axlebook-web-'));
  fs.mkdirSync(path.join(webDir, 'assets'));
  fs.writeFileSync(
    path.join(webDir, 'index.html'),
    '<!doctype html><html><head>\n<title>Axlebook</title><script type="module" src="./assets/app.js"></script></head><body><div id="root"></div></body></html>',
  );
  fs.writeFileSync(path.join(webDir, 'assets', 'app.js'), 'console.log("app")');
  fs.writeFileSync(path.join(webDir, 'sw.js'), '// sw');
});
afterAll(() => fs.rmSync(webDir, { recursive: true, force: true }));

let t: TestApp;
afterEach(() => t?.close());
const get = (url: string) => t.app.inject({ method: 'GET', url });

describe('base path helpers', () => {
  it('normalizes what people type', () => {
    expect(
      ['', '/', undefined, 'garage', '/garage', '/garage/', ' /a/b// '].map(normalizeBasePath),
    ).toEqual(['', '', '', '/garage', '/garage', '/garage', '/a/b']);
  });

  it('takes the path from BASE_URL unless BASE_PATH says otherwise', () => {
    const base = (env: Record<string, string>) => loadConfig({ NODE_ENV: 'test', ...env }).basePath;
    expect(base({})).toBe('');
    expect(base({ BASE_URL: 'https://cars.example.com' })).toBe('');
    expect(base({ BASE_URL: 'https://cars.example.com/garage/' })).toBe('/garage');
    expect(base({ BASE_URL: 'https://cars.example.com', BASE_PATH: 'axlebook' })).toBe('/axlebook');
  });

  it('strips the prefix only where it is a whole path segment', () => {
    const strip = (url: string) => stripBasePath(url, '/garage');
    expect(strip('/garage')).toBe('/');
    expect(strip('/garage/')).toBe('/');
    expect(strip('/garage/api/v1/health?x=1')).toBe('/api/v1/health?x=1');
    expect(strip('/garage?x=1')).toBe('?x=1');
    expect(strip('/garagesale/api')).toBe('/garagesale/api');
    expect(strip('/api/v1/health')).toBe('/api/v1/health');
    expect(stripBasePath('/garage/x', '')).toBe('/garage/x');
  });

  it('builds links that include the mount path', () => {
    const config = loadConfig({ NODE_ENV: 'test', BASE_URL: 'https://cars.example.com/garage' });
    expect(appUrl(config, '/vehicles/3')).toBe('https://cars.example.com/garage/vehicles/3');
    expect(appUrl(config, 'reminders')).toBe('https://cars.example.com/garage/reminders');
    expect(appUrl(loadConfig({ NODE_ENV: 'test' }), '/x')).toBeUndefined();
  });

  it('tells the page where it is mounted, once', () => {
    const html = '<html><head><title>x</title></head></html>';
    expect(withBaseTag(html, '')).toContain('<head>\n    <base href="/" />');
    const twice = withBaseTag(withBaseTag(html, '/garage'), '/garage');
    expect(twice.match(/<base /g)).toHaveLength(1);
    expect(twice).toContain('<base href="/garage/" />');
  });
});

describe('served under a subpath', () => {
  const origin = { origin: 'https://cars.example.com' };

  it('answers with and without the prefix, and mounts the page there', async () => {
    t = await createTestApp({ BASE_URL: 'https://cars.example.com/garage', WEB_DIR: webDir });
    // A proxy that strips the prefix, and one that passes it through.
    for (const url of ['/api/v1/health', '/garage/api/v1/health'])
      expect((await get(url)).json()).toMatchObject({ status: 'ok' });

    for (const url of [
      '/garage',
      '/garage/',
      '/garage/vehicles/3/fuel',
      '/garage/index.html',
      '/',
    ]) {
      const res = await get(url);
      expect(res.statusCode, url).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.body).toContain('<base href="/garage/" />');
    }
    const asset = await get('/garage/assets/app.js');
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['cache-control']).toContain('immutable');
    expect((await get('/garage/sw.js')).statusCode).toBe(200);
    // A missing file is a 404, never the page.
    expect((await get('/garage/assets/old.js')).statusCode).toBe(404);
    expect((await get('/garage/api/nope')).json()).toEqual({ error: { code: 'not_found' } });

    const docs = (await get('/garage/api/openapi.json')).json();
    expect(docs.servers).toEqual([{ url: '/garage/' }]);
  });

  it('puts the prefix in every link it hands out', async () => {
    t = await createTestApp({ BASE_URL: 'https://cars.example.com/garage', WEB_DIR: webDir });
    const req: TestApp['req'] = (o) =>
      t.req({ ...o, headers: { ...origin, ...(o.headers ?? {}) } });
    const v = (
      await req({ method: 'POST', url: '/garage/api/v1/vehicles', payload: vehicleBody() })
    ).json().id;
    const calendar = (await req({ method: 'POST', url: '/api/v1/me/calendar' })).json().url;
    expect(calendar).toMatch(/^https:\/\/cars\.example\.com\/garage\/calendar\/[\w-]+\.ics$/);
    // The feed itself answers at that address.
    expect((await get(new URL(calendar).pathname)).headers['content-type']).toContain(
      'text/calendar',
    );
    const link = (
      await req({ method: 'POST', url: `/api/v1/vehicles/${v}/history-links`, payload: {} })
    ).json();
    expect(link.url).toMatch(/^https:\/\/cars\.example\.com\/garage\/h\/[\w-]+$/);
    expect((await get(`/garage/api/public/history/${link.url.split('/h/')[1]}`)).statusCode).toBe(
      200,
    );
    await req({
      method: 'POST',
      url: `/api/v1/vehicles/${v}/reminders`,
      payload: { title: 'Plates', dueMode: 'date', dueDate: '2027-01-01' },
    });
    expect((await get(new URL(calendar).pathname)).body.replace(/\r\n /g, '')).toContain(
      `URL:https://cars.example.com/garage/vehicles/${v}/reminders`,
    );
  });

  it('is unchanged at the root', async () => {
    t = await createTestApp({ WEB_DIR: webDir });
    expect((await get('/vehicles/3')).body).toContain('<base href="/" />');
    expect((await get('/api/openapi.json')).json().servers).toEqual([{ url: '/' }]);
    expect((await get('/assets/app.js')).statusCode).toBe(200);
  });
});
