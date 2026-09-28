#!/usr/bin/env bash
set -euo pipefail

USAGE="usage: $0 [--preview] [--port N] [--no-update] [--framework DIR] [--site-url URL]"
PORTAL="$(cd "$(dirname "$0")/.." && pwd)"
FRAMEWORK="${FRAMEWORK:-}"
FRAMEWORK_REPO="${FRAMEWORK_REPO:-https://github.com/freva-org/freva-web-nextgen.git}"
FRAMEWORK_REF="${FRAMEWORK_REF:-main}"
SITE_URL="${SITE_URL:-}"
UPDATE=1
PREVIEW=0
PORT=4321

while [ $# -gt 0 ]; do
  case "$1" in
    --framework) FRAMEWORK="$2"; shift 2 ;;
    --no-update) UPDATE=0; shift ;;
    --preview) PREVIEW=1; shift ;;
    --port) PORT="$2"; shift 2 ;;
    --site-url) SITE_URL="$2"; shift 2 ;;
    -h|--help) echo "$USAGE"; exit 0 ;;
    *) echo "$USAGE" >&2; exit 2 ;;
  esac
done

OUT="$PORTAL/build/portal"
CONFIG="portal/portal.yaml"
STAC_MATERIALS="$PORTAL/.stac-materials"
PY_MATERIALS="$PORTAL/.python-materials"

if [ -z "$FRAMEWORK" ]; then
  FRAMEWORK="$PORTAL/.freva-web-nextgen"
  if [ ! -d "$FRAMEWORK/.git" ]; then
    git clone --depth 1 --branch "$FRAMEWORK_REF" "$FRAMEWORK_REPO" "$FRAMEWORK"
  elif [ "$UPDATE" = 1 ]; then
    git -C "$FRAMEWORK" reset -q --hard
    git -C "$FRAMEWORK" clean -qfd
    git -C "$FRAMEWORK" fetch --depth 1 origin "$FRAMEWORK_REF"
    git -C "$FRAMEWORK" checkout -q --detach FETCH_HEAD
  fi
fi
FRAMEWORK="$(cd "$FRAMEWORK" && pwd)"
echo "==> framework: $FRAMEWORK ($(git -C "$FRAMEWORK" rev-parse --short HEAD 2>/dev/null || echo 'no git'))"

( cd "$FRAMEWORK" && npm install --no-audit --no-fund && npm run build )
export PATH="$FRAMEWORK/node_modules/.bin:$PATH"

if [ -z "${PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:-}" ]; then
  ( cd "$FRAMEWORK" && npx playwright install ${PLAYWRIGHT_INSTALL_ARGS:-} chromium )
fi

freva-portal-builder prepare-stac --out "$STAC_MATERIALS" --checkout-dir "$PORTAL/.stac-upstream"

if [ -n "$SITE_URL" ]; then
  case "$SITE_URL" in */) ;; *) SITE_URL="$SITE_URL/" ;; esac
  CONFIG="portal/.portal.site-url.yaml"
  sed -E "s#^(  canonicalUrl:).*#\\1 $SITE_URL#" "$PORTAL/portal/portal.yaml" > "$PORTAL/$CONFIG"
  grep -q "^  canonicalUrl: $SITE_URL\$" "$PORTAL/$CONFIG" \
    || { echo "could not set site.canonicalUrl in $CONFIG" >&2; exit 2; }
  echo "==> building for $SITE_URL"
fi

freva-portal-builder prepare-playground --source-root "$PORTAL" --config "$CONFIG" --out "$PY_MATERIALS"

"$PORTAL/scripts/fetch-wheels.sh" || echo "==> no healpix-geo wheel: the examples that import it will not run in the browser"

if git -C "$PORTAL" rev-parse HEAD >/dev/null 2>&1; then
  SOURCE_DATE_EPOCH="$(git -C "$PORTAL" show -s --format=%ct HEAD)"
else
  SOURCE_DATE_EPOCH="$(date +%s)"
fi
export SOURCE_DATE_EPOCH

cd "$PORTAL"
REVISION="${GITHUB_SHA:-}"
MATERIALS=(--stac-materials "$STAC_MATERIALS" --python-materials "$PY_MATERIALS")

freva-portal-builder validate --source-root "$PORTAL" --config "$CONFIG" "${MATERIALS[@]}"
rm -rf "$OUT"
freva-portal-builder build --source-root "$PORTAL" --config "$CONFIG" --out "$OUT" \
  ${REVISION:+--source-revision "$REVISION"} "${MATERIALS[@]}"
freva-portal-builder verify --dir "$OUT"

echo "artifact: $OUT"
if [ "$PREVIEW" = 1 ]; then
  exec freva-portal-builder preview --dir "$OUT" --port "$PORT"
fi
