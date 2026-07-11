#!/usr/bin/env bash
# P16 / P16.8 — Self-contained release certification (no deploy).
# Builds frontend, starts Vite preview, runs route + browser gates, cleans up.
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

DRY_RUN=0
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
REPORT_DIR="$REPO_ROOT/reports/p16/release-certification"
REPORT="$REPORT_DIR/certify-$STAMP.log"
PREVIEW_LOG="$REPORT_DIR/preview-$STAMP.log"
VERDICT="P16_RELEASE_CERTIFICATION_PASS"
WARN=0
FAIL=0

PREVIEW_HOST="${PREVIEW_HOST:-127.0.0.1}"
PREVIEW_PORT="${PREVIEW_PORT:-4173}"
PREVIEW_PID=""
BASE_URL="${SWAPEREX_QA_URL:-http://${PREVIEW_HOST}:${PREVIEW_PORT}}"
READINESS_MAX_SEC="${READINESS_MAX_SEC:-30}"

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$REPORT"; }

run() {
  log "+ $*"
  if [[ "$DRY_RUN" -eq 1 ]]; then return 0; fi
  if "$@"; then
    log "  OK"
    return 0
  else
    log "  FAIL ($?)"
    return 1
  fi
}

port_in_use() {
  ss -ltn 2>/dev/null | grep -q ":${PREVIEW_PORT} "
}

preview_alive() {
  [[ -n "$PREVIEW_PID" ]] && kill -0 "$PREVIEW_PID" 2>/dev/null
}

stop_preview() {
  if [[ -z "$PREVIEW_PID" ]]; then
    return 0
  fi
  log "Stopping preview server (PID ${PREVIEW_PID})..."
  if preview_alive; then
    kill -TERM -- "-${PREVIEW_PID}" 2>/dev/null || kill -TERM "${PREVIEW_PID}" 2>/dev/null || true
    local waited=0
    while preview_alive && [[ "$waited" -lt 10 ]]; do
      sleep 1
      waited=$((waited + 1))
    done
    if preview_alive; then
      kill -KILL -- "-${PREVIEW_PID}" 2>/dev/null || kill -KILL "${PREVIEW_PID}" 2>/dev/null || true
    fi
    wait "${PREVIEW_PID}" 2>/dev/null || true
  fi
  PREVIEW_PID=""
  log "Preview stopped."
}

cleanup() {
  stop_preview
}

trap cleanup EXIT INT TERM

wait_for_preview_ready() {
  local i
  for ((i = 1; i <= READINESS_MAX_SEC; i++)); do
    if ! preview_alive; then
      log "FAIL: Preview process exited before readiness (after ${i}s)."
      if [[ -f "$PREVIEW_LOG" ]]; then
        log "--- preview log (tail) ---"
        tail -n 40 "$PREVIEW_LOG" | tee -a "$REPORT"
      fi
      return 1
    fi
    if curl -fsS "http://${PREVIEW_HOST}:${PREVIEW_PORT}/" >/dev/null 2>&1; then
      log "Preview ready after ${i}s at http://${PREVIEW_HOST}:${PREVIEW_PORT}/"
      return 0
    fi
    sleep 1
  done
  log "FAIL: Readiness timed out after ${READINESS_MAX_SEC}s."
  if preview_alive; then
    log "Preview process still alive but HTTP unavailable."
  else
    log "Preview process is not running."
  fi
  if [[ -f "$PREVIEW_LOG" ]]; then
    log "--- preview log (tail) ---"
    tail -n 40 "$PREVIEW_LOG" | tee -a "$REPORT"
  fi
  return 1
}

start_preview() {
  if port_in_use; then
    log "FAIL: Port ${PREVIEW_PORT} is already in use."
    log "Refusing to start preview — kill unknown processes manually or set PREVIEW_PORT."
    ss -ltnp 2>/dev/null | grep ":${PREVIEW_PORT} " | tee -a "$REPORT" || true
    return 1
  fi

  : >"$PREVIEW_LOG"
  log "Starting preview server on http://${PREVIEW_HOST}:${PREVIEW_PORT} ..."
  setsid npm --prefix frontend run preview -- --host "$PREVIEW_HOST" --port "$PREVIEW_PORT" \
    >>"$PREVIEW_LOG" 2>&1 &
  PREVIEW_PID=$!
  log "Preview PID: ${PREVIEW_PID} (log: ${PREVIEW_LOG})"
  wait_for_preview_ready
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --port)
      PREVIEW_PORT="$2"
      BASE_URL="http://${PREVIEW_HOST}:${PREVIEW_PORT}"
      shift 2
      ;;
    *) echo "Unknown: $1" >&2; exit 2 ;;
  esac
done

mkdir -p "$REPORT_DIR"
log "P16 release certify dry_run=$DRY_RUN base_url=$BASE_URL port=$PREVIEW_PORT"

run git rev-parse HEAD || FAIL=1
run npm --prefix frontend run build || { FAIL=1; VERDICT="P16_RELEASE_CERTIFICATION_FAIL"; }
run npm --prefix frontend test -- --run appRoutes swapUrlState p16ComfortModels networkCapabilities || {
  FAIL=1
  VERDICT="P16_RELEASE_CERTIFICATION_FAIL"
}
run npm --prefix frontend test -- --run || { FAIL=1; VERDICT="P16_RELEASE_CERTIFICATION_FAIL"; }

if [[ "$FAIL" -eq 0 && "$DRY_RUN" -eq 0 ]]; then
  if ! start_preview; then
    FAIL=1
    VERDICT="P16_RELEASE_CERTIFICATION_FAIL"
  fi
fi

if [[ "$FAIL" -eq 0 ]]; then
  run node scripts/audit/p16-route-navigation-smoke.mjs --base-url "$BASE_URL" || {
    FAIL=1
    VERDICT="P16_RELEASE_CERTIFICATION_FAIL"
  }
  run node scripts/audit/p16-mobile-walletconnect-cert.mjs --base-url "$BASE_URL" --require-browser || {
    FAIL=1
    VERDICT="P16_RELEASE_CERTIFICATION_FAIL"
  }
  run bash scripts/release/p13-release-certify.sh --pre-deploy --dry-run || {
    WARN=1
    [[ "$VERDICT" == "P16_RELEASE_CERTIFICATION_PASS" ]] && VERDICT="P16_RELEASE_CERTIFICATION_PASS_WITH_WARNINGS"
  }
fi

log "Verdict: $VERDICT fail=$FAIL warn=$WARN"
echo "$VERDICT" > "$REPORT_DIR/verdict-$STAMP.txt"
[[ "$FAIL" -eq 0 ]] || exit 1
exit 0
