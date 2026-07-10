#!/usr/bin/env bash
# P13.5 — Release certification runner (no deploy, no secrets).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

DRY_RUN=0
MODE=""
BASE_URL="https://dex.kobbex.com"
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
REPORT_DIR="$REPO_ROOT/reports/p13/release-certification"
REPORT="$REPORT_DIR/certify-$STAMP.log"
VERDICT="RELEASE_CERTIFICATION_PASS"
WARN=0

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$REPORT"; }
run() {
  log "+ $*"
  if [[ "$DRY_RUN" -eq 1 ]]; then return 0; fi
  if "$@"; then log "  OK"; return 0; else log "  FAIL ($?)"; return 1; fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --pre-deploy) MODE=pre; shift ;;
    --post-deploy) MODE=post; shift ;;
    --base-url) BASE_URL="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 2 ;;
  esac
done

[[ -n "$MODE" ]] || { echo "Specify --pre-deploy or --post-deploy or --dry-run"; exit 2; }
mkdir -p "$REPORT_DIR"
log "P13 release certify mode=$MODE dry_run=$DRY_RUN"

FAIL=0
run git status --short || FAIL=1
run git branch --show-current || FAIL=1
run git rev-parse HEAD || FAIL=1

if [[ "$MODE" == "pre" ]]; then
  run npm --prefix frontend run build || { FAIL=1; VERDICT="RELEASE_CERTIFICATION_FAIL"; }
  run bash scripts/audit/verify-wrappers.sh || { FAIL=1; VERDICT="RELEASE_CERTIFICATION_FAIL"; }
  run node scripts/audit/audit-commission-pairs.mjs || { FAIL=1; VERDICT="RELEASE_CERTIFICATION_FAIL"; }
  run node --check scripts/ops/p13-quote-trend-report.mjs || { FAIL=1; VERDICT="RELEASE_CERTIFICATION_FAIL"; }
  run node --check scripts/ops/p13-production-status.mjs || { FAIL=1; VERDICT="RELEASE_CERTIFICATION_FAIL"; }
  run .venv/bin/pytest -q || { FAIL=1; VERDICT="RELEASE_CERTIFICATION_FAIL"; }
  run npm --prefix frontend test -- --run sanitizeAppKitPersistedState || { FAIL=1; VERDICT="RELEASE_CERTIFICATION_FAIL"; }
  run node scripts/audit/p12-2-reown-dependency-monitor.mjs --check || { WARN=1; VERDICT="RELEASE_CERTIFICATION_PASS_WITH_WARNINGS"; }
  run bash scripts/release/p13-change-scope-guard.sh --base eee0264 --json "$REPORT_DIR/change-scope-$STAMP.json" || {
    VERDICT="RELEASE_CERTIFICATION_REQUIRES_HIGH_RISK_REVIEW"
    WARN=1
  }
fi

if [[ "$MODE" == "post" ]]; then
  run curl -fsS "$BASE_URL/version.txt" || { FAIL=1; VERDICT="RELEASE_CERTIFICATION_FAIL"; }
  run node scripts/ops/p13-run-route-quote-smoke.mjs || { FAIL=1; VERDICT="RELEASE_CERTIFICATION_FAIL"; }
  run node scripts/audit/p12-4-runtime-warning-monitor.mjs --base-url "$BASE_URL" || { WARN=1; VERDICT="RELEASE_CERTIFICATION_PASS_WITH_WARNINGS"; }
fi

log "Verdict: $VERDICT fail=$FAIL warn=$WARN"
echo "$VERDICT" > "$REPORT_DIR/verdict-$STAMP.txt"
[[ "$FAIL" -eq 0 ]] || exit 1
exit 0
