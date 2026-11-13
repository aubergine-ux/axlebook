import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const web = path.resolve(import.meta.dirname, '..');
const appIcons = path.resolve(web, '../../logo-assets/app-icons');
const viteConfig = fs.readFileSync(path.join(web, 'vite.config.ts'), 'utf8');
const indexHtml = fs.readFileSync(path.join(web, 'index.html'), 'utf8');

describe('brand assets wiring', () => {
  it('points every PWA manifest icon at a file in logo-assets/app-icons', () => {
    const srcs = [...viteConfig.matchAll(/src: '([^']+)'/g)].map((m) => m[1] as string);
    expect(srcs).toEqual(['pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png']);
    for (const s of srcs) expect(fs.existsSync(path.join(appIcons, s)), s).toBe(true);
    expect(viteConfig).toMatch(/src: 'pwa-maskable-512\.png'[^}]*purpose: 'maskable'/);
  });

  it('links favicons and the touch icon that exist in the kit', () => {
    const hrefs = [
      ...indexHtml.matchAll(/<link rel="(?:icon|apple-touch-icon)" href="\/([^"]+)"/g),
    ].map((m) => m[1] as string);
    expect(hrefs.sort()).toEqual(['apple-touch-icon-180.png', 'favicon.ico', 'favicon.svg']);
    for (const h of hrefs) expect(fs.existsSync(path.join(appIcons, h)), h).toBe(true);
  });
});
