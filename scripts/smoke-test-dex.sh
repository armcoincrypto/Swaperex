#!/bin/bash
# Smoke tests for dex.kobbex.com (HTTPS required — nginx redirects HTTP→301)

set -e

BASE_URL="${1:-https://dex.kobbex.com}"
FAILED=0

echo "[smoke] Base URL: $BASE_URL"
echo ""

# / returns 200
if curl -sfI "$BASE_URL/" | head -1 | grep -q "200"; then
  echo "[smoke] / returns 200 OK"
else
  echo "[smoke] FAIL: / did not return 200"
  FAILED=1
fi

# /version.txt (optional — 404 is OK if not deployed)
STATUS=$(curl -sI "$BASE_URL/version.txt" | head -1)
if echo "$STATUS" | grep -qE "200|404"; then
  echo "[smoke] /version.txt OK"
else
  echo "[smoke] WARN: /version.txt $STATUS"
fi

# /.env should be 403 or 404 (not served; SPA fallback may return 200)
STATUS=$(curl -sI "$BASE_URL/.env" | head -1)
if echo "$STATUS" | grep -qE "403|404"; then
  echo "[smoke] /.env blocked OK"
else
  echo "[smoke] WARN: /.env returns 200 (SPA fallback — ensure no secrets in repo)"
fi

# Security header present
HEADERS=$(curl -sI "$BASE_URL/")
if echo "$HEADERS" | grep -qi "X-Content-Type-Options"; then
  echo "[smoke] Security headers OK"
else
  echo "[smoke] WARN: X-Content-Type-Options missing"
fi

echo ""
if [ $FAILED -eq 1 ]; then
  echo "[smoke] Some checks failed"
  exit 1
fi
echo "[smoke] All checks passed"
