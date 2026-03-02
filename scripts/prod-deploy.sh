#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$ROOT_DIR"
FRONTEND_DIR="$REPO_DIR/frontend"
DIST_DIR="$FRONTEND_DIR/dist"
DEPLOY_DIR="/var/www/swaperex"
LIVE_URL="https://dex.kobbex.com"

LOG_DIR="$REPO_DIR/scripts/logs"
mkdir -p "$LOG_DIR"
TS="$(date +%F_%H%M%S)"
LOG_FILE="$LOG_DIR/prod-deploy.$TS.log"

die(){ echo "ERROR: $*" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || die "Missing required tool: $1"; }

need git
need npm
need rsync
need nginx
need curl
need sha256sum

cd "$REPO_DIR"

exec > >(tee -a "$LOG_FILE") 2>&1
echo "== Swaperex prod deploy: $TS =="
echo "Repo:   $REPO_DIR"
echo "Deploy: $DEPLOY_DIR"
echo "Live:   $LIVE_URL"
echo "Log:    $LOG_FILE"
echo

echo "== Clean tree check =="
if [ -n "$(git status --porcelain)" ]; then
  git status -sb || true
  die "Working tree not clean. Commit/stash changes before deploy."
fi

# Safety: prevent deploying commits that are not pushed to origin/main
AHEAD="$(git rev-list --count origin/main..HEAD || echo 0)"
if [ "${AHEAD:-0}" -ne 0 ]; then
  die "HEAD is ahead of origin/main by $AHEAD commit(s). Push first, then deploy."
fi

echo "== Update main =="
git fetch --prune origin
git checkout main
git pull --ff-only origin main

echo
echo "== Build frontend =="
cd "$FRONTEND_DIR"
npm ci
npm run build
[ -d "$DIST_DIR" ] || die "Build did not produce dist dir: $DIST_DIR"
[ -f "$DIST_DIR/index.html" ] || die "Missing dist/index.html"

echo
echo "== Deploy assets (rsync) =="
[ -d "$DEPLOY_DIR" ] || die "Deploy dir missing: $DEPLOY_DIR"
rsync -a --delete --human-readable --info=stats2 "$DIST_DIR/" "$DEPLOY_DIR/"

echo
echo "== Nginx reload =="
nginx -t
systemctl reload nginx

echo
echo "== Post-deploy verification =="
cd "$REPO_DIR"
bash -n scripts/audit/deploy-match.sh
bash -n scripts/audit/verify-live.sh
scripts/audit/deploy-match.sh
scripts/audit/verify-live.sh

echo
echo "== Done =="
echo "Log saved: $LOG_FILE"
