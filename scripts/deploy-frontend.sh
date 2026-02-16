#!/usr/bin/env bash
#
# Golden Frontend Deploy Script for Swaperex
#
# Builds frontend from current HEAD, deploys to /var/www/swaperex,
# writes version.txt, reloads nginx, and runs smoke tests.
#
# Usage:
#   sudo bash scripts/deploy-frontend.sh          # full deploy
#   sudo bash scripts/deploy-frontend.sh --dry-run # show what would happen
#
# Requirements:
#   - Run as root (or with sudo) for nginx + /var/www writes
#   - Node.js / npm installed
#   - nginx installed and managing swaperex site
#
# Exit codes:
#   0 = success
#   1 = build failure
#   2 = deploy failure
#   3 = smoke test failure

set -euo pipefail

# ──────────────────────────────────────────────
# Configuration (override with env vars if needed)
# ──────────────────────────────────────────────
REPO_DIR="${REPO_DIR:-/root/Swaperex}"
DEPLOY_DIR="${DEPLOY_DIR:-/var/www/swaperex}"
BACKUP_DIR="${BACKUP_DIR:-/var/www/swaperex-backup}"
FRONTEND_DIR="$REPO_DIR/frontend"
NGINX_SERVICE="nginx"
SERVER_IP="${SERVER_IP:-127.0.0.1}"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
fi

# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────
log()   { echo "[deploy] $(date '+%Y-%m-%d %H:%M:%S') $1"; }
warn()  { echo "[deploy] $(date '+%Y-%m-%d %H:%M:%S') WARNING: $1" >&2; }
die()   { echo "[deploy] $(date '+%Y-%m-%d %H:%M:%S') FATAL: $1" >&2; exit "${2:-1}"; }

# ──────────────────────────────────────────────
# Pre-flight checks
# ──────────────────────────────────────────────
log "=== Swaperex Frontend Deploy ==="

[[ -d "$FRONTEND_DIR" ]]      || die "Frontend dir not found: $FRONTEND_DIR"
[[ -f "$FRONTEND_DIR/package.json" ]] || die "No package.json in $FRONTEND_DIR"
command -v node >/dev/null     || die "node not found in PATH"
command -v npm  >/dev/null     || die "npm not found in PATH"
command -v nginx >/dev/null    || die "nginx not found in PATH"

COMMIT_HASH=$(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")
COMMIT_SHORT=$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
BRANCH=$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

log "Commit:  $COMMIT_SHORT ($BRANCH)"
log "Deploy:  $DEPLOY_DIR"
log "Dry run: $DRY_RUN"

if $DRY_RUN; then
    log "[dry-run] Would build frontend, copy to $DEPLOY_DIR, reload nginx."
    log "[dry-run] version.txt would contain: $COMMIT_HASH @ $TIMESTAMP"
    exit 0
fi

# ──────────────────────────────────────────────
# Phase 1: Build
# ──────────────────────────────────────────────
log "Phase 1: Installing dependencies..."
cd "$FRONTEND_DIR"
npm ci --production=false --silent 2>&1 | tail -3 || die "npm ci failed" 1

log "Phase 1: Building frontend..."
npm run build 2>&1 | tail -5 || die "npm run build failed" 1

[[ -d "$FRONTEND_DIR/dist" ]] || die "Build succeeded but dist/ not found" 1
[[ -f "$FRONTEND_DIR/dist/index.html" ]] || die "dist/index.html missing after build" 1

log "Phase 1: Build OK ($(find "$FRONTEND_DIR/dist" -type f | wc -l) files)"

# ──────────────────────────────────────────────
# Phase 2: Backup current deployment
# ──────────────────────────────────────────────
if [[ -d "$DEPLOY_DIR" ]]; then
    log "Phase 2: Backing up $DEPLOY_DIR → $BACKUP_DIR ..."
    rm -rf "$BACKUP_DIR"
    cp -a "$DEPLOY_DIR" "$BACKUP_DIR"
    log "Phase 2: Backup OK"
else
    log "Phase 2: No existing deployment to back up"
    mkdir -p "$DEPLOY_DIR"
fi

# ──────────────────────────────────────────────
# Phase 3: Deploy
# ──────────────────────────────────────────────
log "Phase 3: Deploying to $DEPLOY_DIR ..."

# Remove old content but keep the directory
find "$DEPLOY_DIR" -mindepth 1 -delete 2>/dev/null || true

# Copy new build
cp -a "$FRONTEND_DIR/dist/." "$DEPLOY_DIR/"

# Write version marker
cat > "$DEPLOY_DIR/version.txt" <<VEOF
commit=$COMMIT_HASH
short=$COMMIT_SHORT
branch=$BRANCH
deployed=$TIMESTAMP
VEOF

# Remove source maps from public serving (security hardening)
find "$DEPLOY_DIR" -name '*.map' -delete 2>/dev/null || true
MAP_COUNT=$(find "$DEPLOY_DIR" -name '*.map' 2>/dev/null | wc -l)
log "Phase 3: Source maps removed (remaining: $MAP_COUNT)"

# Set permissions: nginx user (www-data) must read
chown -R www-data:www-data "$DEPLOY_DIR"
chmod -R 755 "$DEPLOY_DIR"

log "Phase 3: Deploy OK ($(find "$DEPLOY_DIR" -type f | wc -l) files)"

# ──────────────────────────────────────────────
# Phase 4: Nginx validation + reload
# ──────────────────────────────────────────────
log "Phase 4: Testing nginx config..."
nginx -t 2>&1 || {
    warn "nginx -t failed! Rolling back..."
    rm -rf "$DEPLOY_DIR"
    mv "$BACKUP_DIR" "$DEPLOY_DIR"
    die "Nginx config test failed. Rolled back to previous deployment." 2
}

log "Phase 4: Reloading nginx..."
systemctl reload "$NGINX_SERVICE" || die "nginx reload failed" 2

log "Phase 4: Nginx reloaded OK"

# ──────────────────────────────────────────────
# Phase 5: Smoke tests
# ──────────────────────────────────────────────
log "Phase 5: Running smoke tests..."
SMOKE_PASS=true

# Test 1: version.txt
log "  Checking /version.txt ..."
VERSION_RESPONSE=$(curl -sf "http://$SERVER_IP/version.txt" 2>/dev/null || echo "FAIL")
if echo "$VERSION_RESPONSE" | grep -q "$COMMIT_SHORT"; then
    log "  /version.txt OK — contains $COMMIT_SHORT"
else
    warn "/version.txt check failed (got: $VERSION_RESPONSE)"
    SMOKE_PASS=false
fi

# Test 2: index.html
log "  Checking / returns 200 ..."
HTTP_CODE=$(curl -so /dev/null -w '%{http_code}' "http://$SERVER_IP/" 2>/dev/null || echo "000")
if [[ "$HTTP_CODE" == "200" ]]; then
    log "  / returned HTTP $HTTP_CODE OK"
else
    warn "/ returned HTTP $HTTP_CODE (expected 200)"
    SMOKE_PASS=false
fi

# Test 3: backend health (non-fatal)
log "  Checking /api/health ..."
API_CODE=$(curl -so /dev/null -w '%{http_code}' "http://$SERVER_IP/api/health" 2>/dev/null || echo "000")
if [[ "$API_CODE" == "200" ]]; then
    log "  /api/health returned HTTP $API_CODE OK"
else
    warn "/api/health returned HTTP $API_CODE (backend may be down — non-fatal)"
fi

# Test 4: .env should be denied
log "  Checking /.env is blocked ..."
ENV_CODE=$(curl -so /dev/null -w '%{http_code}' "http://$SERVER_IP/.env" 2>/dev/null || echo "000")
if [[ "$ENV_CODE" == "403" || "$ENV_CODE" == "404" ]]; then
    log "  /.env returned HTTP $ENV_CODE OK (blocked)"
else
    warn "/.env returned HTTP $ENV_CODE (should be 403 or 404)"
fi

# Test 5: .map files should not be served
log "  Checking .map files not served ..."
MAP_URL=$(curl -sf "http://$SERVER_IP/" 2>/dev/null | grep -oP '[^"]+\.js' | head -1 || true)
if [[ -n "$MAP_URL" ]]; then
    MAP_CODE=$(curl -so /dev/null -w '%{http_code}' "http://$SERVER_IP/${MAP_URL}.map" 2>/dev/null || echo "000")
    if [[ "$MAP_CODE" == "403" || "$MAP_CODE" == "404" ]]; then
        log "  .map files blocked (HTTP $MAP_CODE) OK"
    else
        warn ".map returned HTTP $MAP_CODE (should be 403/404)"
    fi
fi

if $SMOKE_PASS; then
    log "Phase 5: All critical smoke tests PASSED"
else
    warn "Phase 5: Some smoke tests failed — check output above"
    log "Rollback available at: $BACKUP_DIR"
    exit 3
fi

# ──────────────────────────────────────────────
# Done
# ──────────────────────────────────────────────
log "=== Deploy complete ==="
log "  Version:  $COMMIT_SHORT"
log "  Branch:   $BRANCH"
log "  Time:     $TIMESTAMP"
log "  Backup:   $BACKUP_DIR"
log "  Rollback: sudo rm -rf $DEPLOY_DIR && sudo mv $BACKUP_DIR $DEPLOY_DIR && sudo systemctl reload nginx"
