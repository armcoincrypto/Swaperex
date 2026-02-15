#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
#  Swaperex Frontend — Golden Deploy Script
#
#  Rebuilds the frontend, deploys to nginx static root,
#  writes version.txt, reloads nginx, and runs smoke tests.
#
#  Usage:
#    ./scripts/deploy-frontend.sh              # default (git pull + build + deploy)
#    ./scripts/deploy-frontend.sh --no-pull    # skip git pull (use current checkout)
#    ./scripts/deploy-frontend.sh --dry-run    # show what would happen, don't do it
#
#  Prerequisites:
#    - Node.js 18+ and npm installed
#    - nginx running and serving /var/www/swaperex
#    - Run as root (or user with sudo for nginx reload)
#
#  Rollback:
#    rsync -a --delete /var/www/swaperex.bak/ /var/www/swaperex/
#    systemctl reload nginx
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────
REPO_DIR="/root/Swaperex"
FRONTEND_DIR="${REPO_DIR}/frontend"
DEPLOY_DIR="/var/www/swaperex"
BACKUP_DIR="/var/www/swaperex.bak"
BRANCH="main"
PUBLIC_IP="207.180.212.142"

# ── Flags ────────────────────────────────────────────────────────
SKIP_PULL=false
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --no-pull)  SKIP_PULL=true ;;
    --dry-run)  DRY_RUN=true ;;
    --help|-h)
      echo "Usage: $0 [--no-pull] [--dry-run]"
      echo "  --no-pull   Skip git pull (use current checkout)"
      echo "  --dry-run   Show what would happen without making changes"
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg"
      exit 1
      ;;
  esac
done

# ── Helpers ──────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

log()  { echo -e "[deploy] $(date '+%H:%M:%S') ${GREEN}$1${NC}"; }
warn() { echo -e "[deploy] $(date '+%H:%M:%S') ${YELLOW}WARN: $1${NC}"; }
fail() { echo -e "[deploy] $(date '+%H:%M:%S') ${RED}FAIL: $1${NC}"; exit 1; }

run() {
  if [ "$DRY_RUN" = true ]; then
    echo -e "[dry-run] $*"
  else
    "$@"
  fi
}

# ── Pre-flight checks ───────────────────────────────────────────
log "Starting frontend deploy..."

[ -d "$REPO_DIR/.git" ] || fail "Git repo not found at $REPO_DIR"
[ -d "$FRONTEND_DIR" ] || fail "Frontend dir not found at $FRONTEND_DIR"
command -v node >/dev/null || fail "node not found in PATH"
command -v npm >/dev/null || fail "npm not found in PATH"
command -v nginx >/dev/null || fail "nginx not found in PATH"
command -v rsync >/dev/null || fail "rsync not found (apt install rsync)"

NODE_V=$(node --version)
log "Node: $NODE_V, npm: $(npm --version)"

# ── Step 1: Git pull ────────────────────────────────────────────
if [ "$SKIP_PULL" = false ]; then
  log "Step 1/6: Pulling latest from origin/${BRANCH}..."
  cd "$REPO_DIR"
  run git fetch origin "$BRANCH"
  run git checkout "$BRANCH"
  run git pull origin "$BRANCH"
else
  log "Step 1/6: Skipping git pull (--no-pull)"
fi

GIT_SHA=$(cd "$REPO_DIR" && git rev-parse --short HEAD)
GIT_MSG=$(cd "$REPO_DIR" && git log -1 --format='%s')
log "Current commit: ${GIT_SHA} — ${GIT_MSG}"

# ── Step 2: Install dependencies ────────────────────────────────
log "Step 2/6: Installing dependencies (npm ci)..."
cd "$FRONTEND_DIR"
run npm ci --prefer-offline --no-audit 2>&1 | tail -3

# ── Step 3: Build ────────────────────────────────────────────────
log "Step 3/6: Building frontend..."
run npm run build 2>&1 | tail -5

# Verify build output
if [ "$DRY_RUN" = false ]; then
  [ -f "${FRONTEND_DIR}/dist/index.html" ] || fail "Build failed — dist/index.html not found"
  ASSET_COUNT=$(find "${FRONTEND_DIR}/dist/assets" -type f | wc -l)
  log "Build complete: ${ASSET_COUNT} assets in dist/"
fi

# ── Step 4: Backup current deploy ───────────────────────────────
log "Step 4/6: Backing up current deploy..."
if [ -d "$DEPLOY_DIR" ]; then
  run rm -rf "$BACKUP_DIR"
  run cp -a "$DEPLOY_DIR" "$BACKUP_DIR"
  log "Backup saved to $BACKUP_DIR"
else
  warn "No existing deploy at $DEPLOY_DIR — fresh deploy"
  run mkdir -p "$DEPLOY_DIR"
fi

# ── Step 5: Deploy (rsync) ──────────────────────────────────────
log "Step 5/6: Deploying to ${DEPLOY_DIR}..."
run rsync -a --delete "${FRONTEND_DIR}/dist/" "${DEPLOY_DIR}/"

# Write version.txt
if [ "$DRY_RUN" = false ]; then
  cat > "${DEPLOY_DIR}/version.txt" << EOF
commit=${GIT_SHA}
message=${GIT_MSG}
deployed=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
node=${NODE_V}
EOF
  log "version.txt written"
fi

# ── Step 6: Reload nginx + smoke test ───────────────────────────
log "Step 6/6: Reloading nginx and running smoke tests..."
run nginx -t
run systemctl reload nginx

if [ "$DRY_RUN" = false ]; then
  sleep 1

  # Smoke test: localhost
  HTTP_LOCAL=$(curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1/ 2>/dev/null || echo "000")
  if [ "$HTTP_LOCAL" = "200" ]; then
    log "Smoke test (localhost): PASS (HTTP ${HTTP_LOCAL})"
  else
    warn "Smoke test (localhost): HTTP ${HTTP_LOCAL}"
  fi

  # Smoke test: public IP
  HTTP_PUBLIC=$(curl -sS -o /dev/null -w "%{http_code}" "http://${PUBLIC_IP}/" 2>/dev/null || echo "000")
  if [ "$HTTP_PUBLIC" = "200" ]; then
    log "Smoke test (public IP): PASS (HTTP ${HTTP_PUBLIC})"
  else
    warn "Smoke test (public IP): HTTP ${HTTP_PUBLIC}"
  fi

  # Verify asset is loadable
  ASSET_PATH=$(grep -oE '/assets/index-[^"]+\.js' "${DEPLOY_DIR}/index.html" | head -1)
  if [ -n "$ASSET_PATH" ] && [ -f "${DEPLOY_DIR}${ASSET_PATH}" ]; then
    ASSET_SIZE=$(du -h "${DEPLOY_DIR}${ASSET_PATH}" | cut -f1)
    log "Main JS bundle: ${ASSET_PATH} (${ASSET_SIZE})"
  else
    warn "Could not verify main JS asset"
  fi

  # Print version
  echo ""
  log "Deploy complete!"
  echo "──────────────────────────────────────"
  cat "${DEPLOY_DIR}/version.txt"
  echo "──────────────────────────────────────"
else
  log "[dry-run] Deploy simulation complete"
fi
