#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BRANCH="$(git branch --show-current)"
echo "== Branch: $BRANCH =="

if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Working tree is not clean. Commit/stash first:"
  git status --porcelain
  exit 2
fi

echo "== Pull latest =="
git fetch origin --prune
git pull --ff-only

echo "== Frontend install/build =="
cd frontend
npm ci
npm run build
cd "$ROOT"

echo "== Deploy dist -> /var/www/swaperex =="
sudo rsync -a --delete frontend/dist/ /var/www/swaperex/

echo "== Nginx reload =="
sudo nginx -t
sudo systemctl reload nginx

echo "== Verify deploy matches local build =="
./scripts/audit/deploy-match.sh

echo "== Verify live site =="
./scripts/audit/verify-live.sh

echo "✅ DONE: build + deploy + verify"
