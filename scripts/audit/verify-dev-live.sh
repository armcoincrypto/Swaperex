#!/usr/bin/env bash
# Live checks for dev.dex.kobbex.com (does not curl production dex.kobbex.com).
# Workflow: docs/PRODUCTION_WORKFLOW.md (step F — verify dev)
set -euo pipefail

BASE="${DEV_BASE_URL:-https://dev.dex.kobbex.com}"
DEPLOY_DIR="${DEV_DEPLOY_DIR:-/var/www/swaperex-dev}"

echo "== Dev environment: $BASE =="

echo "== version.txt =="
VERSION="$(curl -fsSL "$BASE/version.txt" 2>/dev/null || true)"
if [ -z "$VERSION" ]; then
  echo "❌ Could not fetch /version.txt"
  exit 1
fi
echo "$VERSION"
echo "$VERSION" | grep -q '^environment=dev' || {
  echo "❌ version.txt missing environment=dev"
  exit 2
}
echo "✅ environment=dev"

echo "== Fetch HTML =="
HTML="$(curl -fsSL "$BASE")"
JS_PATH="$(printf "%s" "$HTML" | grep -oE '/assets/index-[^"]+\.js' | head -n 1 || true)"
if [ -z "$JS_PATH" ]; then
  echo "❌ Could not find /assets/index-*.js in HTML"
  exit 3
fi

JS_FILE="$(basename "$JS_PATH")"
LOCAL_ASSET="$DEPLOY_DIR/assets/$JS_FILE"

echo "HTML index js: $JS_PATH"
echo "Local asset:   $LOCAL_ASSET"

if [ -f "$LOCAL_ASSET" ]; then
  echo "✅ local asset exists"
else
  echo "❌ local asset missing under $DEPLOY_DIR"
  exit 4
fi

echo "== HTTP checks =="
code_root="$(curl -s -o /dev/null -w '%{http_code}' "$BASE")"
code_js="$(curl -s -o /dev/null -w '%{http_code}' "$BASE$JS_PATH")"
code_api="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/health")"
code_v1="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/health" || true)"

echo "/                 $code_root"
echo "$JS_PATH  $code_js"
echo "/api/health       $code_api"
echo "/api/v1/health    ${code_v1:-000}"

[ "$code_root" = "200" ] || { echo "❌ FAIL /"; exit 10; }
[ "$code_js"   = "200" ] || { echo "❌ FAIL asset"; exit 11; }
[ "$code_api"  = "200" ] || { echo "❌ FAIL /api/health"; exit 12; }

if [ -n "${code_v1:-}" ] && [ "${code_v1:-000}" != "000" ]; then
  [ "$code_v1" = "200" ] || { echo "❌ FAIL /api/v1/health"; exit 13; }
fi

echo "== Production isolation (spot check) =="
prod_code="$(curl -s -o /dev/null -w '%{http_code}' https://dex.kobbex.com/ 2>/dev/null || echo "000")"
echo "https://dex.kobbex.com/  HTTP $prod_code (expect 200; non-fatal if unreachable from this host)"

echo "✅ DEV LIVE OK — $BASE"
