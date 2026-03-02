#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
REPO_DIST="$ROOT_DIR/frontend/dist"
DEPLOY_DIR="/var/www/swaperex"

die(){ echo "ERROR: $*" >&2; exit 1; }

command -v sha256sum >/dev/null 2>&1 || die "sha256sum not found"
command -v awk >/dev/null 2>&1 || die "awk not found"

[ -d "$REPO_DIST" ] || die "Missing build dir: $REPO_DIST (run frontend build first)"
[ -d "$DEPLOY_DIR" ] || die "Missing deploy dir: $DEPLOY_DIR"

LOCAL_INDEX="$REPO_DIST/index.html"
LIVE_INDEX="$DEPLOY_DIR/index.html"

[ -f "$LOCAL_INDEX" ] || die "Missing $LOCAL_INDEX"
[ -f "$LIVE_INDEX" ] || die "Missing $LIVE_INDEX"

extract_entry_js(){
  local f="$1"
  awk 'match($0, /\/assets\/index-[A-Za-z0-9._-]+\.m?js/){print substr($0, RSTART, RLENGTH); exit}' "$f" || true
}

LOCAL_ENTRY_REL="$(extract_entry_js "$LOCAL_INDEX")"
LIVE_ENTRY_REL="$(extract_entry_js "$LIVE_INDEX")"

[ -n "$LOCAL_ENTRY_REL" ] || die "Could not find /assets/index-*.js in $LOCAL_INDEX"
[ -n "$LIVE_ENTRY_REL" ] || die "Could not find /assets/index-*.js in $LIVE_INDEX"

echo "Local index entry: $LOCAL_ENTRY_REL"
echo "Live  index entry: $LIVE_ENTRY_REL"

if [ "$LOCAL_ENTRY_REL" != "$LIVE_ENTRY_REL" ]; then
  echo "--- LOCAL index.html (entry line context) ---"
  grep -n "assets/index-" "$LOCAL_INDEX" | head -n 5 || true
  echo "--- LIVE index.html (entry line context) ---"
  grep -n "assets/index-" "$LIVE_INDEX" | head -n 5 || true
  die "Entry bundle referenced by index.html differs (stale deploy or mismatched build)"
fi

LOCAL_ENTRY="$REPO_DIST${LOCAL_ENTRY_REL}"
LIVE_ENTRY="$DEPLOY_DIR${LIVE_ENTRY_REL}"

[ -f "$LOCAL_ENTRY" ] || die "Missing local entry asset: $LOCAL_ENTRY"
[ -f "$LIVE_ENTRY" ] || die "Missing live entry asset:  $LIVE_ENTRY"

LOCAL_INDEX_SHA="$(sha256sum "$LOCAL_INDEX" | awk '{print $1}')"
LIVE_INDEX_SHA="$(sha256sum "$LIVE_INDEX" | awk '{print $1}')"
if [ "$LOCAL_INDEX_SHA" != "$LIVE_INDEX_SHA" ]; then
  echo "Local index sha: $LOCAL_INDEX_SHA"
  echo "Live  index sha: $LIVE_INDEX_SHA"
  die "index.html differs between dist and deploy"
fi

LOCAL_ENTRY_SHA="$(sha256sum "$LOCAL_ENTRY" | awk '{print $1}')"
LIVE_ENTRY_SHA="$(sha256sum "$LIVE_ENTRY" | awk '{print $1}')"
if [ "$LOCAL_ENTRY_SHA" != "$LIVE_ENTRY_SHA" ]; then
  echo "Local entry sha: $LOCAL_ENTRY_SHA"
  echo "Live  entry sha: $LIVE_ENTRY_SHA"
  die "Entry bundle differs between dist and deploy"
fi

echo "OK: deploy-match passed"
echo "- index.html sha256: $LOCAL_INDEX_SHA"
echo "- entry bundle sha256: $LOCAL_ENTRY_SHA"
