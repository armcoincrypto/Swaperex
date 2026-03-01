#!/bin/bash
# Deploy Swaperex frontend (build + restart PM2)
# Run from server: ~/Swaperex/scripts/deploy-frontend.sh

set -e

REPO_DIR="${REPO_DIR:-/root/Swaperex}"
cd "$REPO_DIR/frontend" || exit 1

echo "[Deploy] Building frontend..."
npm ci --silent 2>/dev/null || npm install
npm run build

echo "[Deploy] Restarting PM2 frontend..."
pm2 restart frontend 2>/dev/null || pm2 reload frontend 2>/dev/null || echo "[Deploy] PM2 restart skipped (app may not be managed by PM2)"

echo "[Deploy] Done."
