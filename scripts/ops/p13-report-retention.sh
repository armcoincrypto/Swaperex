#!/usr/bin/env bash
# P13.1 — Report retention (dry-run default). Never deletes audit Markdown.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APPLY=0
RAW_DAYS=30
SUMMARY_DAYS=180

usage() {
  echo "Usage: $0 [--dry-run|--apply] [--raw-days N] [--summary-days N]"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --dry-run) APPLY=0; shift ;;
    --raw-days) RAW_DAYS="$2"; shift 2 ;;
    --summary-days) SUMMARY_DAYS="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1"; usage; exit 2 ;;
  esac
done

delete_older_than() {
  local dir="$1" days="$2" label="$3"
  [[ -d "$dir" ]] || return 0
  echo "== $label: $dir (older than ${days}d) =="
  find "$dir" -type f -name '*.json' -mtime +"$days" -print | while read -r f; do
    if [[ "$APPLY" -eq 1 ]]; then rm -f "$f"; echo "DELETED $f"; else echo "WOULD_DELETE $f"; fi
  done
}

echo "P13 report retention (apply=$APPLY)"
delete_older_than "$REPO_ROOT/reports/p13/route-smoke" "$RAW_DAYS" "route-smoke raw"
delete_older_than "$REPO_ROOT/docs/audits/raw/p12_5_route_quote" "$RAW_DAYS" "p12 raw evidence"
delete_older_than "$REPO_ROOT/reports/p13/quote-trends" "$SUMMARY_DAYS" "quote trend summaries"
delete_older_than "$REPO_ROOT/reports/p13/runtime-warnings" "$SUMMARY_DAYS" "runtime warning trends"
delete_older_than "$REPO_ROOT/reports/p13/status" "$SUMMARY_DAYS" "status snapshots"
echo "Done."
