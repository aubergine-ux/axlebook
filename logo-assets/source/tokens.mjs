// Generates color/tokens.css from color/tokens.json and checks WCAG contrast.
// Exits non-zero if any pair in tokens.json → contrast.pairs falls below its minimum.
// Usage: node logo-assets/source/tokens.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const tokens = JSON.parse(fs.readFileSync(path.join(root, 'color/tokens.json'), 'utf8'));

const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => lin(Number.parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

let failed = 0;
for (const mode of ['light', 'dark']) {
  const c = tokens.color[mode];
  for (const [fg, bg, min] of tokens.contrast.pairs) {
    const r = ratio(c[fg], c[bg]);
    const ok = r >= min;
    if (!ok) failed++;
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${mode.padEnd(5)} ${fg} on ${bg}: ${r.toFixed(2)} (min ${min})`,
    );
  }
}

const vars = (obj) =>
  Object.entries(obj)
    .map(([k, v]) => `  --ab-${k}: ${v};`)
    .join('\n');
const css = `/* Generated from tokens.json by source/tokens.mjs. Do not edit by hand. */
:root {
${vars(Object.fromEntries(Object.entries(tokens.brand).map(([k, v]) => [`brand-${k}`, v])))}
  --ab-font-sans: ${tokens.font.sans};
  --ab-font-mono: ${tokens.font.mono};
${vars(Object.fromEntries(Object.entries(tokens.radius).map(([k, v]) => [`radius-${k}`, v])))}
  color-scheme: light;
${vars(tokens.color.light)}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;
${vars(tokens.color.dark).replaceAll('  --', '    --')}
  }
}

:root[data-theme='dark'] {
  color-scheme: dark;
${vars(tokens.color.dark)}
}
`;
fs.writeFileSync(path.join(root, 'color/tokens.css'), css);
console.log('wrote color/tokens.css');
if (failed) {
  console.error(`${failed} contrast check(s) failed`);
  process.exit(1);
}

// Palette swatch sheet (color/palette.svg)
{
  const keys = Object.keys(tokens.color.light);
  const sw = 112;
  const sh = 72;
  const cols = 7;
  const rows = Math.ceil(keys.length / cols);
  const blockH = rows * (sh + 34) + 40;
  const W = cols * (sw + 12) + 28;
  const H = blockH * 2 + 20;
  let body = '';
  ['light', 'dark'].forEach((mode, mi) => {
    const c = tokens.color[mode];
    const y0 = mi * blockH + 10;
    body += `<rect x="0" y="${y0 - 10}" width="${W}" height="${blockH}" fill="${c.bg}"/>`;
    body += `<text x="16" y="${y0 + 18}" font-family="IBM Plex Sans, sans-serif" font-size="15" font-weight="600" fill="${c.text}">${mode}</text>`;
    keys.forEach((k, i) => {
      const x = 16 + (i % cols) * (sw + 12);
      const y = y0 + 32 + Math.floor(i / cols) * (sh + 34);
      body += `<rect x="${x}" y="${y}" width="${sw}" height="${sh}" rx="8" fill="${c[k]}" stroke="${c.border}"/>`;
      body += `<text x="${x}" y="${y + sh + 14}" font-family="IBM Plex Sans, sans-serif" font-size="11" fill="${c.text}">${k}</text>`;
      body += `<text x="${x}" y="${y + sh + 27}" font-family="IBM Plex Mono, monospace" font-size="10" fill="${c.muted}">${c[k]}</text>`;
    });
  });
  fs.writeFileSync(
    path.join(root, 'color/palette.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Axlebook color palette"><title>Axlebook color palette</title>${body}</svg>\n`,
  );
  console.log('wrote color/palette.svg');
}
