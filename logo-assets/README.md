# Axlebook brand assets

This folder holds the project's logo and icon files plus the color tokens that the web app's light
and dark themes are built on.

## Files the app looks for

`npm run brand:sync` copies these into the web app. It also runs automatically before every web
build and in the Docker build. **Any file that's missing falls back to a neutral placeholder**, so
you can add them one at a time.

| Path                         | Format                                                                     | Used for                                               |
| ---------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------ |
| `icons/favicon.svg`          | SVG, square                                                                | Browser tab icon (modern browsers)                     |
| `icons/favicon.ico`          | ICO with 16/32/48 px                                                       | Browser tab icon (legacy)                              |
| `icons/apple-touch-icon.png` | PNG 180×180, **opaque**, full-bleed (no rounded corners: iOS adds its own) | iOS home screen                                        |
| `icons/icon-192.png`         | PNG 192×192                                                                | PWA icon, `purpose: any`                               |
| `icons/icon-512.png`         | PNG 512×512                                                                | PWA icon, `purpose: any`, and the install splash       |
| `icons/maskable-192.png`     | PNG 192×192, opaque, artwork inside the central 80% circle                 | PWA icon, `purpose: maskable` (Android adaptive icons) |
| `icons/maskable-512.png`     | PNG 512×512, same rules                                                    | PWA icon, `purpose: maskable`                          |
| `svg/logo.svg`               | SVG; any aspect ratio, displayed 28 px tall                                | App header on light theme                              |
| `svg/logo-dark.svg`          | SVG (optional; falls back to `logo.svg`)                                   | App header on dark theme                               |
| `social/social-preview.png`  | PNG 1280×640 (optional)                                                    | GitHub social preview and README banner                |

Tips:
- Give SVGs a `viewBox` and no fixed `width`/`height`, so the app can size them.
- Convert text in SVG logos to outlines, so the logo doesn't depend on installed fonts.
- Use [maskable.app](https://maskable.app) to check maskable icons against the safe zone.

## Color tokens

- `color/tokens.json` is the source of truth for theme colors, fonts, and radii.
- `color/tokens.css` is **generated** from it and imported directly by the web app. Don't edit it by hand.
- `color/palette.svg` is a swatch sheet, also generated.

After changing `tokens.json`:

```bash
node logo-assets/source/tokens.mjs
```

The script checks every pair listed under `contrast.pairs` against WCAG AA in both themes:
- 4.5:1 for text
- 7:1 for body text on page backgrounds
- 3:1 for UI borders and focus rings

It exits non-zero if any pair fails, and CI runs it.

### Color rules the UI relies on

- `accent` is a **fill** color. Text on it uses `on-accent`. For accent-colored _text_, use
  `accent-text`.
- Status colors (`overdue`, `soon`, `ok`, `info`) always come with an icon or a label. Color is
  never the only signal.

## Typography

- **IBM Plex Sans**: the interface. Tabular figures are used in tables.
- **IBM Plex Mono**: odometer readings, VINs, and part numbers.

Both fonts are SIL OFL 1.1 and are self-hosted via `@fontsource`. The app never loads fonts from
a CDN.
