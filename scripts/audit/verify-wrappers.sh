#!/usr/bin/env bash
# On-chain + env checks for Swaperex fee wrappers (BSC V2, ETH V2, ETH V1, optional ETH V3).
# Usage: from repo root — bash scripts/audit/verify-wrappers.sh
# Requires: cast (Foundry). No private keys; no secrets printed.
# RPC: ETHEREUM_RPC_URL or MAINNET_RPC_URL, else https://ethereum.publicnode.com
#       BSC_RPC_URL, else https://bsc-dataseed.binance.org
# Optional ETH V3: set VITE_UNISWAP_WRAPPER_V3_ADDRESS in the environment, or define the same key in frontend/.env.production.

set -uo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_PROD="$ROOT_DIR/frontend/.env.production"

TREASURY_EXPECTED="0x509cfd32ce279e08010c143f90cc1782a3520196"
BSC_V2="0x22B1FE0ba0E451707A675CC0AC19162A83E2c3a6"
ETH_V2="0x660B2E98E9eeAA4CaE21f319FbF3D6aD6909b491"
ETH_V1="0xe07f5940487a58E30F9fa711Be358FB036B0Fc44"
WETH_MAINNET="0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"

ETH_RPC="${ETHEREUM_RPC_URL:-${MAINNET_RPC_URL:-https://ethereum.publicnode.com}}"
BSC_RPC="${BSC_RPC_URL:-https://bsc-dataseed.binance.org}"

FAILED=0

ok() { echo "✅ $*"; }
fail() { echo "❌ $*"; FAILED=1; }
warn_skip() { echo "⚠️  $*"; }

lc_addr() {
  local x="${1:-}"
  echo "${x,,}"
}

require_cast() {
  command -v cast >/dev/null 2>&1 || {
    echo "❌ cast not found (install Foundry: https://book.getfoundry.sh)"
    exit 127
  }
}

check_code() {
  local label="$1" addr="$2" rpc="$3"
  local c
  if ! c="$(cast code "$addr" --rpc-url "$rpc" 2>/dev/null)"; then
    fail "$label: could not read code (RPC error?)"
    return 1
  fi
  if [[ -z "$c" || "$c" == "0x" ]]; then
    fail "$label: no contract code at $addr"
    return 1
  fi
  ok "$label: contract code present"
}

assert_addr_eq() {
  local label="$1" got="$2" want="$3"
  local g w
  got="$(echo -n "$got" | tr -d '[:space:]')"
  want="$(echo -n "$want" | tr -d '[:space:]')"
  g="$(lc_addr "$got")"
  w="$(lc_addr "$want")"
  if [[ "$g" != "$w" ]]; then
    fail "$label: expected $want got $got"
    return 1
  fi
  ok "$label: $got"
}

assert_uint_positive() {
  local label="$1" raw="$2"
  local dec
  if ! dec="$(cast to-dec "$raw" 2>/dev/null)"; then
    fail "$label: could not decode uint ($raw)"
    return 1
  fi
  if [[ "$dec" =~ ^[0-9]+$ ]] && (( dec > 0 )); then
    ok "$label: $dec"
  else
    fail "$label: expected > 0, got $dec"
    return 1
  fi
}

check_paused_false_if_present() {
  local label="$1" addr="$2" rpc="$3"
  local out norm last
  if ! out="$(cast call "$addr" "paused()(bool)" --rpc-url "$rpc" 2>/dev/null)"; then
    warn_skip "$label: paused() not available or call failed — skipped"
    return 0
  fi
  # Foundry may print human-readable `true`/`false` or a 32-byte hex word
  norm="$(echo -n "$out" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')"
  if [[ -z "$norm" ]]; then
    warn_skip "$label: paused() empty response — skipped"
    return 0
  fi
  if [[ "$norm" == "false" ]]; then
    ok "$label: paused() = false"
    return 0
  fi
  if [[ "$norm" == "true" ]]; then
    fail "$label: paused() = true (contract is paused)"
    return 0
  fi
  if [[ "$norm" =~ ^0x[0-9a-f]+$ ]]; then
    last="${norm: -1}"
    if [[ "$last" == "0" ]]; then
      ok "$label: paused() = false"
      return 0
    fi
    if [[ "$last" == "1" ]]; then
      fail "$label: paused() = true (contract is paused)"
      return 0
    fi
  fi
  warn_skip "$label: paused() unexpected return — skipped"
}

echo "== Swaperex wrapper verification (audit) =="
echo "Repo: $ROOT_DIR"
require_cast

echo ""
echo "== 1) frontend/.env.production — VITE_COMMISSION_REQUIRED =="
if [[ ! -f "$ENV_PROD" ]]; then
  fail "Missing $ENV_PROD"
else
  if grep -qE '^[[:space:]]*VITE_COMMISSION_REQUIRED=true[[:space:]]*$' "$ENV_PROD"; then
    ok "VITE_COMMISSION_REQUIRED=true present"
  else
    fail "VITE_COMMISSION_REQUIRED=true not found (exact line required)"
  fi
fi

echo ""
echo "== 2) BSC wrapper V2 ($BSC_V2) — rpc $BSC_RPC =="
check_code "BSC V2" "$BSC_V2" "$BSC_RPC" || true
tr="$(cast call "$BSC_V2" "treasury()(address)" --rpc-url "$BSC_RPC" 2>/dev/null)" || tr=""
if [[ -n "$tr" ]]; then
  assert_addr_eq "BSC V2 treasury()" "$tr" "$TREASURY_EXPECTED" || true
else
  fail "BSC V2: treasury() call failed"
fi

fb="$(cast call "$BSC_V2" "feeBps()(uint256)" --rpc-url "$BSC_RPC" 2>/dev/null)" || fb=""
if [[ -n "$fb" ]]; then
  assert_uint_positive "BSC V2 feeBps()" "$fb" || true
else
  fail "BSC V2: feeBps() call failed"
fi

check_paused_false_if_present "BSC V2" "$BSC_V2" "$BSC_RPC"

echo ""
echo "== 3) ETH wrapper V2 ($ETH_V2) — rpc $ETH_RPC =="
check_code "ETH V2" "$ETH_V2" "$ETH_RPC" || true
tr2="$(cast call "$ETH_V2" "treasury()(address)" --rpc-url "$ETH_RPC" 2>/dev/null)" || tr2=""
if [[ -n "$tr2" ]]; then
  assert_addr_eq "ETH V2 treasury()" "$tr2" "$TREASURY_EXPECTED" || true
else
  fail "ETH V2: treasury() call failed"
fi

fb2="$(cast call "$ETH_V2" "feeBps()(uint256)" --rpc-url "$ETH_RPC" 2>/dev/null)" || fb2=""
if [[ -n "$fb2" ]]; then
  assert_uint_positive "ETH V2 feeBps()" "$fb2" || true
else
  fail "ETH V2: feeBps() call failed"
fi

weth="$(cast call "$ETH_V2" "WETH()(address)" --rpc-url "$ETH_RPC" 2>/dev/null)" || weth=""
if [[ -n "$weth" ]]; then
  assert_addr_eq "ETH V2 WETH()" "$weth" "$WETH_MAINNET" || true
else
  fail "ETH V2: WETH() call failed"
fi

check_paused_false_if_present "ETH V2" "$ETH_V2" "$ETH_RPC"

echo ""
echo "== 3b) ETH wrapper V3 (optional) — rpc $ETH_RPC =="
ETH_V3="${VITE_UNISWAP_WRAPPER_V3_ADDRESS:-}"
if [[ -z "$ETH_V3" && -f "$ENV_PROD" ]]; then
  _line="$(grep -E '^[[:space:]]*VITE_UNISWAP_WRAPPER_V3_ADDRESS=' "$ENV_PROD" 2>/dev/null | tail -1 || true)"
  if [[ -n "$_line" ]]; then
    ETH_V3="${_line#*=}"
    ETH_V3="${ETH_V3//\"/}"
    ETH_V3="${ETH_V3//\'/}"
    ETH_V3="$(echo -n "$ETH_V3" | tr -d '[:space:]')"
  fi
fi
if [[ -z "$ETH_V3" ]]; then
  warn_skip "ETH V3: VITE_UNISWAP_WRAPPER_V3_ADDRESS unset — skipping V3 checks"
else
  check_code "ETH V3" "$ETH_V3" "$ETH_RPC" || true
  tr3="$(cast call "$ETH_V3" "treasury()(address)" --rpc-url "$ETH_RPC" 2>/dev/null)" || tr3=""
  if [[ -n "$tr3" ]]; then
    assert_addr_eq "ETH V3 treasury()" "$tr3" "$TREASURY_EXPECTED" || true
  else
    fail "ETH V3: treasury() call failed"
  fi

  fb3="$(cast call "$ETH_V3" "feeBps()(uint256)" --rpc-url "$ETH_RPC" 2>/dev/null)" || fb3=""
  if [[ -n "$fb3" ]]; then
    assert_uint_positive "ETH V3 feeBps()" "$fb3" || true
  else
    fail "ETH V3: feeBps() call failed"
  fi

  weth3="$(cast call "$ETH_V3" "WETH()(address)" --rpc-url "$ETH_RPC" 2>/dev/null)" || weth3=""
  if [[ -n "$weth3" ]]; then
    assert_addr_eq "ETH V3 WETH()" "$weth3" "$WETH_MAINNET" || true
  else
    fail "ETH V3: WETH() call failed"
  fi

  mh="$(cast call "$ETH_V3" "MAX_HOPS()(uint256)" --rpc-url "$ETH_RPC" 2>/dev/null)" || mh=""
  if [[ -n "$mh" ]]; then
    dec_mh=""
    if dec_mh="$(cast to-dec "$mh" 2>/dev/null)"; then
      :
    else
      dec_mh="$(echo -n "$mh" | tr -d '[:space:]')"
    fi
    if [[ "$dec_mh" == "2" ]]; then
      ok "ETH V3 MAX_HOPS() = 2"
    else
      fail "ETH V3 MAX_HOPS(): expected 2, got ${dec_mh:-$mh}"
    fi
  else
    fail "ETH V3: MAX_HOPS() call failed"
  fi

  check_paused_false_if_present "ETH V3" "$ETH_V3" "$ETH_RPC"
fi

echo ""
echo "== 4) ETH wrapper V1 ($ETH_V1) — rpc $ETH_RPC =="
check_code "ETH V1" "$ETH_V1" "$ETH_RPC" || true
rec="$(cast call "$ETH_V1" "FEE_RECIPIENT()(address)" --rpc-url "$ETH_RPC" 2>/dev/null)" || rec=""
if [[ -n "$rec" ]]; then
  assert_addr_eq "ETH V1 FEE_RECIPIENT()" "$rec" "$TREASURY_EXPECTED" || true
else
  fail "ETH V1: FEE_RECIPIENT() call failed"
fi

fbps="$(cast call "$ETH_V1" "FEE_BPS()(uint256)" --rpc-url "$ETH_RPC" 2>/dev/null)" || fbps=""
if [[ -n "$fbps" ]]; then
  assert_uint_positive "ETH V1 FEE_BPS()" "$fbps" || true
else
  fail "ETH V1: FEE_BPS() call failed"
fi

echo ""
if [[ $FAILED -eq 0 ]]; then
  echo "✅ verify-wrappers: ALL CHECKS PASSED"
  exit 0
else
  echo "❌ verify-wrappers: ONE OR MORE CHECKS FAILED"
  exit 1
fi
