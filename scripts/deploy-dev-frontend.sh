#!/usr/bin/env bash
#
# Dev frontend deploy — dev.dex.kobbex.com → /var/www/swaperex-dev
#
# Does NOT write to /var/www/swaperex or change production nginx vhost logic.
# Uses production Vite env (.env.production) so same-origin /api/v1 proxies match prod.
#
# Usage:
#   sudo bash scripts/deploy-dev-frontend.sh
#   sudo bash scripts/deploy-dev-frontend.sh --dry-run
#
# Prerequisites:
#   - dev nginx site enabled (scripts/apply-nginx-dev.sh)
#   - TLS cert for dev.dex.kobbex.com (certbot webroot → /var/www/swaperex-dev)

set -euo pipefail

REPO_DIR="${REPO_DIR:-/root/Swaperex}"
DEPLOY_DIR="${DEPLOY_DIR:-/var/www/swaperex-dev}"
BACKUP_BASE="${BACKUP_BASE:-/var/www/swaperex-dev-backup}"
BACKUP_DIR="${BACKUP_DIR:-${BACKUP_BASE}-$(date -u +%Y%m%dT%H%M%SZ)}"
FRONTEND_DIR="$REPO_DIR/frontend"
NGINX_SERVICE="nginx"
SERVER_IP="${SERVER_IP:-127.0.0.1}"
SMOKE_PUBLIC_HOST="${SMOKE_PUBLIC_HOST:-dev.dex.kobbex.com}"
SMOKE_RESOLVE="${SMOKE_RESOLVE:-${SMOKE_PUBLIC_HOST}:443:${SERVER_IP}}"
SMOKE_ORIGIN="https://${SMOKE_PUBLIC_HOST}"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

log()   { echo "[deploy-dev] $(date '+%Y-%m-%d %H:%M:%S') $1"; }
warn()  { echo "[deploy-dev] $(date '+%Y-%m-%d %H:%M:%S') WARNING: $1" >&2; }
die()   { echo "[deploy-dev] $(date '+%Y-%m-%d %H:%M:%S') FATAL: $1" >&2; exit "${2:-1}"; }

log "=== Swaperex DEV Frontend Deploy ==="

[[ -d "$FRONTEND_DIR" ]] || die "Frontend dir not found: $FRONTEND_DIR"
command -v node >/dev/null || die "node not found"
command -v npm  >/dev/null || die "npm not found"
command -v nginx >/dev/null || die "nginx not found"

COMMIT_HASH=$(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")
COMMIT_SHORT=$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
BRANCH=$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

log "Commit:  $COMMIT_SHORT ($BRANCH)"
log "Deploy:  $DEPLOY_DIR (dev only)"
log "Host:    $SMOKE_PUBLIC_HOST"
log "Dry run: $DRY_RUN"

if $DRY_RUN; then
  log "[dry-run] Would build with npm run build (production mode / .env.production)"
  log "[dry-run] Would deploy to $DEPLOY_DIR and write dev version.txt"
  exit 0
fi

log "Phase 1: Installing dependencies..."
cd "$FRONTEND_DIR"
npm ci --production=false

log "Phase 1: Building frontend (production bundle, dev deploy target)..."
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
npm run build

[[ -d "$FRONTEND_DIR/dist" ]] || die "dist/ missing after build"
[[ -f "$FRONTEND_DIR/dist/index.html" ]] || die "dist/index.html missing"

if [[ -d "$DEPLOY_DIR" ]]; then
  log "Phase 2: Backing up → $BACKUP_DIR"
  [[ ! -e "$BACKUP_DIR" ]] || die "Backup path exists: $BACKUP_DIR"
  cp -a "$DEPLOY_DIR" "$BACKUP_DIR"
else
  mkdir -p "$DEPLOY_DIR"
fi

log "Phase 3: Deploying to $DEPLOY_DIR ..."
find "$DEPLOY_DIR" -mindepth 1 -delete 2>/dev/null || true
cp -a "$FRONTEND_DIR/dist/." "$DEPLOY_DIR/"

cat > "$DEPLOY_DIR/version.txt" <<VEOF
environment=dev
host=dev.dex.kobbex.com
commit=$COMMIT_HASH
short=$COMMIT_SHORT
branch=$BRANCH
deployed=$TIMESTAMP
VEOF

find "$DEPLOY_DIR" -name '*.map' -delete 2>/dev/null || true
chown -R www-data:www-data "$DEPLOY_DIR"
chmod -R 755 "$DEPLOY_DIR"

log "Phase 4: nginx -t (validates all sites; reload is graceful) ..."
if ! nginx -t 2>&1; then
  warn "nginx -t failed — rolling back dev deploy only"
  if [[ -d "$BACKUP_DIR" ]]; then
    rm -rf "$DEPLOY_DIR"
    mv "$BACKUP_DIR" "$DEPLOY_DIR"
  fi
  die "nginx config test failed" 2
fi

systemctl reload "$NGINX_SERVICE" || die "nginx reload failed" 2

log "Phase 5: Dev smoke tests ..."
SMOKE_PASS=true
VERSION_RESPONSE=$(curl -sfS --resolve "$SMOKE_RESOLVE" "${SMOKE_ORIGIN}/version.txt" 2>/dev/null || echo "FAIL")
if echo "$VERSION_RESPONSE" | grep -q "environment=dev" && echo "$VERSION_RESPONSE" | grep -q "$COMMIT_SHORT"; then
  log "  /version.txt OK (environment=dev, $COMMIT_SHORT)"
else
  warn "/version.txt unexpected: $VERSION_RESPONSE"
  SMOKE_PASS=false
fi

HTTP_CODE=$(curl -sS -o /dev/null -w '%{http_code}' --resolve "$SMOKE_RESOLVE" "${SMOKE_ORIGIN}/" 2>/dev/null || echo "000")
[[ "$HTTP_CODE" == "200" ]] || { warn "/ returned HTTP $HTTP_CODE"; SMOKE_PASS=false; }

API_CODE=$(curl -sS -o /dev/null -w '%{http_code}' --resolve "$SMOKE_RESOLVE" "${SMOKE_ORIGIN}/api/health" 2>/dev/null || echo "000")
[[ "$API_CODE" == "200" ]] && log "  /api/health HTTP $API_CODE" || warn "/api/health HTTP $API_CODE (non-fatal)"

$SMOKE_PASS || {
  log "Rollback: sudo rm -rf $DEPLOY_DIR && sudo mv $BACKUP_DIR $DEPLOY_DIR && sudo systemctl reload nginx"
  exit 3
}

log "=== Dev deploy complete ==="
log "  Verify: bash scripts/audit/verify-dev-live.sh"
log "  Rollback: sudo rm -rf $DEPLOY_DIR && sudo mv $BACKUP_DIR $DEPLOY_DIR && sudo systemctl reload nginx"
