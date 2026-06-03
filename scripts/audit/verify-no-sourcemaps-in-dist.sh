#!/usr/bin/env bash
# Fail if frontend dist ships source maps or sourceMappingURL references.
# Usage: from repo root: ./scripts/audit/verify-no-sourcemaps-in-dist.sh [dist_dir]

set -euo pipefail

DIST_DIR="${1:-frontend/dist}"

die() { echo "ERROR: $*" >&2; exit 1; }

[ -d "$DIST_DIR" ] || die "Missing dist dir: $DIST_DIR (run frontend build first)"

MAP_COUNT="$(find "$DIST_DIR" -name '*.map' 2>/dev/null | wc -l | tr -d ' ')"
if [ "${MAP_COUNT:-0}" -ne 0 ]; then
  die "Found $MAP_COUNT .map file(s) in $DIST_DIR (production build must emit zero maps)."
fi

if grep -RIn --include='*.js' --include='*.css' 'sourceMappingURL=' "$DIST_DIR" >/dev/null 2>&1; then
  die "Found sourceMappingURL reference(s) in $DIST_DIR assets."
fi

echo "OK: no source maps or sourceMappingURL in $DIST_DIR"
