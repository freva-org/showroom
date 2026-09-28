#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${HEALPIX_GEO_REPO:-GRID4EARTH/healpix-geo}"
ARTIFACT="${HEALPIX_GEO_ARTIFACT:-10969272491}"
OUT="$ROOT/.python-wheels"
TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"

mkdir -p "$OUT"

write_list() {
  ( cd "$OUT" && python3 -c 'import glob, json; print(json.dumps(sorted(glob.glob("marray-*.whl")) + sorted(glob.glob("healpix_geo-*.whl"))))' > wheels.json )
  echo "==> python-wheels: $(cat "$OUT/wheels.json")"
}

if ls "$OUT"/healpix_geo-*.whl "$OUT"/marray-*.whl >/dev/null 2>&1; then
  write_list
  exit 0
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if curl -fsSL --retry 3 --max-time 300 -o "$work/artifact.zip" \
     "https://nightly.link/$REPO/actions/artifacts/$ARTIFACT.zip"; then
  :
elif [ -n "$TOKEN" ] && curl -fsSL --retry 3 --max-time 300 -o "$work/artifact.zip" \
     -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
     "https://api.github.com/repos/$REPO/actions/artifacts/$ARTIFACT/zip"; then
  :
else
  echo "could not download artifact $ARTIFACT of $REPO" >&2
  write_list
  exit 1
fi

unzip -q -o "$work/artifact.zip" -d "$work/unpacked"
find "$work/unpacked" -name 'healpix_geo-*wasm32*.whl' > "$work/wheels.txt"
if [ "$(wc -l < "$work/wheels.txt" | tr -d ' ')" != 1 ]; then
  echo "expected one wasm32 healpix_geo wheel in the artifact, found:" >&2
  find "$work/unpacked" -name '*.whl' | sed 's#.*/#  #' >&2
  write_list
  exit 1
fi
rm -f "$OUT"/healpix_geo-*.whl
cp "$(cat "$work/wheels.txt")" "$OUT/"

marray_url="$(curl -fsSL https://pypi.org/pypi/marray/json | python3 -c 'import json, sys; print(next(u["url"] for u in json.load(sys.stdin)["urls"] if u["filename"].endswith("-py3-none-any.whl")))')"
rm -f "$OUT"/marray-*.whl
curl -fsSL --retry 3 -o "$OUT/$(basename "$marray_url")" "$marray_url"

write_list
name="$(basename "$(cat "$work/wheels.txt")" .whl)"
echo "==> healpix-geo platform tag: ${name##*-}"
