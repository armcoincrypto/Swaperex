#!/usr/bin/env bash
#
# Emergency restore: copy current production frontend files into the dev vhost.
# This does not modify production. It replaces only /var/www/swaperex-dev.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
PROD_DIR="${PROD_DIR:-/var/www/swaperex}"
DEV_DIR="${DEV_DIR:-/var/www/swaperex-dev}"
BACKUP_BASE="${BACKUP_BASE:-/var/www/swaperex-dev-backup}"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${BACKUP_DIR:-${BACKUP_BASE}-${RUN_ID}-before-prod-restore}"
LOG_DIR="${DEV_DEPLOY_LOG_DIR:-$REPO_DIR/scripts/logs}"
LOG_FILE="$LOG_DIR/dev-restore-from-prod.$RUN_ID.log"
NGINX_SERVICE="${NGINX_SERVICE:-nginx}"
STAGE_DIR=""

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

log() { echo "[dev-restore] $(date '+%Y-%m-%d %H:%M:%S') $1"; }
die() { echo "[dev-restore] $(date '+%Y-%m-%d %H:%M:%S') FATAL: $1" >&2; exit "${2:-1}"; }

cleanup() {
  [[ -n "${STAGE_DIR:-}" && -d "$STAGE_DIR" ]] && rm -rf "$STAGE_DIR"
}
trap cleanup EXIT

[[ -d "$PROD_DIR" ]] || die "Production frontend dir not found: $PROD_DIR"
[[ -f "$PROD_DIR/index.html" ]] || die "Production index.html missing: $PROD_DIR/index.html"
command -v nginx >/dev/null || die "nginx not found"

log "=== Restore dev frontend from production artifact ==="
log "Prod:   $PROD_DIR"
log "Dev:    $DEV_DIR"
log "Backup: $BACKUP_DIR"
log "Log:    $LOG_FILE"

STAGE_DIR="$(mktemp -d "$(dirname "$DEV_DIR")/.swaperex-dev-prod-restore.XXXXXX")"
cp -a "$PROD_DIR/." "$STAGE_DIR/"

PROD_VERSION="$(cat "$PROD_DIR/version.txt" 2>/dev/null || true)"
PROD_COMMIT="$(printf '%s\n' "$PROD_VERSION" | awk -F= '$1=="commit"{print $2; exit}')"
PROD_SHORT="$(printf '%s\n' "$PROD_VERSION" | awk -F= '$1=="short"{print $2; exit}')"
PROD_BRANCH="$(printf '%s\n' "$PROD_VERSION" | awk -F= '$1=="branch"{print $2; exit}')"

cat > "$STAGE_DIR/version.txt" <<VEOF
environment=dev
host=dev.dex.kobbex.com
restored_from=production
source_dir=$PROD_DIR
source_commit=${PROD_COMMIT:-unknown}
source_short=${PROD_SHORT:-unknown}
source_branch=${PROD_BRANCH:-unknown}
deployed=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
log_file=$LOG_FILE
VEOF

chown -R www-data:www-data "$STAGE_DIR"
chmod -R 755 "$STAGE_DIR"

nginx -t 2>&1 || die "nginx config test failed" 2

if [[ -d "$DEV_DIR" ]]; then
  [[ ! -e "$BACKUP_DIR" ]] || die "Backup path exists: $BACKUP_DIR"
  mv "$DEV_DIR" "$BACKUP_DIR"
fi

mv "$STAGE_DIR" "$DEV_DIR"
STAGE_DIR=""
systemctl reload "$NGINX_SERVICE" || die "nginx reload failed" 2

log "Dev restored from production artifact."
log "Rollback: sudo rm -rf $DEV_DIR && sudo mv $BACKUP_DIR $DEV_DIR && sudo systemctl reload nginx"
