#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Swaperex PROD deploy =="

# ---- preflight: tools
command -v git >/dev/null
command -v npm >/dev/null
command -v rsync >/dev/null
command -v nginx >/dev/null
command -v curl >/dev/null

# ---- preflight: repo state
BRANCH="$(git branch --show-current)"
echo "== Current branch: $BRANCH =="

if [ -n "$(git status --porcelain | grep -vE '^\?\? scripts/.*\.bak\.')" ]; then
  echo "❌ Working tree is not clean. Commit/stash first:"
  git status --porcelain
  exit 2
fi

echo "== Fetch + checkout main =="
git fetch origin --prune

# switch to main (safe even if already on main)
git checkout main

echo "== Pull latest main =="
git pull --ff-only

echo "== Deployed commit =="
git log -1 --oneline --decorate

# ---- build
echo "== Frontend install/build =="
cd frontend
npm ci
npm run build
cd "$ROOT"

# ---- deploy
echo "== Deploy dist -> /var/www/swaperex =="
sudo rsync -a --delete frontend/dist/ /var/www/swaperex/

echo "== Nginx reload =="
sudo nginx -t
sudo systemctl reload nginx

# ---- verify deployed matches build (local dist vs /var/www)
if [ -x scripts/audit/deploy-match.sh ]; then
  echo "== Verify deploy matches local build =="
  bash scripts/audit/deploy-match.sh
else
  echo "WARN: scripts/audit/deploy-match.sh not found, skipping"
fi

# ---- verify live
if [ -x scripts/audit/verify-live.sh ]; then
  echo "== Verify live site =="
  bash scripts/audit/verify-live.sh
else
  echo "WARN: scripts/audit/verify-live.sh not found, skipping"
fi

echo "✅ DONE: build + deploy + verify"
