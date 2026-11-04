// Copies what the web app serves from the brand kit (logo-assets/) into apps/web/public/.
// Runs before `vite dev` / `vite build` and in the Docker build. The output is gitignored;
// logo-assets/ is the only source of truth.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const kit = path.join(root, 'logo-assets');
const pub = path.join(root, 'apps/web/public');

/** [source in logo-assets, destination in public/] */
const FILES = [
  // Header logo: the flat mark (the glass icon is for 64 px and up) + wordmark, per theme.
  ['logo/svg/axlebook-mark-flat.svg', 'brand/mark.svg'],
  ['logo/svg/axlebook-mark-flat-light.svg', 'brand/mark-dark.svg'],
  ['logo/svg/axlebook-wordmark-graphite.svg', 'brand/wordmark.svg'],
  ['logo/svg/axlebook-wordmark-white.svg', 'brand/wordmark-dark.svg'],
  // Fonts referenced by tokens.json (paths there are relative to the kit).
  ['fonts/Archivo-Variable.woff2', 'brand/fonts/Archivo-Variable.woff2'],
  ['fonts/IBMPlexMono-400.woff2', 'brand/fonts/IBMPlexMono-400.woff2'],
  ['fonts/IBMPlexMono-500.woff2', 'brand/fonts/IBMPlexMono-500.woff2'],
  ['fonts/IBMPlexMono-600.woff2', 'brand/fonts/IBMPlexMono-600.woff2'],
];
// Every top-level file in app-icons/ is served from the site root (favicon.svg, pwa-192.png, …).
const REQUIRED_ICONS = [
  'favicon.svg',
  'favicon.ico',
  'apple-touch-icon-180.png',
  'pwa-192.png',
  'pwa-512.png',
  'pwa-maskable-512.png',
];

fs.rmSync(pub, { recursive: true, force: true });
fs.mkdirSync(pub, { recursive: true });

const missing = [];
const appIcons = path.join(kit, 'app-icons');
for (const entry of fs.existsSync(appIcons)
  ? fs.readdirSync(appIcons, { withFileTypes: true })
  : []) {
  if (entry.isFile()) fs.copyFileSync(path.join(appIcons, entry.name), path.join(pub, entry.name));
}
for (const name of REQUIRED_ICONS)
  if (!fs.existsSync(path.join(pub, name))) missing.push(`app-icons/${name}`);

for (const [src, dest] of FILES) {
  const from = path.join(kit, src);
  if (!fs.existsSync(from)) {
    missing.push(src);
    continue;
  }
  fs.mkdirSync(path.dirname(path.join(pub, dest)), { recursive: true });
  fs.copyFileSync(from, path.join(pub, dest));
}

if (missing.length) {
  console.error(`brand-sync: missing from logo-assets/: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`brand-sync: copied app icons, logo and fonts from logo-assets/`);
