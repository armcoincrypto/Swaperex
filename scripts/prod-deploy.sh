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

# Outcome classification (printed at end)
DEPLOY_OUTCOME="DEPLOY_SUCCESS"
NGINX_WARN=0

die(){ echo "ERROR: $*" >&2; DEPLOY_OUTCOME="DEPLOY_FAILED"; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || die "Missing required tool: $1"; }

# shellcheck source=scripts/lib/nginx-deploy.sh
source "$REPO_DIR/scripts/lib/nginx-deploy.sh"

need git
need npm
need rsync
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
if ! rsync -a --delete --human-readable --info=stats2 "$DIST_DIR/" "$DEPLOY_DIR/"; then
  die "Asset rsync failed"
fi

COMMIT_HASH="$(git rev-parse HEAD)"
COMMIT_SHORT="$(git rev-parse --short HEAD)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
DEPLOYED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

echo
echo "== Write version.txt =="
cat > "$DEPLOY_DIR/version.txt" <<VEOF
environment=production
commit=$COMMIT_HASH
short=$COMMIT_SHORT
branch=$BRANCH
deployed=$DEPLOYED_AT
VEOF
echo "version.txt: short=$COMMIT_SHORT branch=$BRANCH deployed=$DEPLOYED_AT"

echo
set +e
swaperex_nginx_reload_optional
nginx_rc=$?
set -e
if [ "$nginx_rc" -ne 0 ]; then
  NGINX_WARN=1
  echo "WARN: nginx informational check returned rc=$nginx_rc (non-fatal — no reload performed)"
fi

echo
echo "== Post-deploy verification =="
cd "$REPO_DIR"
bash -n scripts/audit/deploy-match.sh
bash -n scripts/audit/verify-live.sh

validation_failed=0
if ! scripts/audit/deploy-match.sh; then
  validation_failed=1
fi
if ! scripts/audit/verify-live.sh; then
  validation_failed=1
fi

if [ "$validation_failed" -ne 0 ]; then
  DEPLOY_OUTCOME="DEPLOY_FAILED"
  echo
  echo "== Deploy outcome: $DEPLOY_OUTCOME =="
  echo "Log saved: $LOG_FILE"
  exit 1
fi

if [ "$NGINX_WARN" -ne 0 ]; then
  DEPLOY_OUTCOME="DEPLOY_SUCCESS_WITH_WARNINGS"
  echo
  echo "== Deploy outcome: $DEPLOY_OUTCOME =="
  echo "Assets synced and live validation passed."
  echo "WARN: informational nginx note — see nginx section above (Swaperex does not reload shared nginx)."
  echo "Static deploy complete; dex.kobbex.com live validation passed."
  echo "Log saved: $LOG_FILE"
  exit 2
fi

DEPLOY_OUTCOME="DEPLOY_SUCCESS"
echo
echo "== Deploy outcome: $DEPLOY_OUTCOME =="
echo "Log saved: $LOG_FILE"
exit 0
