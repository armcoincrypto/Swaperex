#!/usr/bin/env bash
#
# Safe dev frontend deploy — dev.dex.kobbex.com -> /var/www/swaperex-dev
#
# Workflow: docs/PRODUCTION_WORKFLOW.md (steps E–F: deploy to dev, verify dev)
#
# Build and stage first. Only replace the live dev directory after the build and
# staged artifact checks succeed. If post-deploy smoke fails, restore the prior
# dev directory from the timestamped backup.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="${REPO_DIR:-$SCRIPT_REPO_DIR}"
DEPLOY_DIR="${DEPLOY_DIR:-/var/www/swaperex-dev}"
BACKUP_BASE="${BACKUP_BASE:-/var/www/swaperex-dev-backup}"
FRONTEND_DIR="$REPO_DIR/frontend"
NGINX_SERVICE="${NGINX_SERVICE:-nginx}"
SERVER_IP="${SERVER_IP:-127.0.0.1}"
SMOKE_PUBLIC_HOST="${SMOKE_PUBLIC_HOST:-dev.dex.kobbex.com}"
SMOKE_RESOLVE="${SMOKE_RESOLVE:-${SMOKE_PUBLIC_HOST}:443:${SERVER_IP}}"
SMOKE_ORIGIN="https://${SMOKE_PUBLIC_HOST}"
LOG_DIR="${DEV_DEPLOY_LOG_DIR:-$REPO_DIR/scripts/logs}"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="$LOG_DIR/deploy-dev-frontend.$RUN_ID.log"
RESULT_FILE="$LOG_DIR/deploy-dev-frontend.latest.env"
BACKUP_DIR="${BACKUP_DIR:-${BACKUP_BASE}-${RUN_ID}}"
BUILD_DIR=""
INSTALL_DIR=""
RESULT_WRITTEN=false
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

log()  { echo "[deploy-dev] $(date '+%Y-%m-%d %H:%M:%S') $1"; }
warn() { echo "[deploy-dev] $(date '+%Y-%m-%d %H:%M:%S') WARNING: $1" >&2; }

write_result() {
  local status="$1"
  local detail="${2:-}"
  cat > "$RESULT_FILE" <<EOF
status=$status
detail=$detail
repo=$REPO_DIR
commit=${COMMIT_HASH:-unknown}
short=${COMMIT_SHORT:-unknown}
branch=${BRANCH:-unknown}
deploy_dir=$DEPLOY_DIR
backup_dir=${BACKUP_DIR:-}
log_file=$LOG_FILE
timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
EOF
  RESULT_WRITTEN=true
}

cleanup() {
  local rc=$?
  [[ -n "${BUILD_DIR:-}" && -d "$BUILD_DIR" ]] && rm -rf "$BUILD_DIR"
  [[ -n "${INSTALL_DIR:-}" && -d "$INSTALL_DIR" ]] && rm -rf "$INSTALL_DIR"
  if [[ "$rc" -ne 0 && "$RESULT_WRITTEN" != true ]]; then
    write_result "failed" "exit_$rc"
  fi
}
trap cleanup EXIT

die() {
  local message="$1"
  local code="${2:-1}"
  echo "[deploy-dev] $(date '+%Y-%m-%d %H:%M:%S') FATAL: $message" >&2
  write_result "failed" "$message"
  exit "$code"
}

restore_backup_and_die() {
  local message="$1"
  warn "$message"
  if [[ -d "$BACKUP_DIR" ]]; then
    warn "Restoring previous dev deploy from $BACKUP_DIR"
    rm -rf "$DEPLOY_DIR"
    mv "$BACKUP_DIR" "$DEPLOY_DIR"
    chown -R www-data:www-data "$DEPLOY_DIR"
    chmod -R 755 "$DEPLOY_DIR"
    systemctl reload "$NGINX_SERVICE" || true
  fi
  die "$message" 3
}

find_chromium() {
  command -v chromium 2>/dev/null ||
    command -v chromium-browser 2>/dev/null ||
    command -v google-chrome 2>/dev/null ||
    true
}

runtime_smoke_browser() {
  [[ "${DEV_DEPLOY_BROWSER_SMOKE:-1}" == "1" ]] || {
    log "  browser runtime smoke skipped (DEV_DEPLOY_BROWSER_SMOKE=0)"
    return 0
  }

  local chromium_bin
  chromium_bin="$(find_chromium)"
  if [[ -z "$chromium_bin" ]]; then
    warn "browser runtime smoke skipped: chromium not found"
    return 0
  fi

  local dom_file err_file
  dom_file="$(mktemp)"
  err_file="$(mktemp)"
  if ! timeout 45s "$chromium_bin" \
    --headless \
    --no-sandbox \
    --disable-gpu \
    --host-resolver-rules="MAP ${SMOKE_PUBLIC_HOST} ${SERVER_IP}" \
    --virtual-time-budget=10000 \
    --dump-dom "$SMOKE_ORIGIN/" >"$dom_file" 2>"$err_file"; then
    warn "browser runtime smoke failed to run"
    sed -n '1,80p' "$err_file" >&2 || true
    rm -f "$dom_file" "$err_file"
    return 1
  fi

  if grep -Eqi 'Please call .*createAppKit|Uncaught Error|Something went wrong|Application error' "$dom_file" "$err_file"; then
    warn "browser runtime smoke found fatal runtime text"
    grep -Ein 'Please call .*createAppKit|Uncaught Error|Something went wrong|Application error' "$dom_file" "$err_file" >&2 || true
    rm -f "$dom_file" "$err_file"
    return 1
  fi

  log "  browser runtime smoke OK"
  rm -f "$dom_file" "$err_file"
}

smoke_live_dev() {
  log "Phase 5: Dev smoke tests ..."

  local version_response html js_path js_code root_code api_code
  version_response="$(curl -sfS --resolve "$SMOKE_RESOLVE" "${SMOKE_ORIGIN}/version.txt" 2>/dev/null || true)"
  if ! printf '%s' "$version_response" | grep -q '^environment=dev'; then
    warn "/version.txt missing environment=dev: $version_response"
    return 1
  fi
  if ! printf '%s' "$version_response" | grep -q "$COMMIT_SHORT"; then
    warn "/version.txt does not match commit $COMMIT_SHORT: $version_response"
    return 1
  fi
  log "  /version.txt OK (environment=dev, $COMMIT_SHORT)"

  html="$(curl -fsSL --resolve "$SMOKE_RESOLVE" "${SMOKE_ORIGIN}/")" || {
    warn "failed to fetch /"
    return 1
  }
  js_path="$(printf '%s' "$html" | grep -oE '/assets/index-[^"]+\.js' | head -n 1 || true)"
  if [[ -z "$js_path" ]]; then
    warn "could not find index JS in dev HTML"
    return 1
  fi

  root_code="$(curl -sS -o /dev/null -w '%{http_code}' --resolve "$SMOKE_RESOLVE" "${SMOKE_ORIGIN}/" 2>/dev/null || echo "000")"
  js_code="$(curl -sS -o /dev/null -w '%{http_code}' --resolve "$SMOKE_RESOLVE" "${SMOKE_ORIGIN}${js_path}" 2>/dev/null || echo "000")"
  api_code="$(curl -sS -o /dev/null -w '%{http_code}' --resolve "$SMOKE_RESOLVE" "${SMOKE_ORIGIN}/api/health" 2>/dev/null || echo "000")"
  [[ "$root_code" == "200" ]] || { warn "/ returned HTTP $root_code"; return 1; }
  [[ "$js_code" == "200" ]] || { warn "$js_path returned HTTP $js_code"; return 1; }
  [[ "$api_code" == "200" ]] && log "  /api/health HTTP $api_code" || warn "/api/health HTTP $api_code (non-fatal)"

  runtime_smoke_browser
}

log "=== Swaperex DEV Frontend Deploy ==="

[[ -d "$FRONTEND_DIR" ]] || die "Frontend dir not found: $FRONTEND_DIR"
git -C "$REPO_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "REPO_DIR is not a git repository: $REPO_DIR"
command -v node >/dev/null || die "node not found"
command -v npm  >/dev/null || die "npm not found"
command -v nginx >/dev/null || die "nginx not found"

COMMIT_HASH="$(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")"
COMMIT_SHORT="$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")"
BRANCH="$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"

log "Commit:  $COMMIT_SHORT ($BRANCH)"
log "Repo:    $REPO_DIR"
log "Deploy:  $DEPLOY_DIR (dev only)"
log "Host:    $SMOKE_PUBLIC_HOST"
log "Log:     $LOG_FILE"
log "Dry run: $DRY_RUN"

if $DRY_RUN; then
  log "[dry-run] Would npm ci and build into a temp directory"
  log "[dry-run] Would stage install, backup current dev, replace $DEPLOY_DIR, then smoke test"
  write_result "dry_run" "no_changes"
  exit 0
fi

if [[ -n "$(git -C "$REPO_DIR" status --porcelain)" ]]; then
  git -C "$REPO_DIR" status --short || true
  die "Working tree is not clean; commit or stash before dev deploy."
fi

log "Phase 1: Installing dependencies..."
cd "$FRONTEND_DIR"
npm ci --production=false

BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/swaperex-dev-build.XXXXXX")"
log "Phase 1: Building frontend into temp dir: $BUILD_DIR"
npm run build -- --outDir "$BUILD_DIR" --emptyOutDir

[[ -d "$BUILD_DIR" ]] || die "build output missing: $BUILD_DIR"
[[ -f "$BUILD_DIR/index.html" ]] || die "staged index.html missing"
STAGED_JS_PATH="$(grep -oE '/assets/index-[^"]+\.js' "$BUILD_DIR/index.html" | head -n 1 || true)"
[[ -n "$STAGED_JS_PATH" ]] || die "staged index JS not found in index.html"
[[ -f "$BUILD_DIR/${STAGED_JS_PATH#/}" ]] || die "staged index JS missing: $STAGED_JS_PATH"

cat > "$BUILD_DIR/version.txt" <<VEOF
environment=dev
host=dev.dex.kobbex.com
commit=$COMMIT_HASH
short=$COMMIT_SHORT
branch=$BRANCH
deployed=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
log_file=$LOG_FILE
VEOF

find "$BUILD_DIR" -name '*.map' -delete 2>/dev/null || true

log "Phase 2: Preparing staged install ..."
DEPLOY_PARENT="$(dirname "$DEPLOY_DIR")"
mkdir -p "$DEPLOY_PARENT"
INSTALL_DIR="$(mktemp -d "$DEPLOY_PARENT/.swaperex-dev-stage.XXXXXX")"
cp -a "$BUILD_DIR/." "$INSTALL_DIR/"
chown -R www-data:www-data "$INSTALL_DIR"
chmod -R 755 "$INSTALL_DIR"

log "Phase 3: nginx -t before replacing live dev ..."
nginx -t 2>&1 || die "nginx config test failed" 2

if [[ -d "$DEPLOY_DIR" ]]; then
  log "Phase 4: Backing up current dev -> $BACKUP_DIR"
  [[ ! -e "$BACKUP_DIR" ]] || die "Backup path exists: $BACKUP_DIR"
  mv "$DEPLOY_DIR" "$BACKUP_DIR"
fi

log "Phase 4: Promoting staged install -> $DEPLOY_DIR"
mv "$INSTALL_DIR" "$DEPLOY_DIR"
INSTALL_DIR=""
systemctl reload "$NGINX_SERVICE" || restore_backup_and_die "nginx reload failed"

smoke_live_dev || restore_backup_and_die "dev smoke failed after deploy"

log "=== Dev deploy complete ==="
log "  Verify: bash scripts/audit/verify-dev-live.sh"
log "  Log:    $LOG_FILE"
log "  Result: $RESULT_FILE"
log "  Rollback: sudo rm -rf $DEPLOY_DIR && sudo mv $BACKUP_DIR $DEPLOY_DIR && sudo systemctl reload nginx"
write_result "success" "deployed"
