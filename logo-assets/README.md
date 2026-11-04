# Axlebook brand kit

Every mile, on the record.

## What's here

- `brand-guide/` — the 10-page brand guide as a PDF and one PNG per page.
- `logo/png`, `logo/svg` — glass app icon (default, light, clear), flat mark, mono marks, wordmark, horizontal and stacked lockups for light and dark grounds. SVG is the master; PNGs are 1024–2400 px.
- `app-icons/` — macOS (1024), iOS (1024, full bleed), apple-touch-icon (180), PWA (192, 512, maskable 512/192), favicon (16/32/48, .ico, .svg), avatar (1000).
- `icons/` — 18 product icons. `svg/` strokes with currentColor; `png/` at 96 px in graphite, white and orange.
- `social/` — GitHub social preview, Open Graph image, X header, README banners (dark and light), three launch posts and a release template.
- `fonts/` — Archivo (variable, use wdth 125 / wght 800 for display) and IBM Plex Mono 400/500/600, both SIL Open Font License.
- `tokens.json` — colour (light and dark), type, spacing, radius and shadow tokens.

## Quick rules

- Glass icon at 64 px and up; flat mark below that and for print.
- Orange is scarce: one primary action per view, the needle, the last odometer digit.
- Text on orange is always dark (#1A1206). Orange text uses orange-text (#AD5200 light, #FFAB4A dark).
- Status always has a word, never colour alone.
- Don't stretch, rotate, recolour the needle, add effects, or retype the wordmark.

## Web manifest snippet

```json
"icons": [
  { "src": "/pwa-192.png", "sizes": "192x192", "type": "image/png" },
  { "src": "/pwa-512.png", "sizes": "512x512", "type": "image/png" },
  { "src": "/pwa-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
]
```

## README banner

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/readme-banner-dark-1600x400.png">
  <img alt="Axlebook" src="docs/brand/readme-banner-light-1600x400.png">
</picture>
```
