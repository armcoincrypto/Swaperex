# P1 Audit Fixes Summary

## What Changed

### 1) Wallet balances hardcoded to 3 chains — FIXED
- **FILE:** `frontend/src/utils/constants.ts` — Added `BALANCE_CHAIN_KEYS` derived from `CHAINS`
- **FILE:** `frontend/src/hooks/useWallet.ts` — Replaced 3× `['ethereum','bsc','polygon']` with `BALANCE_CHAIN_KEYS` (lines ~86, ~136, ~172)
- **FILE:** `frontend/src/stores/balanceStore.ts` — Added RPC, native tokens, and ERC20 lists for arbitrum, optimism, avalanche
- Balances now load for all 6 supported chains. Connection remains non-blocking: balance failures do not break wallet connection.

### 2) Network selector only showed 3 networks — FIXED
- **FILE:** `frontend/src/components/common/NetworkSelector.tsx` — Built `SUPPORTED_NETWORKS` from `CHAINS` (single source of truth)
- All 6 networks (Ethereum, BSC, Polygon, Arbitrum, Optimism, Avalanche) now appear and can be switched

### 3) 1inch quote fetch missing timeout/retry — FIXED
- **FILE:** `frontend/src/services/oneInchQuote.ts` — Added `fetchWithTimeout` (10s) and retry with exponential backoff (500ms, 1200ms, 2500ms)
- 4xx errors (400, 429) do not retry; 5xx and timeouts retry up to 3 times
- Error messages preserved for 400/429/500

### 4) Signals API URL/port alignment — FIXED
- **FILE:** `frontend/src/utils/constants.ts` — Added `SIGNALS_API_URL = import.meta.env.VITE_SIGNALS_API_URL || 'http://localhost:4001'` (no hardcoded IP)
- **FILE:** `frontend/src/services/signalsHealth.ts` — Uses `SIGNALS_API_URL` from constants
- **FILE:** `frontend/src/stores/systemStatusStore.ts` — Uses `SIGNALS_API_URL` from constants
- **FILE:** `frontend/src/hooks/useSignals.ts` — Uses `SIGNALS_API_URL`, aligned path to `/api/v1/signals`, added 5s timeout via AbortController
- Frontend continues to work when backend-signals (4001) is down (silent failure)

### 5) WalletStore supported chains — VERIFIED
- **FILE:** `frontend/src/stores/walletStore.ts` — Already uses `SUPPORTED_CHAIN_IDS` from constants
- Constants define `[1, 56, 137, 42161, 10, 43114]` (6 chains). No change needed.

---

## Verification Commands

```bash
cd /Users/gev/Swaperex/Swaperex-2/frontend
npm ci
npm run build
```

Expected: Build succeeds with no TypeScript errors.

---

## Server Deploy Commands

```bash
cd ~/Swaperex || exit 1
git pull

cd frontend || exit 1
npm ci
npm run build

ls -la dist | head

# Deploy (if you have a deploy script)
~/Swaperex/scripts/deploy-frontend.sh

sudo systemctl reload nginx
sudo systemctl status nginx --no-pager -l | sed -n '1,20p'
```

---

## Environment Variables

- `VITE_SIGNALS_API_URL` — Optional. Default: `http://localhost:4001`. Set in production to point to your signals backend.
- No hardcoded IPs in code.
