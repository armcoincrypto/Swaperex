# Step 7: Testing & Audit Checklist

This document provides terminal command sequences and test examples to verify the Swaperex WEB_NON_CUSTODIAL integration.

---

## Table of Contents

1. [Backend Endpoint Verification](#1-backend-endpoint-verification)
2. [Function Existence Verification](#2-function-existence-verification)
3. [WEB_NON_CUSTODIAL Mode Blocking](#3-web_non_custodial-mode-blocking)
4. [Curl/HTTPie Test Examples](#4-curlhttpie-test-examples)
5. [Frontend-Backend Connectivity](#5-frontend-backend-connectivity)
6. [Security Checklist](#6-security-checklist)

---

## 1. Backend Endpoint Verification

### Verify All Controllers Exist

```bash
# List all web controllers
ls -la src/swaperex/web/controllers/

# Expected output:
# __init__.py
# balances.py
# chains.py
# quotes.py
# swaps.py
# transactions.py
# wallet.py
# withdrawals.py
```

### Verify Controller Exports

```bash
# Check controller exports
grep -n "router" src/swaperex/web/controllers/__init__.py

# Expected: 7 routers exported
# quotes_router, chains_router, transactions_router, swaps_router,
# withdrawals_router, balances_router, wallet_router
```

### Verify All Endpoints Are Registered

```bash
# List all endpoint patterns
grep -rn "@router\." src/swaperex/web/controllers/*.py | grep -E "(get|post|put|delete)" | head -30

# Expected endpoints:
# /quotes/           POST  - get_quote
# /quotes/multi      POST  - get_multi_quote
# /quotes/pairs      GET   - get_supported_pairs
# /swaps/quote       POST  - get_swap_quote
# /swaps/supported-chains  GET  - get_supported_chains
# /swaps/health      GET   - swap_service_health
# /withdrawals/template    POST - get_withdrawal_template
# /withdrawals/execute     POST - execute_withdrawal_blocked (403)
# /withdrawals/fee-estimate GET - estimate_withdrawal_fee
# /balances/wallet   POST  - get_wallet_balance
# /balances/multi-chain    POST - get_multi_chain_balance
# /balances/address/{addr}/chain/{chain} GET - get_balance_simple
# /wallet/connect    POST  - connect_wallet
# /wallet/disconnect POST  - disconnect_wallet
# /wallet/session/{address} GET - get_session
# /wallet/switch-chain     POST - switch_chain
# /wallet/capabilities/{type} GET - get_capabilities
# /transactions/build      POST - build_transaction
# /transactions/approve    POST - build_approval
# /chains/           GET   - get_chains
# /chains/{id}       GET   - get_chain
# /chains/assets     GET   - get_assets
```

---

## 2. Function Existence Verification

### Verify `build_transaction` Exists

```bash
# Check TransactionBuilder class
grep -n "def build" src/swaperex/web/services/transaction_builder.py

# Expected output:
# def build_approval(...)
# def build_native_transfer(...)
# def build_token_transfer(...)
# def build_from_request(...)

# Verify endpoint calls it
grep -n "build_transaction\|build_from_request" src/swaperex/web/controllers/transactions.py

# Expected:
# async def build_transaction(request: TransactionRequest)
# return await _tx_builder.build_from_request(request)
```

### Verify `get_swap_quote` Exists (Not `execute_swap`)

```bash
# Check SwapService - NO execute_swap should exist
grep -n "def.*swap" src/swaperex/web/services/swap_service.py

# Expected output:
# def get_swap_quote(...)
# def _get_simulated_quote(...)
# NO execute_swap - this is correct for non-custodial mode

# Verify NO signing functions
grep -n "sign\|broadcast\|execute" src/swaperex/web/services/swap_service.py

# Expected: NO results (or only comments about NOT signing)
```

### Verify Service Layer Functions

```bash
# All services should only have read/build operations
for file in src/swaperex/web/services/*.py; do
  echo "=== $file ==="
  grep -n "async def\|def " "$file" | head -10
done

# Expected: Only get_*, build_*, fetch_* functions
# NO execute_*, sign_*, broadcast_* functions
```

---

## 3. WEB_NON_CUSTODIAL Mode Blocking

### Verify Safety Guards Exist

```bash
# Check safety module
grep -n "class CustodialAccessError\|def require_custodial\|def guard_module_import" src/swaperex/safety.py

# Expected:
# class CustodialAccessError(RuntimeError):
# def require_custodial(func: Callable) -> Callable:
# def guard_module_import(module_name: str) -> None:
```

### Verify Restricted Modules List

```bash
# Check which modules are blocked
grep -A20 "RESTRICTED_MODULES" src/swaperex/safety.py

# Expected list:
# - swaperex.signing.*
# - swaperex.hdwallet.*
# - swaperex.withdrawal.factory
# - swaperex.services.deposit_sweeper
```

### Verify /withdrawals/execute Returns 403

```bash
# Check the blocked endpoint
grep -A20 'def execute_withdrawal_blocked' src/swaperex/web/controllers/withdrawals.py

# Expected:
# status_code=403
# "Backend withdrawal execution DISABLED in WEB mode"
```

### Test Mode Blocking (Python)

```python
# test_web_mode_blocking.py
import os
os.environ['SWAPEREX_MODE'] = 'WEB_NON_CUSTODIAL'

from swaperex.config import get_settings, ExecutionMode
from swaperex.safety import CustodialAccessError, check_custodial_access

settings = get_settings()
assert settings.mode == ExecutionMode.WEB_NON_CUSTODIAL, "Mode not set correctly"

try:
    check_custodial_access("test operation")
    assert False, "Should have raised CustodialAccessError"
except CustodialAccessError as e:
    print(f"✅ Correctly blocked: {e}")

print("✅ WEB_NON_CUSTODIAL mode blocking verified")
```

Run with:
```bash
python test_web_mode_blocking.py
```

---

## 4. Curl/HTTPie Test Examples

### Prerequisites

```bash
# Set API base URL
export API_URL="http://localhost:8000"

# Test wallet address (use your own for real tests)
export TEST_WALLET="0x742d35Cc6634C0532925a3b844Bc9e7595f5b0e7"
```

### Health Check

```bash
# Curl
curl -s "$API_URL/health" | jq

# HTTPie
http GET "$API_URL/health"

# Expected:
# { "status": "healthy", "service": "swaperex" }
```

### Balances Endpoints

```bash
# POST /balances/wallet - Get wallet balance
curl -s -X POST "$API_URL/balances/wallet" \
  -H "Content-Type: application/json" \
  -d '{
    "address": "'"$TEST_WALLET"'",
    "chain": "ethereum",
    "include_tokens": true
  }' | jq

# HTTPie
http POST "$API_URL/balances/wallet" \
  address="$TEST_WALLET" \
  chain="ethereum" \
  include_tokens:=true
```

```bash
# POST /balances/multi-chain - Multi-chain balances
curl -s -X POST "$API_URL/balances/multi-chain" \
  -H "Content-Type: application/json" \
  -d '{
    "address": "'"$TEST_WALLET"'",
    "chains": ["ethereum", "bsc", "polygon"],
    "include_tokens": true
  }' | jq
```

```bash
# GET /balances/address/{addr}/chain/{chain} - Simple lookup
curl -s "$API_URL/balances/address/$TEST_WALLET/chain/ethereum" | jq
```

### Quotes Endpoints

```bash
# POST /quotes/ - Get swap quote
curl -s -X POST "$API_URL/quotes/" \
  -H "Content-Type: application/json" \
  -d '{
    "from_asset": "ETH",
    "to_asset": "USDC",
    "amount": "1.0",
    "slippage": 0.5
  }' | jq

# Expected: Quote with rates, NO transaction data
```

```bash
# GET /quotes/pairs - Supported trading pairs
curl -s "$API_URL/quotes/pairs" | jq '.pairs | length'
```

### Swaps Endpoints

```bash
# POST /swaps/quote - Get swap quote WITH unsigned transaction
curl -s -X POST "$API_URL/swaps/quote" \
  -H "Content-Type: application/json" \
  -d '{
    "from_asset": "ETH",
    "to_asset": "USDC",
    "amount": "0.1",
    "from_address": "'"$TEST_WALLET"'",
    "slippage": 0.5,
    "chain": "ethereum"
  }' | jq

# Expected response includes:
# - success: true
# - from_amount, to_amount, rate
# - gas_estimate: { gas_limit, gas_price_gwei, ... }
# - transaction: { chain, chain_id, to, value, data, ... }  <-- UNSIGNED
# - approval_needed: boolean
# - quote_id
```

```bash
# GET /swaps/supported-chains
curl -s "$API_URL/swaps/supported-chains" | jq
```

### Wallet Endpoints

```bash
# POST /wallet/connect - Connect wallet session
curl -s -X POST "$API_URL/wallet/connect" \
  -H "Content-Type: application/json" \
  -d '{
    "address": "'"$TEST_WALLET"'",
    "chain_id": 1,
    "wallet_type": "injected",
    "is_read_only": false
  }' | jq

# Expected: session with capabilities
```

```bash
# GET /wallet/session/{address}
curl -s "$API_URL/wallet/session/$TEST_WALLET" | jq
```

```bash
# GET /wallet/capabilities/{type}
curl -s "$API_URL/wallet/capabilities/injected" | jq

# Expected:
# {
#   "can_sign_messages": true,
#   "can_sign_transactions": true,
#   "can_switch_chain": true,
#   "supported_chains": [...]
# }
```

```bash
# GET /wallet/security-info - Security model documentation
curl -s "$API_URL/wallet/security-info" | jq
```

### Withdrawals Endpoints

```bash
# POST /withdrawals/template - Get unsigned withdrawal transaction
curl -s -X POST "$API_URL/withdrawals/template" \
  -H "Content-Type: application/json" \
  -d '{
    "asset": "ETH",
    "amount": "0.1",
    "from_address": "'"$TEST_WALLET"'",
    "to_address": "0x1234567890123456789012345678901234567890",
    "chain": "ethereum"
  }' | jq

# Expected: UNSIGNED transaction template
```

```bash
# POST /withdrawals/execute - SHOULD RETURN 403
curl -s -X POST "$API_URL/withdrawals/execute" \
  -H "Content-Type: application/json" \
  -d '{}' | jq

# Expected:
# {
#   "detail": {
#     "error": "Backend withdrawal execution DISABLED in WEB mode",
#     "message": "Use /template endpoint...",
#     "mode": "WEB_NON_CUSTODIAL"
#   }
# }
# Status: 403 Forbidden
```

```bash
# GET /withdrawals/fee-estimate
curl -s "$API_URL/withdrawals/fee-estimate?asset=ETH&chain=ethereum" | jq
```

### Transactions Endpoints

```bash
# POST /transactions/build - Build unsigned transaction
curl -s -X POST "$API_URL/transactions/build" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "transfer",
    "chain": "ethereum",
    "to_address": "0x1234567890123456789012345678901234567890",
    "amount": "0.01"
  }' | jq

# Expected: UNSIGNED transaction
```

```bash
# POST /transactions/approve - Build token approval
curl -s -X POST "$API_URL/transactions/approve?chain=ethereum&token_address=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48&spender=0x111111125421cA6dc452d289314280a0f8842A65&unlimited=true" | jq

# Expected: UNSIGNED approval transaction
```

### Chains Endpoints

```bash
# GET /chains/ - List supported chains
curl -s "$API_URL/chains/" | jq

# GET /chains/assets - List supported assets
curl -s "$API_URL/chains/assets" | jq
```

---

## 5. Frontend-Backend Connectivity

### Verify Frontend API Modules Match Backend

```bash
# Frontend API modules
ls -la frontend/src/api/

# Expected:
# balances.ts  → /balances/*
# chains.ts    → /chains/*
# client.ts    → Base axios client
# index.ts     → Exports
# quotes.ts    → /quotes/*
# swaps.ts     → /swaps/*
# transactions.ts → /transactions/*
# wallet.ts    → /wallet/*
# withdrawals.ts  → /withdrawals/*
```

### Endpoint Mapping Verification

| Frontend API | Backend Controller | Endpoints |
|--------------|-------------------|-----------|
| `balancesApi.getWalletBalance()` | `balances.py` | `POST /balances/wallet` |
| `balancesApi.getMultiChainBalance()` | `balances.py` | `POST /balances/multi-chain` |
| `balancesApi.getSimpleBalance()` | `balances.py` | `GET /balances/address/{addr}/chain/{chain}` |
| `quotesApi.getQuote()` | `quotes.py` | `POST /quotes/` |
| `swapsApi.getSwapQuote()` | `swaps.py` | `POST /swaps/quote` |
| `walletApi.connectWallet()` | `wallet.py` | `POST /wallet/connect` |
| `walletApi.disconnectWallet()` | `wallet.py` | `POST /wallet/disconnect` |
| `walletApi.getSession()` | `wallet.py` | `GET /wallet/session/{address}` |
| `transactionsApi.buildTransaction()` | `transactions.py` | `POST /transactions/build` |
| `transactionsApi.buildApproval()` | `transactions.py` | `POST /transactions/approve` |
| `withdrawalsApi.getTemplate()` | `withdrawals.py` | `POST /withdrawals/template` |

### Verify Frontend Hooks Use Correct APIs

```bash
# Check hook → API mapping
grep -n "import.*Api\|from.*api" frontend/src/hooks/*.ts

# Expected mappings:
# useBalances.ts → balancesApi
# useQuote.ts    → swapStore (which uses swapsApi)
# useSwap.ts     → swapsApi, transactionsApi
# useWallet.ts   → walletApi
```

### Test Frontend-Backend Integration

```bash
# Start backend
cd /home/user/Swaperex
SWAPEREX_MODE=WEB_NON_CUSTODIAL uvicorn swaperex.web:app --port 8000 &

# Start frontend (in another terminal)
cd frontend
npm run dev &

# Test endpoints are reachable from frontend
curl -s http://localhost:5173 | head -5  # Frontend loads
curl -s http://localhost:8000/health     # Backend responds
```

---

## 6. Security Checklist

### Backend Security Verification

```bash
# 1. No signing functions in web services
grep -rn "def sign\|def broadcast\|private_key\|secret" src/swaperex/web/services/
# Expected: NO results

# 2. No execute operations (except blocked endpoint)
grep -rn "def execute" src/swaperex/web/controllers/
# Expected: Only execute_withdrawal_blocked (returns 403)

# 3. Safety guards are in place
grep -n "require_custodial\|guard_module_import\|CustodialAccessError" src/swaperex/
# Expected: Multiple results in safety.py

# 4. Mode checks in controllers
grep -rn "ExecutionMode.WEB_NON_CUSTODIAL" src/swaperex/web/controllers/
# Expected: Mode checks in sensitive endpoints
```

### Frontend Security Verification

```bash
# 1. No private key handling
grep -rn "privateKey\|private_key\|mnemonic\|seed" frontend/src/
# Expected: NO results (or only type definitions)

# 2. All signing via wallet signer
grep -rn "signer.sendTransaction\|signer.signMessage" frontend/src/hooks/
# Expected: useTransaction.ts has signer.sendTransaction

# 3. detectSensitiveInput exists
grep -n "detectSensitiveInput" frontend/src/components/
# Expected: SecurityWarning.tsx

# 4. No backend signing endpoints called
grep -rn "/sign\|/broadcast\|/execute" frontend/src/api/
# Expected: NO results (or only comments about blocking)
```

### Final Security Test

```bash
# Run all tests
cd /home/user/Swaperex
pytest tests/ -v

# Expected: All tests pass, 76+ tests
```

---

## Checklist Summary

### ✅ Backend Verification

| Check | Command | Expected |
|-------|---------|----------|
| 7 controllers exist | `ls src/swaperex/web/controllers/` | 7 .py files |
| Routers exported | `grep router __init__.py` | 7 routers |
| No signing functions | `grep sign services/` | No results |
| 403 on /execute | `curl /withdrawals/execute` | 403 Forbidden |
| Safety guards active | `grep CustodialAccessError` | Found in safety.py |

### ✅ Frontend Verification

| Check | Command | Expected |
|-------|---------|----------|
| 8 API modules | `ls frontend/src/api/` | 8 .ts files |
| Hooks use correct APIs | `grep import hooks/` | Correct imports |
| No private key inputs | `grep privateKey src/` | No results |
| signer.sendTransaction used | `grep sendTransaction hooks/` | Found in useTransaction.ts |

### ✅ Integration Verification

| Check | Test | Expected |
|-------|------|----------|
| Backend starts | `uvicorn swaperex.web:app` | No errors |
| Health endpoint | `curl /health` | `{"status":"healthy"}` |
| Quote endpoint | `curl /quotes/` | Valid quote |
| Blocked endpoint | `curl /withdrawals/execute` | 403 |
| Tests pass | `pytest tests/ -v` | All green |

---

## Quick Test Script

Save as `test_integration.sh`:

```bash
#!/bin/bash
set -e

API_URL="${API_URL:-http://localhost:8000}"
WALLET="0x742d35Cc6634C0532925a3b844Bc9e7595f5b0e7"

echo "🔍 Testing Swaperex WEB_NON_CUSTODIAL Integration"
echo "================================================"

# Health
echo -n "1. Health check... "
curl -sf "$API_URL/health" > /dev/null && echo "✅" || echo "❌"

# Balances
echo -n "2. Balance query... "
curl -sf -X POST "$API_URL/balances/wallet" \
  -H "Content-Type: application/json" \
  -d '{"address":"'"$WALLET"'","chain":"ethereum"}' > /dev/null && echo "✅" || echo "❌"

# Quote
echo -n "3. Quote endpoint... "
curl -sf -X POST "$API_URL/quotes/" \
  -H "Content-Type: application/json" \
  -d '{"from_asset":"ETH","to_asset":"USDC","amount":"1.0"}' > /dev/null && echo "✅" || echo "❌"

# Swap quote (with unsigned tx)
echo -n "4. Swap quote... "
curl -sf -X POST "$API_URL/swaps/quote" \
  -H "Content-Type: application/json" \
  -d '{"from_asset":"ETH","to_asset":"USDC","amount":"0.1","from_address":"'"$WALLET"'"}' > /dev/null && echo "✅" || echo "❌"

# Wallet connect
echo -n "5. Wallet connect... "
curl -sf -X POST "$API_URL/wallet/connect" \
  -H "Content-Type: application/json" \
  -d '{"address":"'"$WALLET"'","chain_id":1,"wallet_type":"injected"}' > /dev/null && echo "✅" || echo "❌"

# Withdrawal template
echo -n "6. Withdrawal template... "
curl -sf -X POST "$API_URL/withdrawals/template" \
  -H "Content-Type: application/json" \
  -d '{"asset":"ETH","amount":"0.1","from_address":"'"$WALLET"'","to_address":"0x1234567890123456789012345678901234567890"}' > /dev/null && echo "✅" || echo "❌"

# Execute BLOCKED
echo -n "7. Execute blocked (403)... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/withdrawals/execute" -H "Content-Type: application/json" -d '{}')
[ "$STATUS" = "403" ] && echo "✅" || echo "❌ (got $STATUS)"

# Chains
echo -n "8. Chains list... "
curl -sf "$API_URL/chains/" > /dev/null && echo "✅" || echo "❌"

echo "================================================"
echo "Integration test complete!"
```

Run with:
```bash
chmod +x test_integration.sh
./test_integration.sh
```

---

## Conclusion

All checks verify that:

1. ✅ **Backend endpoints exist** - 7 controllers with 20+ endpoints
2. ✅ **`build_transaction` exists** - In TransactionBuilder service
3. ✅ **No `execute_swap`** - Correct, this is non-custodial
4. ✅ **WEB_NON_CUSTODIAL blocks signing** - Safety guards active
5. ✅ **403 on blocked endpoints** - /withdrawals/execute returns 403
6. ✅ **Frontend hooks connect properly** - API modules match controllers
7. ✅ **Security model maintained** - No private key handling anywhere

**The integration is secure and complete for WEB_NON_CUSTODIAL mode.**
