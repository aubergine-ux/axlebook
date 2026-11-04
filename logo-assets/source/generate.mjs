// Generates every SVG in logo-assets/ from one set of geometry and color constants.
//
// Usage (needs opentype.js and @fontsource/ibm-plex-sans installed somewhere):
//   node logo-assets/source/generate.mjs <dir-containing-node_modules>
// Then run logo-assets/source/build.sh to rasterize PNG/ICO files.
//
// The wordmark is converted to outlines here, so the SVGs work without the font installed.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const depsDir = path.resolve(process.argv[2] ?? '.');
const require = createRequire(path.join(depsDir, 'package.json'));
const opentype = require('opentype.js');
const fontFile = require.resolve(
  '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff',
);
const font = opentype.parse(fs.readFileSync(fontFile).buffer);

const OUT = path.resolve(import.meta.dirname, '..');
const C = {
  ink: '#161B22',
  tile: '#1A212B',
  paper: '#F7F5F0',
  amber: '#E8890C',
};

// ── Mark geometry (64-unit grid) ───────────────────────────────────────────────
// An "A" whose crossbar extends into an axle with a wheel at each end.
// `small` drops the hubs and thickens strokes so the mark survives 16px rendering.
function glyph({ stroke, wheel, hub }, { small = false } = {}) {
  const leg = small ? 9 : 7;
  const axle = small ? 6 : 5;
  const r = small ? 7.5 : 6.5;
  return [
    `<path d="M12 39H52" fill="none" stroke="${stroke}" stroke-width="${axle}" stroke-linecap="round"/>`,
    `<path d="M17 51L32 13L47 51" fill="none" stroke="${stroke}" stroke-width="${leg}" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<circle cx="12" cy="39" r="${r}" fill="${wheel}"/>`,
    `<circle cx="52" cy="39" r="${r}" fill="${wheel}"/>`,
    small ? '' : `<circle cx="12" cy="39" r="2.2" fill="${hub}"/>`,
    small ? '' : `<circle cx="52" cy="39" r="2.2" fill="${hub}"/>`,
  ].join('');
}

const svg = (w, h, body, title = 'Axlebook') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;

/** Tile mark: rounded ink square with the glyph inset to 80%. */
const tileBody = (size = 64, { radius = 14, scale = 0.8, bleed = false, small = false } = {}) => {
  const s = (size / 64) * scale;
  const off = (size - 64 * s) / 2;
  const r = bleed ? 0 : (radius * size) / 64;
  return (
    `<rect width="${size}" height="${size}" rx="${r}" fill="${C.tile}"/>` +
    `<g transform="translate(${off} ${off}) scale(${s})">${glyph({ stroke: C.paper, wheel: C.amber, hub: C.tile }, { small })}</g>`
  );
};

const markVariants = {
  'mark.svg': { stroke: C.ink, wheel: C.amber, hub: C.ink },
  'mark-dark.svg': { stroke: C.paper, wheel: C.amber, hub: C.paper },
  'mark-mono-black.svg': { stroke: '#000', wheel: '#000', hub: '#fff' },
  'mark-mono-white.svg': { stroke: '#fff', wheel: '#fff', hub: '#000' },
};

// ── Wordmark ────────────────────────────────────────────────────────────────
const WORD = 'axlebook';
function wordPath(fontSize, x, baseline) {
  // Slight negative tracking (-1% em) for a tighter, label-like feel.
  const tracking = -0.01 * fontSize;
  const scale = fontSize / font.unitsPerEm;
  let cursor = x;
  let d = '';
  for (const ch of WORD) {
    const g = font.charToGlyph(ch);
    d += g.getPath(cursor, baseline, fontSize).toPathData(2);
    cursor += g.advanceWidth * scale + tracking;
  }
  return { d, width: cursor - tracking - x };
}
function wordMetrics(fontSize) {
  const { d, width } = wordPath(fontSize, 0, 0);
  const bb = new opentype.Path();
  bb.commands = font.getPath(WORD, 0, 0, fontSize).commands;
  const box = bb.getBoundingBox();
  return { d, width, top: box.y1, bottom: box.y2 }; // y1 negative (above baseline)
}

function wordmarkSvg(color) {
  const fs_ = 48;
  const m = wordMetrics(fs_);
  const pad = 2;
  const h = Math.ceil(m.bottom - m.top) + pad * 2;
  const w = Math.ceil(m.width) + pad * 2;
  const { d } = wordPath(fs_, pad, pad - m.top);
  return svg(w, h, `<path d="${d}" fill="${color}"/>`);
}

function lockupHorizontal(textColor) {
  const H = 64;
  const fs_ = 38;
  const gap = 14;
  // Center the x-height band of the word on the tile's optical center.
  const xHeight = (font.tables.os2.sxHeight / font.unitsPerEm) * fs_;
  const baseline = H / 2 + xHeight / 2 + 1;
  const { d, width } = wordPath(fs_, H + gap, baseline);
  const w = Math.ceil(H + gap + width + 2);
  return svg(w, H, `${tileBody(H)}<path d="${d}" fill="${textColor}"/>`);
}

function lockupStacked(textColor) {
  const T = 96;
  const fs_ = 40;
  const m = wordMetrics(fs_);
  const w = Math.ceil(Math.max(T, m.width) + 8);
  const gap = 14;
  const baseline = T + gap - m.top;
  const { d } = wordPath(fs_, (w - m.width) / 2, baseline);
  const h = Math.ceil(baseline + m.bottom + 4);
  const tileX = (w - T) / 2;
  return svg(
    w,
    h,
    `<g transform="translate(${tileX} 0)">${tileBody(T)}</g><path d="${d}" fill="${textColor}"/>`,
  );
}

function write(rel, content) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log('wrote', path.relative(process.cwd(), file));
}

// ── Emit ────────────────────────────────────────────────────────────────────
write('svg/mark-tile.svg', svg(64, 64, tileBody(64)));
for (const [name, colors] of Object.entries(markVariants))
  write(`svg/${name}`, svg(64, 64, glyph(colors)));
write('svg/wordmark.svg', wordmarkSvg(C.ink));
write('svg/wordmark-dark.svg', wordmarkSvg(C.paper));
write('svg/lockup-horizontal.svg', lockupHorizontal(C.ink));
write('svg/lockup-horizontal-dark.svg', lockupHorizontal(C.paper));
write('svg/lockup-stacked.svg', lockupStacked(C.ink));
write('svg/lockup-stacked-dark.svg', lockupStacked(C.paper));

// Icons: favicon uses a slightly larger glyph (scale .86) for legibility at 16px.
write('icons/favicon.svg', svg(64, 64, tileBody(64, { scale: 0.86 })));
write(
  'icons/favicon-small.svg',
  svg(64, 64, tileBody(64, { scale: 0.9, radius: 12, small: true })),
);
// Full-bleed square for iOS/Android launchers (the OS applies its own mask).
write('icons/icon-square.svg', svg(512, 512, tileBody(512, { bleed: true, scale: 0.72 })));
// Maskable: glyph inside the 80% safe zone (scale ≤ .8 of the inner circle).
write('icons/icon-maskable.svg', svg(512, 512, tileBody(512, { bleed: true, scale: 0.6 })));
// Rounded "any" purpose icon.
write('icons/icon-rounded.svg', svg(512, 512, tileBody(512, { radius: 12, scale: 0.78 })));

// Social preview / README banner (1280×640).
{
  const W = 1280;
  const H = 640;
  const fs_ = 120;
  const m = wordMetrics(fs_);
  const T = 168;
  const gap = 40;
  const total = T + gap + m.width;
  const x0 = (W - total) / 2;
  const xHeight = (font.tables.os2.sxHeight / font.unitsPerEm) * fs_;
  const cy = H / 2 - 30;
  const { d } = wordPath(fs_, x0 + T + gap, cy + xHeight / 2 + 2);
  const tagline = wordPathFor('A self-hosted logbook for your vehicles', 34, W / 2, cy + 160);
  const body =
    `<rect width="${W}" height="${H}" fill="${C.tile}"/>` +
    `<rect y="${H - 12}" width="${W}" height="12" fill="${C.amber}"/>` +
    `<g transform="translate(${x0} ${cy - T / 2})">${tileBody(T, { radius: 14 }).replace(`fill="${C.tile}"`, 'fill="#232C38"')}</g>` +
    `<path d="${d}" fill="${C.paper}"/>` +
    `<path d="${tagline}" fill="#9AA5B1"/>`;
  write(
    'social/social-preview.svg',
    svg(W, H, body, 'Axlebook: a self-hosted logbook for your vehicles'),
  );
}

function wordPathFor(text, size, centerX, baseline) {
  const regular = opentype.parse(
    fs.readFileSync(
      require.resolve('@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff'),
    ).buffer,
  );
  const width = regular.getAdvanceWidth(text, size);
  return regular.getPath(text, centerX - width / 2, baseline, size).toPathData(2);
}
