#!/usr/bin/env bash
set -euo pipefail

BASE="https://dex.kobbex.com"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Require JSON health payload (not SPA HTML with HTTP 200).
validate_json_health_endpoint() {
  local path="$1"
  local label="$2"
  local body_file code ct
  body_file="$(mktemp)"
  code="$(curl -sS -o "$body_file" -w '%{http_code}' "${BASE}${path}" 2>/dev/null || echo "000")"
  ct="$(curl -sSI "${BASE}${path}" 2>/dev/null | awk -F': ' 'tolower($1)=="content-type"{print $2}' | tr -d '\r' | head -1)"

  echo "${label}  HTTP ${code}  Content-Type: ${ct:-unknown}"

  if [ "$code" != "200" ]; then
    echo "❌ FAIL ${label} — HTTP ${code}"
    rm -f "$body_file"
    return 12
  fi

  ct_lc="$(printf '%s' "${ct:-}" | tr '[:upper:]' '[:lower:]')"
  case "$ct_lc" in
    *application/json*) ;;
    *)
      echo "❌ FAIL ${label} — expected application/json, got: ${ct:-empty}"
      head -c 80 "$body_file" 2>/dev/null || true
      echo
      rm -f "$body_file"
      return 12
      ;;
  esac

  if head -c 20 "$body_file" | grep -qiE '<!DOCTYPE|<html'; then
    echo "❌ FAIL ${label} — HTML body (SPA fallback?)"
    rm -f "$body_file"
    return 12
  fi

  if ! jq -e '.status' "$body_file" >/dev/null 2>&1; then
    echo "❌ FAIL ${label} — JSON missing .status"
    rm -f "$body_file"
    return 12
  fi

  rm -f "$body_file"
  return 0
}

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

echo "/                 $code_root"
echo "$JS_PATH  $code_js"

[ "$code_root" = "200" ] || { echo "❌ FAIL /"; exit 10; }
[ "$code_js"   = "200" ] || { echo "❌ FAIL asset"; exit 11; }

echo "== JSON health checks =="
validate_json_health_endpoint "/api/health" "/api/health"
validate_json_health_endpoint "/api/v1/health" "/api/v1/health"

echo "== version.txt =="
code_version="$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/version.txt" 2>/dev/null || echo "000")"
echo "/version.txt  HTTP ${code_version}"
[ "$code_version" = "200" ] || { echo "❌ FAIL /version.txt — HTTP ${code_version}"; exit 13; }

VERSION_BODY="$(curl -fsSL "${BASE}/version.txt" 2>/dev/null || true)"
if [ -z "$VERSION_BODY" ]; then
  echo "❌ FAIL /version.txt — empty body"
  exit 14
fi
if ! node "$SCRIPT_DIR/version-metadata.mjs" validate --text "$VERSION_BODY" --require-environment production; then
  echo "❌ FAIL /version.txt — schema validation failed"
  exit 16
fi
echo "✅ version.txt OK"

echo "✅ LIVE OK"
