// Copies brand files from logo-assets/ into apps/web/public/brand/.
// Any file that's missing from logo-assets/ falls back to apps/web/brand-placeholder/.
// Runs before `vite dev` / `vite build` and in the Docker build. See logo-assets/README.md.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const brandDir = path.join(root, 'logo-assets');
const placeholderDir = path.join(root, 'apps/web/brand-placeholder');
const outDir = path.join(root, 'apps/web/public/brand');

/** [source path relative to logo-assets, fallback (relative), output name] */
const FILES = [
  ['icons/favicon.svg', 'icons/favicon.svg', 'favicon.svg'],
  ['icons/favicon.ico', 'icons/favicon.ico', 'favicon.ico'],
  ['icons/apple-touch-icon.png', 'icons/apple-touch-icon.png', 'apple-touch-icon.png'],
  ['icons/icon-192.png', 'icons/icon-192.png', 'icon-192.png'],
  ['icons/icon-512.png', 'icons/icon-512.png', 'icon-512.png'],
  ['icons/maskable-192.png', 'icons/maskable-192.png', 'maskable-192.png'],
  ['icons/maskable-512.png', 'icons/maskable-512.png', 'maskable-512.png'],
  ['svg/logo.svg', 'svg/logo.svg', 'logo.svg'],
  // The dark logo falls back to the user's light logo before the placeholder.
  ['svg/logo-dark.svg', ['svg/logo.svg', 'svg/logo-dark.svg'], 'logo-dark.svg'],
];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const placeholders = [];
for (const [src, fallback, out] of FILES) {
  const brandSrc = path.join(brandDir, src);
  let from = fs.existsSync(brandSrc) ? brandSrc : null;
  if (!from && Array.isArray(fallback)) {
    const userAlt = path.join(brandDir, fallback[0]);
    from = fs.existsSync(userAlt) ? userAlt : path.join(placeholderDir, fallback[1]);
    if (!fs.existsSync(userAlt)) placeholders.push(src);
  } else if (!from) {
    from = path.join(placeholderDir, fallback);
    placeholders.push(src);
  }
  fs.copyFileSync(from, path.join(outDir, out));
}

console.log(
  placeholders.length
    ? `brand: ${FILES.length - placeholders.length}/${FILES.length} from logo-assets, placeholders for: ${placeholders.join(', ')}`
    : `brand: all ${FILES.length} files from logo-assets`,
);
