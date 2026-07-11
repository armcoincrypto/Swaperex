#!/usr/bin/env bash
# One-shot post-deploy certification for dex.kobbex.com
# Usage (repo root): bash scripts/audit/post-deploy-certification.sh
#
# Exit codes:
#   0 — POST_DEPLOY_CERTIFICATION_PASS or POST_DEPLOY_CERTIFICATION_PASS_WITH_WARNINGS
#   1 — POST_DEPLOY_CERTIFICATION_FAIL (real blocker)

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

VERDICT="POST_DEPLOY_CERTIFICATION_PASS"
WARNINGS=()
FAILURES=()

section() {
  echo
  echo "========================================"
  echo "$1"
  echo "========================================"
}

run_check() {
  local label="$1"
  shift
  echo
  echo "-- $label --"
  if "$@"; then
    echo "✅ $label"
    return 0
  fi
  echo "❌ $label"
  FAILURES+=("$label")
  return 1
}

run_check_warn() {
  local label="$1"
  shift
  echo
  echo "-- $label (warning-only) --"
  if "$@"; then
    echo "✅ $label"
    return 0
  fi
  echo "⚠️  $label"
  WARNINGS+=("$label")
  return 0
}

section "SWAPEREX Post-Deploy Certification"

echo "Repo:       $ROOT_DIR"
echo "Commit:     $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "Branch:     $(git branch --show-current 2>/dev/null || echo unknown)"
echo "Timestamp:  $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

set +e

section "1. Deploy parity (local dist vs /var/www/swaperex)"
run_check "deploy-match.sh" bash scripts/audit/deploy-match.sh

section "2. Live HTTP + health endpoints"
run_check "verify-live.sh" bash scripts/audit/verify-live.sh

section "3. RPC secret scan (dist)"
run_check "verify-no-rpc-secrets-in-dist.sh" bash scripts/audit/verify-no-rpc-secrets-in-dist.sh

section "4. Source map scan (dist)"
run_check "verify-no-sourcemaps-in-dist.sh" bash scripts/audit/verify-no-sourcemaps-in-dist.sh

section "5. Live version.txt"
LIVE_VERSION="$(curl -fsSL https://dex.kobbex.com/version.txt 2>/dev/null || true)"
if [ -n "$LIVE_VERSION" ]; then
  echo "$LIVE_VERSION"
  if node "$ROOT_DIR/scripts/audit/version-metadata.mjs" validate \
    --text "$LIVE_VERSION" \
    --require-environment production; then
    echo "✅ version.txt schema valid"
  else
    echo "❌ version.txt schema validation failed"
    FAILURES+=("version.txt schema")
  fi
else
  echo "❌ Could not fetch live version.txt"
  FAILURES+=("version.txt fetch")
fi

section "6. dex.kobbex.com nginx note (informational — Swaperex does not manage shared nginx)"
if command -v nginx >/dev/null 2>&1; then
  NGINX_CONF="$(nginx -V 2>&1 | sed -n 's/.*--conf-path=\([^ ]*\).*/\1/p' | head -n 1)"
  echo "nginx --conf-path: ${NGINX_CONF:-unknown} (read-only note; no reload performed)"
  if [ -n "${NGINX_CONF:-}" ] && [ -f "$NGINX_CONF" ]; then
    echo "INFO: conf file exists (Swaperex deploy does not modify or reload nginx)"
  else
    echo "WARN: conf file missing at reported path — Swaperex static deploy unaffected if verify-live passes"
    WARNINGS+=("shared nginx conf note only — out of Swaperex deploy scope")
  fi
else
  echo "INFO: nginx not in PATH (irrelevant for static rsync deploy)"
fi

set -e

section "Summary"

if [ "${#FAILURES[@]}" -gt 0 ]; then
  VERDICT="POST_DEPLOY_CERTIFICATION_FAIL"
  echo "Verdict: $VERDICT"
  echo "Failures:"
  for f in "${FAILURES[@]}"; do echo "  - $f"; done
  exit 1
fi

if [ "${#WARNINGS[@]}" -gt 0 ]; then
  VERDICT="POST_DEPLOY_CERTIFICATION_PASS_WITH_WARNINGS"
  echo "Verdict: $VERDICT"
  echo "Warnings:"
  for w in "${WARNINGS[@]}"; do echo "  - $w"; done
  exit 0
fi

echo "Verdict: $VERDICT"
exit 0
