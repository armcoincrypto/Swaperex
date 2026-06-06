#!/usr/bin/env bash
# Fail if key production JS chunks exceed gzip budgets (guards bundle regressions).
# Usage (repo root): ./scripts/audit/verify-bundle-budgets.sh [dist_dir]
#
# Baselines captured 2026-06-05 on perf/swap-ui-lazy-boundaries after Tier 2 splits.
# Update *_MAX when intentionally changing bundle shape.

set -euo pipefail

DIST_DIR="${1:-frontend/dist}"
ASSETS_DIR="$DIST_DIR/assets"

die() { echo "ERROR: $*" >&2; exit 1; }
warn() { echo "WARN: $*" >&2; }

[ -d "$ASSETS_DIR" ] || die "Missing assets dir: $ASSETS_DIR (run: cd frontend && npm run build)"
[ -f "$DIST_DIR/index.html" ] || die "Missing $DIST_DIR/index.html (run frontend build first)"

gzip_bytes() {
  gzip -c "$1" | wc -c | tr -d ' '
}

find_one() {
  local pattern="$1"
  local matches
  matches="$(find "$ASSETS_DIR" -maxdepth 1 -name "$pattern" -type f 2>/dev/null | sort || true)"
  [ -n "$matches" ] || die "Missing asset matching $pattern under $ASSETS_DIR"
  local count
  count="$(printf '%s\n' "$matches" | wc -l | tr -d ' ')"
  [ "$count" -eq 1 ] || die "Expected one file for $pattern, found $count: $matches"
  printf '%s\n' "$matches"
}

entry_href="$(grep -oE '/assets/index-[^"]+\.js' "$DIST_DIR/index.html" 2>/dev/null | head -n 1 | sed 's|^/assets/||' || true)"
[ -n "$entry_href" ] || die "Could not resolve entry script from $DIST_DIR/index.html"
entry_file="$ASSETS_DIR/$entry_href"
[ -f "$entry_file" ] || die "Entry script missing: $entry_file"

# Gzip byte ceilings (+5% headroom over pre-Tier-2 cold path; entry should shrink post-split).
ENTRY_INDEX_MAX=150000
VENDOR_REACT_MAX=52000
VENDOR_ETHERS_MAX=155000
VENDOR_CRYPTO_SHARED_MAX=38000
VENDOR_REOWN_MAX=720000

echo "== Bundle gzip budgets: $ASSETS_DIR =="

failures=0

check_budget() {
  local label="$1"
  local file="$2"
  local max="$3"
  local bytes
  bytes="$(gzip_bytes "$file")"
  echo "$label  $(basename "$file")  gzip=${bytes}B  max=${max}B"
  if [ "$bytes" -gt "$max" ]; then
    echo "❌ OVER BUDGET: $label (+$((bytes - max))B)"
    failures=$((failures + 1))
  fi
}

check_budget "entry-index" "$entry_file" "$ENTRY_INDEX_MAX"
check_budget "vendor-react" "$(find_one 'vendor-react-*.js')" "$VENDOR_REACT_MAX"
check_budget "vendor-ethers" "$(find_one 'vendor-ethers-*.js')" "$VENDOR_ETHERS_MAX"
check_budget "vendor-crypto-shared" "$(find_one 'vendor-crypto-shared-*.js')" "$VENDOR_CRYPTO_SHARED_MAX"

reown_matches="$(find "$ASSETS_DIR" -maxdepth 1 -name 'vendor-reown-walletconnect-*.js' -type f 2>/dev/null | sort || true)"
if [ -n "$reown_matches" ]; then
  check_budget "vendor-reown-walletconnect" "$(printf '%s\n' "$reown_matches" | head -n 1)" "$VENDOR_REOWN_MAX"
else
  warn "vendor-reown-walletconnect chunk not present (skipped)"
fi

# Optional split chunks — informational only (no hard fail unless present and huge).
for optional in 'SwapPreviewModal-*.js' 'PopularCommissionRoutes-*.js'; do
  optional_file="$(find "$ASSETS_DIR" -maxdepth 1 -name "$optional" -type f 2>/dev/null | head -n 1 || true)"
  if [ -n "$optional_file" ]; then
    bytes="$(gzip_bytes "$optional_file")"
    echo "split  $(basename "$optional_file")  gzip=${bytes}B  (informational)"
  fi
done

if [ "$failures" -ne 0 ]; then
  die "$failures budget check(s) failed. Run: cd frontend && npm run analyze"
fi

echo "✅ Bundle gzip budgets OK"
