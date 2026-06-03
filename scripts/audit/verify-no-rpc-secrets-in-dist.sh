#!/usr/bin/env bash
# Fail if frontend dist contains known private RPC provider patterns.
# Usage: from repo root: ./scripts/audit/verify-no-rpc-secrets-in-dist.sh [dist_dir]

set -euo pipefail

DIST_DIR="${1:-frontend/dist}"

die() { echo "ERROR: $*" >&2; exit 1; }

[ -d "$DIST_DIR" ] || die "Missing dist dir: $DIST_DIR (run frontend build first)"

# Patterns that must not appear in shipped JS/CSS/HTML (no secret values printed).
PATTERNS=(
  'dwellir\.com/'
  'api-ethereum-mainnet\.n\.dwellir'
  'api-bsc-mainnet'
)

HITS=0
for pat in "${PATTERNS[@]}"; do
  if grep -RIn --include='*.js' --include='*.css' --include='*.html' -E "$pat" "$DIST_DIR" >/dev/null 2>&1; then
    echo "FAIL: dist matches forbidden RPC secret pattern: $pat"
    HITS=$((HITS + 1))
  fi
done

if [ "$HITS" -ne 0 ]; then
  die "RPC secret scan failed ($HITS pattern(s) matched). Rotate exposed keys and rebuild."
fi

echo "OK: no forbidden RPC provider patterns in $DIST_DIR"
