#!/usr/bin/env bash
set -euo pipefail
cd ~/Swaperex || exit 1

echo "== Find built index-* in local dist =="
LOCAL="$(ls -1 frontend/dist/assets/index-*.js 2>/dev/null | head -n 1 || true)"
if [ -z "${LOCAL}" ]; then
  echo "ERR: frontend/dist/assets/index-*.js not found. Run build first."
  exit 1
fi
echo "LOCAL: $LOCAL"

echo
echo "== Find deployed index-* on server =="
DEPLOYED="$(ls -1 /var/www/swaperex/assets/index-*.js 2>/dev/null | head -n 1 || true)"
if [ -z "${DEPLOYED}" ]; then
  echo "ERR: /var/www/swaperex/assets/index-*.js not found."
  exit 1
fi
echo "DEPLOYED: $DEPLOYED"

echo
if [ "$(basename "$LOCAL")" = "$(basename "$DEPLOYED")" ]; then
  echo "✅ OK: deployed assets match local build"
else
  echo "⚠️ MISMdeployed assets differ from local build"
  echo "This usually means you deployed from another build or the rsync did not run."
fi
