#!/usr/bin/env bash
# safe-prod-deploy.sh — gated production deploy wrapper for dex.kobbex.com
#
# Usage (operator only, from repo root):
#   ./scripts/safe-prod-deploy.sh           # full deploy
#   ./scripts/safe-prod-deploy.sh --dry-run # preflight checks only, no deploy
#
# What this does:
#   1. Verifies branch main, synced with origin/main, safe worktree
#   2. Optionally stashes untracked docs/audits/ only (never hides code changes)
#   3. Preflight: npm build + RPC/sourcemap dist audits (prod-deploy rebuilds again)
#   4. Runs scripts/prod-deploy.sh (rsync, optional nginx, post checks)
#   5. Runs scripts/audit/post-deploy-certification.sh
#   6. Restores docs stash on success
#
# Why preflight build if prod-deploy also builds:
#   prod-deploy.sh is unchanged and always rebuilds. Preflight build fails fast
#   before touching /var/www/swaperex when dist audits would fail.
#
# Recovery: on failure nothing is deleted. If deploy stopped mid-way, inspect
#   scripts/logs/prod-deploy.*.log and /var/www/swaperex; re-run after fix.

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$ROOT_DIR"
FRONTEND_DIR="$REPO_DIR/frontend"
DIST_DIR="$FRONTEND_DIR/dist"
DEPLOY_DIR="/var/www/swaperex"
AUDIT_DOCS_DIR="docs/audits"
ALLOWED_UNTRACKED_PREFIXES=(
  "docs/audits/"
  "docs/certification/"
  "docs/operations/"
)
STASH_MSG="safe-prod-deploy: untracked docs"

DRY_RUN=0
DOCS_STASHED=0

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "== $*"; }
need() { command -v "$1" >/dev/null 2>&1 || die "Missing required tool: $1"; }

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

print_recovery() {
  cat >&2 <<'EOF'

== Recovery (nothing deleted by this wrapper) ==
1. Inspect latest log:  ls -lt scripts/logs/prod-deploy.*.log | head -1
2. Check live site:     bash scripts/audit/verify-live.sh
3. Check deploy dir:    ls -la /var/www/swaperex
4. If docs/audits were stashed:  git stash list | head -3
                         git stash pop   # only after you are done investigating
5. Fix the reported error, re-validate, then re-run:
                         ./scripts/safe-prod-deploy.sh --dry-run
                         ./scripts/safe-prod-deploy.sh

EOF
}

on_exit() {
  local code=$?
  if [ "$code" -ne 0 ]; then
    print_recovery
    if [ "$DOCS_STASHED" -eq 1 ]; then
      echo "NOTE: docs/audits stash was NOT auto-popped because deploy/validation failed." >&2
      echo "      Run: git stash list && git stash pop  (when safe)" >&2
    fi
  fi
}
trap on_exit EXIT

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage ;;
    *) die "Unknown argument: $arg (use --dry-run or --help)" ;;
  esac
done

need git
need npm
need bash

cd "$REPO_DIR"

# --- Git: branch and sync ---
CURRENT_BRANCH="$(git branch --show-current)"
if [ "$CURRENT_BRANCH" != "main" ]; then
  die "Must be on branch main (current: $CURRENT_BRANCH). Merge and checkout main first."
fi

info "Fetch origin/main"
git fetch --prune origin

BEHIND="$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)"
if [ "${BEHIND:-0}" -ne 0 ]; then
  die "main is behind origin/main by $BEHIND commit(s). Run: git pull --ff-only origin main"
fi

AHEAD="$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)"
if [ "${AHEAD:-0}" -ne 0 ]; then
  die "main is ahead of origin/main by $AHEAD commit(s). Push first: git push origin main"
fi

# --- Worktree: allow only untracked docs paths; stash those; fail on anything else ---
check_worktree_allowed() {
  local had_disallowed=0
  local line status path allowed

  while IFS= read -r line; do
    [ -z "$line" ] && continue
    status="${line:0:2}"
    path="${line:3}"

    if [ "$status" = "??" ]; then
      allowed=0
      for prefix in "${ALLOWED_UNTRACKED_PREFIXES[@]}"; do
        if [[ "$path" == "$prefix"* || "$path" == "${prefix%/}" ]]; then
          allowed=1
          break
        fi
      done
      if [ "$allowed" -eq 1 ]; then
        continue
      fi
    fi

    echo "Disallowed worktree change: $line" >&2
    had_disallowed=1
  done < <(git status --porcelain)

  if [ "$had_disallowed" -ne 0 ]; then
    die "Worktree has non-doc changes. Commit, revert, or stash them manually. Auto-stash only applies to: ${ALLOWED_UNTRACKED_PREFIXES[*]}"
  fi
}

stash_untracked_audit_docs() {
  local has_untracked=0
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    [[ "${line:0:2}" == "??" ]] || continue
    path="${line:3}"
    for prefix in "${ALLOWED_UNTRACKED_PREFIXES[@]}"; do
      if [[ "$path" == "$prefix"* || "$path" == "${prefix%/}" ]]; then
        has_untracked=1
        break
      fi
    done
  done < <(git status --porcelain)

  if [ "$has_untracked" -eq 0 ]; then
    info "No untracked docs to stash"
    return 0
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    info "[dry-run] Would stash untracked docs under: ${ALLOWED_UNTRACKED_PREFIXES[*]}"
    return 0
  fi

  info "Stash untracked docs only (${ALLOWED_UNTRACKED_PREFIXES[*]})"
  local stash_paths=()
  for prefix in "${ALLOWED_UNTRACKED_PREFIXES[@]}"; do
    stash_paths+=("$prefix")
  done
  git stash push -u -m "$STASH_MSG" -- "${stash_paths[@]}"
  DOCS_STASHED=1
}

restore_audit_docs_stash() {
  if [ "$DOCS_STASHED" -ne 1 ]; then
    return 0
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    return 0
  fi

  if git stash list | grep -q "$STASH_MSG"; then
    info "Restore ${AUDIT_DOCS_DIR}/ stash"
    git stash pop || die "git stash pop failed — resolve manually with: git stash list"
    DOCS_STASHED=0
  fi
}

check_worktree_allowed
stash_untracked_audit_docs

if [ -n "$(git status --porcelain)" ]; then
  die "Worktree still not clean after audit-docs stash"
fi

info "Git preflight OK (main, synced, clean)"

# --- Preflight build + dist audits (prod-deploy will build again) ---
if [ "$DRY_RUN" -eq 1 ]; then
  info "[dry-run] Would run: cd frontend && npm ci && npm run build"
  info "[dry-run] Would run dist audits on $DIST_DIR"
else
  info "Preflight build (prod-deploy will rebuild; this fails fast before rsync)"
  cd "$FRONTEND_DIR"
  npm ci
  NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}" npm run build
  cd "$REPO_DIR"
  [ -d "$DIST_DIR" ] || die "Preflight build missing $DIST_DIR"
fi

run_dist_audit() {
  local script="$1"
  if [ ! -x "$script" ]; then
    [ -f "$script" ] || die "Missing audit script: $script"
    chmod +x "$script"
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    info "[dry-run] Would run: $script"
    return 0
  fi
  bash "$script"
}

run_dist_audit "$REPO_DIR/scripts/audit/verify-no-rpc-secrets-in-dist.sh"
run_dist_audit "$REPO_DIR/scripts/audit/verify-no-sourcemaps-in-dist.sh"

info "Preflight dist audits OK"

if [ "$DRY_RUN" -eq 1 ]; then
  info "[dry-run] Would run: bash scripts/prod-deploy.sh"
  info "[dry-run] Would run: bash scripts/audit/post-deploy-certification.sh"
  info "Dry-run complete — no deploy performed"
  exit 0
fi

# --- Production deploy ---
info "Run scripts/prod-deploy.sh"
set +e
bash "$REPO_DIR/scripts/prod-deploy.sh"
prod_rc=$?
set -e

case "$prod_rc" in
  0)
    info "prod-deploy.sh: DEPLOY_SUCCESS"
    ;;
  2)
    info "prod-deploy.sh: DEPLOY_SUCCESS_WITH_WARNINGS (nginx — see prod-deploy log)"
    ;;
  *)
    die "prod-deploy.sh failed (exit $prod_rc) — see scripts/logs/prod-deploy.*.log"
    ;;
esac

info "Post-deploy: post-deploy-certification.sh"
if ! bash "$REPO_DIR/scripts/audit/post-deploy-certification.sh"; then
  die "post-deploy-certification.sh failed"
fi

MAP_LIVE="$(find "$DEPLOY_DIR" -name '*.map' 2>/dev/null | wc -l | tr -d ' ')"
info "Live .map file count under $DEPLOY_DIR: $MAP_LIVE"
if [ "${MAP_LIVE:-0}" -ne 0 ]; then
  die "Expected 0 .map files in $DEPLOY_DIR after deploy, found $MAP_LIVE"
fi

restore_audit_docs_stash

if [ "$prod_rc" -eq 2 ]; then
  info "Safe production deploy completed with warnings (nginx reload — assets live)"
else
  info "Safe production deploy completed successfully"
fi
echo "Log: see scripts/logs/prod-deploy.*.log (from prod-deploy.sh)"
