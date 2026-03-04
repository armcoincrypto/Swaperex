#!/bin/bash
# Verify local dev setup: backend :4001, frontend :3000, health + CoinGecko
# Usage: ./scripts/verify-local.sh

set -euo pipefail

BACKEND="${1:-http://localhost:4001}"
FRONTEND="${2:-http://localhost:3000}"
FAILED=0

echo "=== Verifying local dev ==="
echo "  Backend:  $BACKEND"
echo "  Frontend: $FRONTEND"
echo ""

echo "| Endpoint           | Status |"
echo "|--------------------|--------|"

STATUS_FE=$(curl -sS -o /dev/null -w "%{http_code}" "$FRONTEND/" 2>/dev/null || echo "000")
printf "| %-18s | %-6s |\n" "Frontend /" "$STATUS_FE"
[ "$STATUS_FE" != "200" ] && echo "  ⚠️  Frontend not reachable (is 'npm run dev' running?)" && FAILED=1

STATUS_HEALTH=$(curl -sS -o /dev/null -w "%{http_code}" "$BACKEND/api/v1/health" 2>/dev/null || echo "000")
printf "| %-18s | %-6s |\n" "/api/v1/health" "$STATUS_HEALTH"
[ "$STATUS_HEALTH" != "200" ] && echo "  ⚠️  Backend health failed" && FAILED=1

STATUS_CG=$(curl -sS -o /dev/null -w "%{http_code}" "$BACKEND/coingecko/markets?vs_currency=usd&ids=ethereum,tether" 2>/dev/null || echo "000")
printf "| %-18s | %-6s |\n" "/coingecko/markets" "$STATUS_CG"
[ "$STATUS_CG" != "200" ] && echo "  ⚠️  CoinGecko proxy failed" && FAILED=1

echo ""
if [ $FAILED -eq 1 ]; then
  echo "❌ Verification failed"
  exit 1
fi
echo "✅ All checks passed"
