#!/usr/bin/env bash
# Build a Chrome Web Store–ready ZIP (files at archive root, no extra folders).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -e "console.log(JSON.parse(require('fs').readFileSync('manifest.json','utf8')).version)")"
OUT="dist/quiztex-v${VERSION}.zip"
mkdir -p dist

zip -j "$OUT" \
  manifest.json \
  content.js \
  tex-svg.js \
  popup.html \
  icon16.png \
  icon48.png \
  icon128.png \
  LICENSE

echo "Created $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
echo "Upload this file in the Chrome Web Store Developer Dashboard."
