#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
#  Swaperex Signals Backend - Smoke Test
#
#  Verifies the signals backend is reachable and returns correct
#  response shapes. Run this after deployment or when debugging.
#
#  Usage:
#    ./scripts/smoke_signals.sh                  # uses default URL
#    SIGNALS_URL=http://localhost:4001 ./scripts/smoke_signals.sh
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

BASE="${SIGNALS_URL:-http://207.180.212.142:4001}"
PASS=0
FAIL=0
WARN=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

pass() { ((PASS++)); echo -e "  ${GREEN}PASS${NC} $1"; }
fail() { ((FAIL++)); echo -e "  ${RED}FAIL${NC} $1"; }
warn() { ((WARN++)); echo -e "  ${YELLOW}WARN${NC} $1"; }

echo "============================================"
echo " Swaperex Signals Smoke Test"
echo " Target: $BASE"
echo "============================================"
echo ""

# ── 1. Basic health ──────────────────────────────────────────────
echo "1. Basic Health (/health)"
HEALTH=$(curl -sf -w "\n%{http_code}" "${BASE}/health" 2>/dev/null) || true
HTTP_CODE=$(echo "$HEALTH" | tail -n1)
BODY=$(echo "$HEALTH" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  pass "HTTP 200"
else
  fail "HTTP $HTTP_CODE (expected 200)"
fi

if echo "$BODY" | grep -q '"status":"ok"'; then
  pass "status: ok"
else
  fail "Missing status:ok in response"
fi

if echo "$BODY" | grep -q '"signalsEnabled"'; then
  ENABLED=$(echo "$BODY" | grep -o '"signalsEnabled":[a-z]*' | cut -d: -f2)
  if [ "$ENABLED" = "true" ]; then
    pass "signalsEnabled: true"
  else
    warn "signalsEnabled: false (kill switch is on)"
  fi
else
  fail "Missing signalsEnabled field"
fi

echo ""

# ── 2. Rich health (/api/v1/health) ─────────────────────────────
echo "2. Rich Health (/api/v1/health)"
RICH=$(curl -sf -w "\n%{http_code}" "${BASE}/api/v1/health" 2>/dev/null) || true
HTTP_CODE=$(echo "$RICH" | tail -n1)
BODY=$(echo "$RICH" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  pass "HTTP 200"
else
  fail "HTTP $HTTP_CODE (expected 200)"
fi

if echo "$BODY" | grep -q '"services"'; then
  pass "Has services block"

  # Check DexScreener
  if echo "$BODY" | grep -q '"dexscreener":"up"'; then
    pass "DexScreener: up"
  else
    warn "DexScreener: down (may affect liquidity signals)"
  fi

  # Check GoPlus
  if echo "$BODY" | grep -q '"goplus":"up"'; then
    pass "GoPlus: up"
  else
    warn "GoPlus: down (may affect risk signals)"
  fi
else
  fail "Missing services block"
fi

echo ""

# ── 3. Signals endpoint (/api/v1/signals) ────────────────────────
# Use USDT on Ethereum as test token (well-known, safe)
TEST_TOKEN="0xdac17f958d2ee523a2206206994597c13d831ec7"
TEST_CHAIN=1

echo "3. Signals Endpoint (/api/v1/signals)"
echo "   Token: USDT ($TEST_TOKEN)"
echo "   Chain: Ethereum ($TEST_CHAIN)"

SIG=$(curl -sf -w "\n%{http_code}" "${BASE}/api/v1/signals?chainId=${TEST_CHAIN}&token=${TEST_TOKEN}&debug=1" 2>/dev/null) || true
HTTP_CODE=$(echo "$SIG" | tail -n1)
BODY=$(echo "$SIG" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  pass "HTTP 200"
else
  fail "HTTP $HTTP_CODE (expected 200)"
fi

if echo "$BODY" | grep -q '"timestamp"'; then
  pass "Has timestamp field"
else
  fail "Missing timestamp field"
fi

if echo "$BODY" | grep -q '"debug"'; then
  pass "Debug data included (debug=1)"
else
  warn "No debug data (may be disabled)"
fi

# Check response has providers block (new schema) or at least timestamp
if echo "$BODY" | grep -q '"providers"'; then
  pass "Has providers status block (v2 schema)"
else
  # v1 schema is fine too
  if echo "$BODY" | grep -q '"overallSeverity"'; then
    pass "Has overallSeverity (v2 schema)"
  else
    warn "No providers/overallSeverity - v1 schema (pre-upgrade)"
  fi
fi

# USDT should be safe - no signals expected
if echo "$BODY" | grep -q '"risk":{'; then
  warn "USDT has risk signals (unexpected for stablecoin)"
else
  pass "No risk signals for USDT (expected)"
fi

echo ""

# ── 4. Bad request handling ──────────────────────────────────────
echo "4. Error Handling"

# Missing params
ERR=$(curl -sf -w "\n%{http_code}" "${BASE}/api/v1/signals" 2>/dev/null) || true
HTTP_CODE=$(echo "$ERR" | tail -n1)
if [ "$HTTP_CODE" = "400" ]; then
  pass "400 on missing params"
else
  fail "Expected 400, got $HTTP_CODE"
fi

# Invalid token format (not 0x)
ERR2=$(curl -sf -w "\n%{http_code}" "${BASE}/api/v1/signals?chainId=1&token=invalid" 2>/dev/null) || true
HTTP_CODE2=$(echo "$ERR2" | tail -n1)
if [ "$HTTP_CODE2" = "200" ] || [ "$HTTP_CODE2" = "400" ]; then
  pass "Handles invalid token ($HTTP_CODE2)"
else
  warn "Unexpected response for invalid token: $HTTP_CODE2"
fi

echo ""

# ── 5. CORS check ────────────────────────────────────────────────
echo "5. CORS Headers"
CORS=$(curl -sf -I -H "Origin: http://localhost:3000" "${BASE}/health" 2>/dev/null) || true
if echo "$CORS" | grep -qi "access-control-allow-origin"; then
  pass "CORS headers present"
else
  warn "No CORS headers (may block frontend)"
fi

echo ""

# ── Summary ──────────────────────────────────────────────────────
echo "============================================"
echo " Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}, ${YELLOW}${WARN} warnings${NC}"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
