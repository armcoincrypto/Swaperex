#!/usr/bin/env bash
set -euo pipefail

BASE="https://dex.kobbex.com"

echo "== Fetch HTML =="
HTML="$(curl -fsSL "$BASE")"

JS_PATH="$(printf "%s" "$HTML" | grep -oE '/assets/index-[^"]+\.js' | head -n 1 || true)"
if [ -z "$JS_PATH" ]; then
  echo "❌ Could not find /assets/index-*.js in HTML"
  exit 2
fi

JS_FILE="$(basename "$JS_PATH")"
LOCAL_ASSET="/var/www/swaperex/assets/$JS_FILE"

echo "HTML index js: $JS_PATH"
echo "Local asset:   $LOCAL_ASSET"

echo "== Local file exists? =="
if [ -f "$LOCAL_ASSET" ]; then
  echo "✅ EXISTS"
else
  echo "❌ MISSING"
  exit 3
fi

echo "== HTTP checks =="
code_root="$(curl -s -o /dev/null -w '%{http_code}' "$BASE")"
code_js="$(curl -s -o /dev/null -w '%{http_code}' "$BASE$JS_PATH")"
code_api="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/health")"
code_v1="$(curl -s -o /dev/null -w '%{htt}' "$BASE/api/v1/health" || true)"

echo "/                 $code_root"
echo "$JS_PATH  $code_js"
echo "/api/health       $code_api"
echo "/api/v1/health    ${code_v1:-000}"

[ "$code_root" = "200" ] || { echo "❌ FAIL /"; exit 10; }
[ "$code_js"   = "200" ] || { echo "❌ FAIL asset"; exit 11; }
[ "$code_api"  = "200" ] || { echo "❌ FAIL /api/health"; exit 12; }

# /api/v1/health might not exist in some deployments; enforce only if it returns something meaningful
if [ -n "${code_v1:-}" ] && [ "${code_v1:-000}" != "000" ]; then
  [ "$code_v1" = "200" ] || { echo "❌ FAIL /api/v1/health"; exit 13; }
fi

echo "✅ LIVE OK"
