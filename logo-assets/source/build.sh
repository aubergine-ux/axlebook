#!/usr/bin/env bash
# Rasterizes logo-assets SVGs into PNG/ICO. Requires: rsvg-convert (librsvg) and ImageMagick 7 (`magick`).
# Run from anywhere:  bash logo-assets/source/build.sh
set -euo pipefail
cd "$(dirname "$0")/.."

png() { rsvg-convert "$@"; }

# Favicons: a simplified glyph at 16/32 px, the detailed one from 48 px up.
png -w 16  icons/favicon-small.svg -o icons/favicon-16.png
png -w 32  icons/favicon-small.svg -o icons/favicon-32.png
png -w 48  icons/favicon.svg       -o icons/favicon-48.png
magick icons/favicon-16.png icons/favicon-32.png icons/favicon-48.png icons/favicon.ico

# App / PWA icons
png -w 180 icons/icon-square.svg   -o icons/apple-touch-icon.png
png -w 192 icons/icon-rounded.svg  -o icons/icon-192.png
png -w 512 icons/icon-rounded.svg  -o icons/icon-512.png
png -w 192 icons/icon-maskable.svg -o icons/maskable-192.png
png -w 512 icons/icon-maskable.svg -o icons/maskable-512.png

# Raster exports for docs, slides, and places that can't take SVG
mkdir -p png
png -h 128  svg/lockup-horizontal.svg      -o png/lockup-horizontal@2x.png
png -h 128  svg/lockup-horizontal-dark.svg -o png/lockup-horizontal-dark@2x.png
png -w 480  svg/lockup-stacked.svg         -o png/lockup-stacked@2x.png
png -w 480  svg/lockup-stacked-dark.svg    -o png/lockup-stacked-dark@2x.png
png -w 1024 svg/mark-tile.svg              -o png/mark-tile-1024.png
png -w 512  svg/mark.svg                   -o png/mark-512.png
png -w 512  svg/mark-dark.svg              -o png/mark-dark-512.png
png -w 1280 social/social-preview.svg      -o social/social-preview.png

echo "Rasterized logo assets."
