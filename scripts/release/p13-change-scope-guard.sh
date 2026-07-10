#!/usr/bin/env bash
# P13.5 — Change scope guard (sensitive path detection).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BASE="${1:-eee0264}"
JSON_OUT="$REPO_ROOT/reports/p13/release-certification/p13-change-scope.json"
HIGH_RISK=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --json) JSON_OUT="$2"; shift 2 ;;
    *) shift ;;
  esac
done

SENSITIVE_PATTERNS=(
  'frontend/src/services/.*quote'
  'frontend/src/services/.*swap'
  'frontend/src/services/.*route'
  'frontend/src/services/.*commission'
  'frontend/src/contracts'
  'frontend/src/config/.*wrapper'
  'scripts/safe-prod-deploy'
  'frontend/src/hooks/useWallet'
  'frontend/src/components/wallet'
)

cd "$REPO_ROOT"
CHANGED=$(git diff --name-only "$BASE"...HEAD 2>/dev/null || git diff --name-only "$BASE" 2>/dev/null || true)
if [[ -z "$CHANGED" ]]; then
  CHANGED=$(git status --short | awk '{print $NF}' | grep -v '^$' || true)
fi

HITS=()
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  for pat in "${SENSITIVE_PATTERNS[@]}"; do
    if [[ "$f" =~ $pat ]]; then
      HITS+=("$f")
      HIGH_RISK=1
    fi
  done
done <<< "$CHANGED"

mkdir -p "$(dirname "$JSON_OUT")"
cat > "$JSON_OUT" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "base": "$BASE",
  "highRisk": $HIGH_RISK,
  "changedFiles": $(printf '%s\n' $CHANGED | jq -R -s -c 'split("\n")|map(select(length>0))' 2>/dev/null || echo '[]'),
  "sensitiveHits": $(printf '%s\n' "${HITS[@]}" | jq -R -s -c 'split("\n")|map(select(length>0))' 2>/dev/null || echo '[]')
}
EOF

if [[ "$HIGH_RISK" -eq 1 ]]; then
  echo "EXPLICIT_HIGH_RISK_REVIEW required"
  echo "Sensitive paths touched: ${HITS[*]}"
  exit 3
fi
echo "Change scope guard: PASS (no sensitive app paths in diff vs $BASE)"
exit 0
