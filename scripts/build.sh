#!/usr/bin/env bash
# Builds the site into site/ (the Freva parts once, the example pages, then MkDocs); `build.sh serve` serves it with live reload.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d node_modules ] || npm ci --no-audit --no-fund
./scripts/fetch-wheels.sh || echo "no healpix-geo wheel: the examples that import it will not run in the browser"
node scripts/prepare.mjs
copy="cp -a"
[ "${1:-}" = serve ] && copy="cp -as"
rm -rf .build site
mkdir -p .build/data/assets
$copy "$PWD/data/." .build/data/
$copy "$PWD/assets/." .build/data/assets/
python3 scripts/build_examples.py --render --out .build/data
if [ "${1:-}" = serve ]; then exec mkdocs serve --watch data --watch assets; fi
mkdocs build --strict
