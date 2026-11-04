# Axlebook design package

This folder has the logo, icons, color tokens, and usage rules for Axlebook. Open
[`brand-guide.html`](brand-guide.html) in a browser to see the visual reference sheet.

## The mark

The mark is an **"A" whose crossbar becomes an axle**, with an amber wheel at each end. It
combines the first letter of the name with the thing every vehicle shares. The amber wheels
come from the oil-change sticker in the corner of a windshield: a small, warm, practical
reminder.

| File                                                  | Use                                                                                |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `svg/mark-tile.svg`                                   | Default mark: the glyph on the ink tile. Use it whenever the background is unknown |
| `svg/mark.svg` / `svg/mark-dark.svg`                  | The glyph without a tile, for light and dark backgrounds                           |
| `svg/mark-mono-black.svg` / `svg/mark-mono-white.svg` | Single-color reproduction (stamps, engraving, fax-grade print)                     |
| `svg/wordmark.svg` / `svg/wordmark-dark.svg`          | Lowercase "axlebook" set in IBM Plex Sans SemiBold, outlined                       |
| `svg/lockup-horizontal*.svg`                          | Tile plus wordmark, for headers and the README                                     |
| `svg/lockup-stacked*.svg`                             | Tile above the wordmark, for splash screens and square spaces                      |
| `png/`                                                | Raster exports of the above                                                        |

### Clear space and minimum size

- Keep clear space on every side equal to **one wheel diameter**, which is about 20% of the tile width.
- Minimum sizes:
  - Tile mark: **16 px**. Below 32 px, use `icons/favicon-small.svg`, which drops the hubs and has heavier strokes.
  - Horizontal lockup: **24 px** tall.
  - Wordmark alone: **12 px** cap height.

### Don'ts

- Don't recolor the wheels. Amber is the only accent in the mark.
- Don't rotate, skew, outline, add shadows to, or animate the mark's parts separately.
- Don't set "Axlebook" in another typeface as a logo. In running text, write it as **Axlebook**
  (capital A, one word). The lowercase form is only for the wordmark.
- Don't put the tile-less mark on busy photos. Use the tile version instead.

## Icons

| File                                         | Size     | Purpose                                                              |
| -------------------------------------------- | -------- | -------------------------------------------------------------------- |
| `icons/favicon.ico`                          | 16/32/48 | Legacy browsers                                                      |
| `icons/favicon.svg`                          | vector   | Modern browsers (`<link rel="icon" type="image/svg+xml">`)           |
| `icons/favicon-small.svg`                    | vector   | Source for 16 and 32 px                                              |
| `icons/apple-touch-icon.png`                 | 180      | iOS home screen (full-bleed; iOS rounds the corners)                 |
| `icons/icon-192.png`, `icon-512.png`         | 192/512  | PWA manifest, `purpose: "any"`                                       |
| `icons/maskable-192.png`, `maskable-512.png` | 192/512  | PWA manifest, `purpose: "maskable"` (glyph inside the 80% safe zone) |
| `social/social-preview.png`                  | 1280×640 | GitHub social preview and link cards                                 |

## Color

The tokens live in [`color/tokens.json`](color/tokens.json). [`color/tokens.css`](color/tokens.css)
is **generated** from it and is imported directly by the web app. [`color/palette.svg`](color/palette.svg)
is a swatch sheet.

**Brand colors**

| Name  | Hex       | Role                                                   |
| ----- | --------- | ------------------------------------------------------ |
| Ink   | `#161B22` | Text and primary marks                                 |
| Tile  | `#1A212B` | Icon background and dark surfaces                      |
| Paper | `#F7F5F0` | Warm off-white, like a logbook page. Light background  |
| Amber | `#E8890C` | The single accent: wheels, primary buttons, highlights |

**Rules**
- Amber is a **fill** color. Text on amber is always Ink (6.6:1).
  - For amber-colored text, use `accent-text`: `#9A5200` on light, `#F5A33A` on dark.
- Status colors (`overdue`, `soon`, `ok`, `info`) always come with an icon or label. Color is
  never the only signal.
- Every text and background pair in `tokens.json → contrast.pairs` meets WCAG AA in both themes:
  - Text: 4.5:1
  - Body text on page backgrounds: 7:1
  - UI boundaries and focus rings: 3:1

  `source/tokens.mjs` checks every pair and fails if one falls below its minimum.

## Typography

- **IBM Plex Sans**: UI and wordmark. Use weights 400, 500, and 600. Turn on tabular figures
  (`font-variant-numeric: tabular-nums`) wherever numbers line up in columns.
- **IBM Plex Mono**: odometer readings, VINs, part numbers, and other "stamped" values.
- Both are licensed under the SIL Open Font License 1.1 and are **self-hosted** through
  `@fontsource`. The app never loads fonts from a CDN.

## Voice

Write like a careful mechanic's notes: short, concrete, and calm.
- **Do:** "Oil change due in 340 mi." "Logged. Tank was full."
- **Don't:** exclamation marks, jokes in error messages, or enterprise jargon ("leverage", "solution").
- Address the user as "you". Use sentence case for every label and heading.

## Regenerating

```bash
# 1. SVGs (outlines the wordmark from IBM Plex Sans)
mkdir -p /tmp/ab-brand && (cd /tmp/ab-brand && npm init -y >/dev/null && npm i opentype.js @fontsource/ibm-plex-sans)
node logo-assets/source/generate.mjs /tmp/ab-brand

# 2. PNG / ICO (needs librsvg's rsvg-convert and ImageMagick 7)
bash logo-assets/source/build.sh

# 3. Color tokens, contrast check, and palette sheet
node logo-assets/source/tokens.mjs

# 4. Copy icons into the web app
npm run brand:sync
```

## License

The Axlebook name and logo identify this project. You may use them, unmodified, to refer to
Axlebook: in articles, package listings, or a "works with Axlebook" note. Don't use them in a way
that suggests your fork or product _is_ Axlebook or is endorsed by it. The source files in this
folder are distributed with the rest of the repository under AGPL-3.0. IBM Plex is © IBM Corp.,
under the SIL OFL 1.1.
