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

# 1inch proxy (401 without ONEINCH_API_KEY is OK — proves route hits upstream, not 404)
STATUS_1INCH=$(curl -sS -o /dev/null -w "%{http_code}" "$BACKEND/oneinch/swap/v6.0/1/quote?src=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE&dst=0xdAC17F958D2ee523a2206206994597C13D831ec7&amount=100000000000000000" 2>/dev/null || echo "000")
printf "| %-18s | %-6s |\n" "/oneinch/.../quote" "$STATUS_1INCH"
[ "$STATUS_1INCH" = "404" ] && echo "  ⚠️  1inch proxy route missing" && FAILED=1

echo ""
if [ $FAILED -eq 1 ]; then
  echo "❌ Verification failed"
  exit 1
fi
echo "✅ All checks passed"
