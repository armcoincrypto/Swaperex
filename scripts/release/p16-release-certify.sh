#!/usr/bin/env bash
# P16 — Release certification runner (no deploy).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

DRY_RUN=0
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
REPORT_DIR="$REPO_ROOT/reports/p16/release-certification"
REPORT="$REPORT_DIR/certify-$STAMP.log"
VERDICT="P16_RELEASE_CERTIFICATION_PASS"
WARN=0
BASE_URL="${SWAPEREX_QA_URL:-http://127.0.0.1:4173}"

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$REPORT"; }
run() {
  log "+ $*"
  if [[ "$DRY_RUN" -eq 1 ]]; then return 0; fi
  if "$@"; then log "  OK"; return 0; else log "  FAIL ($?)"; return 1; fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --base-url) BASE_URL="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 2 ;;
  esac
done

mkdir -p "$REPORT_DIR"
log "P16 release certify dry_run=$DRY_RUN base_url=$BASE_URL"

FAIL=0
run git rev-parse HEAD || FAIL=1
run npm --prefix frontend run build || { FAIL=1; VERDICT="P16_RELEASE_CERTIFICATION_FAIL"; }
run npm --prefix frontend test -- --run appRoutes swapUrlState p16ComfortModels networkCapabilities || {
  FAIL=1
  VERDICT="P16_RELEASE_CERTIFICATION_FAIL"
}
run npm --prefix frontend test -- --run || { FAIL=1; VERDICT="P16_RELEASE_CERTIFICATION_FAIL"; }
run node scripts/audit/p16-route-navigation-smoke.mjs --base-url "$BASE_URL" || {
  FAIL=1
  VERDICT="P16_RELEASE_CERTIFICATION_FAIL"
}
run node scripts/audit/p16-mobile-walletconnect-cert.mjs --base-url "$BASE_URL" --skip-browser || {
  WARN=1
  VERDICT="P16_RELEASE_CERTIFICATION_PASS_WITH_WARNINGS"
}
run bash scripts/release/p13-release-certify.sh --pre-deploy --dry-run || {
  WARN=1
}

log "Verdict: $VERDICT fail=$FAIL warn=$WARN"
echo "$VERDICT" > "$REPORT_DIR/verdict-$STAMP.txt"
[[ "$FAIL" -eq 0 ]] || exit 1
exit 0
