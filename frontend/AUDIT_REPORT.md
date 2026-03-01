# Swaperex Frontend Audit Report

**Date:** March 1, 2025  
**Scope:** `frontend/src/` — React + TypeScript + Vite + Zustand + ethers.js  
**Focus:** Bugs, runtime errors, incomplete features — no architectural refactors

---

## 1. BROKEN / RUNTIME ERRORS

### CRITICAL

| FILE | LINE | SEVERITY | ISSUE | FIX |
|------|------|----------|-------|-----|
| `frontend/src/tokens/index.ts` | 197-198 | CRITICAL | `DEFAULT_FROM_TOKEN` and `DEFAULT_TO_TOKEN` use non-null assertion (`!`) on `getTokenBySymbol()`; if token list is empty or symbols missing, runtime crash | Add fallback or null check: `getTokenBySymbol('ETH') ?? getTokenBySymbol('WETH')` and handle undefined case in consumers |
| `frontend/src/services/tokenMeta.ts` | 78-79 | CRITICAL | DexScreener API URL is wrong: uses `/tokens/${address}` but correct format is `/token-pairs/v1/${chainId}/${address}` or `/tokens/v1/${chainId}/${tokenAddresses}` — chainId is missing, metadata fetch will fail | Change to: `${DEXSCREENER_API}/token-pairs/v1/${chainId}/${address}` (map chainId to DexScreener chain format) |

### HIGH

| FILE | LINE | SEVERITY | ISSUE | FIX |
|------|------|----------|-------|-----|
| `frontend/src/hooks/useSignals.ts` | 53 | HIGH | Default `SIGNALS_API_URL` is `http://localhost:3001` but backend runs on port 4001; inconsistent with `signalsHealth.ts` (4001) and `systemStatusStore.ts` (4001) | Use same fallback: `import.meta.env.VITE_SIGNALS_API_URL \|\| 'http://localhost:4001'` |
| `frontend/src/hooks/useSignals.ts` | 78 | HIGH | API path `/api/signals` may not match backend; `signalsHealth.ts` uses `/api/v1/signals` | Align path with backend: `/api/v1/signals` or `/api/signals` per actual backend routes |

---

## 2. WALLET & CHAIN ISSUES

### CRITICAL

| FILE | LINE | SEVERITY | ISSUE | FIX |
|------|------|----------|-------|-----|
| `frontend/src/components/wallet/WalletConnect.tsx` | 87-89 | CRITICAL | WalletConnect option shows `alert('WalletConnect coming soon!')` — feature advertised in UI but not implemented; users on mobile get dead-end | Either implement WalletConnect v2 (using WALLETCONNECT_PROJECT_ID from constants) or remove/hide the option and show "Coming soon" badge instead of alert |

### HIGH

| FILE | LINE | SEVERITY | ISSUE | FIX |
|------|------|----------|-------|-----|
| `frontend/src/components/common/NetworkSelector.tsx` | 21-46 | HIGH | Only 3 chains in `SUPPORTED_NETWORKS`: ETH, BSC, Polygon. Missing Arbitrum, Optimism, Avalanche (claimed 6-chain support) | Add: `{ chainId: 42161, name: 'Arbitrum One', ... }, { chainId: 10, name: 'Optimism', ... }, { chainId: 43114, name: 'Avalanche', ... }` |
| `frontend/src/hooks/useWallet.ts` | 85, 135, 171 | HIGH | `fetchBalances` uses hardcoded `['ethereum', 'bsc', 'polygon']` — Arbitrum, Optimism, Avalanche balances never fetched | Map `chainId` to chain names and pass all 6: `['ethereum','bsc','polygon','arbitrum','optimism','avalanche']` or derive from `supportedChainIds` |
| `frontend/src/stores/balanceStore.ts` | 14-31 | HIGH | `RPC_URLS`, `CHAIN_NAME_TO_ID`, `NATIVE_TOKENS`, `ERC20_TOKENS` only support ethereum, bsc, polygon — missing arbitrum, optimism, avalanche | Add entries for arbitrum (42161), optimism (10), avalanche (43114) |

### MEDIUM

| FILE | LINE | SEVERITY | ISSUE | FIX |
|------|------|----------|-------|-----|
| `frontend/src/config/chains.ts` | 330 | MEDIUM | `SUPPORTED_CHAIN_IDS = Object.values(CHAIN_IDS)` includes gnosis (100), fantom (250), base (8453) — 9 chains; `utils/constants.ts` has 6. Inconsistent. | Use single source: either `utils/constants.SUPPORTED_CHAIN_IDS` or align config with 6-chain product scope |
| `frontend/src/services/evmBalanceService.ts` | 36-61 | MEDIUM | `RPC_ENDPOINTS` and `CHAIN_IDS` only have ethereum, bsc, polygon, arbitrum — missing optimism, avalanche | Add optimism and avalanche RPC/config if Portfolio is expected to work on all 6 chains |

---

## 3. SWAP ISSUES

### CRITICAL

| FILE | LINE | SEVERITY | ISSUE | FIX |
|------|------|----------|-------|-----|
| `frontend/src/hooks/useSwap.ts` | 136 | CRITICAL | `SUPPORTED_CHAIN_IDS = [1, 56]` — only ETH and BSC. Polygon, Arbitrum, Optimism, Avalanche users get "Network mismatch" and cannot swap | Extend to `[1, 56, 137, 42161, 10, 43114]` and extend `quoteAggregator` + swap builders for those chains, OR clearly restrict UI to "Ethereum & BSC only" |
| `frontend/src/services/quoteAggregator.ts` | 42 | CRITICAL | `SUPPORTED_CHAINS = [1, 56]` — aggregator only supports ETH and BSC; other 4 chains will throw | Either add support for Polygon/Arbitrum/Optimism/Avalanche (1inch supports them) or document swap restriction to ETH+BSC |

### HIGH

| FILE | LINE | SEVERITY | ISSUE | FIX |
|------|------|----------|-------|-----|
| `frontend/src/hooks/useSwap.ts` | 500-501 | HIGH | Balance refresh after swap: `chainNetwork = chainId === 56 ? 'bsc' : 'ethereum'` — polygon, arbitrum, optimism, avalanche not handled; wrong chain balance may refresh | Map chainId to balanceStore chain name: `const chainMap: Record<number,string> = { 1:'ethereum', 56:'bsc', 137:'polygon', 42161:'arbitrum', 10:'optimism', 43114:'avalanche' }; await fetchBalances(address, [chainMap[chainId] ?? 'ethereum']);` |
| `frontend/src/services/oneInchQuote.ts` | 207-212 | HIGH | No timeout or retry — single fetch; slow/transient failures cause immediate quote failure | Add AbortController with timeout (e.g. 10s) and optional retry (1 retry on 5xx/network error) |
| `frontend/src/services/pancakeSwapQuote.ts` | 99-119 | MEDIUM | Uses `NATIVE_BNB_ADDRESS = '0xEeeee...'` — BNB→WBNB conversion present. No known "BNB freeze" bug in current logic; quoter uses `getSwapAddress()` correctly | None if behavior is correct; document BNB handling for future maintainers |

---

## 4. TOKEN LOGOS

| FILE | LINE | SEVERITY | ISSUE | FIX |
|------|------|----------|-------|-----|
| `frontend/src/tokens/*.json` | - | LOW | Token lists have `logoURI`; TokenDisplay uses `tokenMeta` (DexScreener), SwapInterface uses `token.logoURI` directly. Hybrid approach is fine. | None |
| `frontend/src/services/tokenMeta.ts` | 109 | MEDIUM | DexScreener `pair.info?.imageUrl` — structure may differ; verify response shape | After fixing API URL (see §1), ensure `pair.baseToken` / `pair.info` paths match actual DexScreener response |
| `frontend/src/services/tokenMeta.ts` | 147 | LOW | Fallback: `generateFallbackLogo(address)` uses DiceBear shapes API; external dependency | Consider static placeholder or inline SVG to avoid 3rd-party dependency |

---

## 5. MISSING FEATURES / INCOMPLETE CODE

| FILE | LINE | SEVERITY | ISSUE | FIX |
|------|------|----------|-------|-----|
| `frontend/src/components/wallet/WalletConnect.tsx` | 87-89 | CRITICAL | WalletConnect not implemented — see §2 | Implement or hide |
| `frontend/src/tokens/index.ts` | 46-53 | HIGH | `TOKEN_LISTS` only has 1, 56, 137, 42161 — missing Optimism (10), Avalanche (43114). `getTokenBySymbol`/`getTokenList` return undefined for those chains | Add `optimism.json`, `avalanche.json` and register in TOKEN_LISTS, or document 4-chain token support |
| `frontend/src/App.tsx` | 92, 119 | MEDIUM | `handleScreenerSwapSelect`: `chain: targetChainId === 56 ? 'bsc' : 'ethereum'` — polygon, arbitrum, optimism, avalanche mapped to 'ethereum' | Use chainId→name map: `const chainNames: Record<number,string> = { 1:'ethereum', 56:'bsc', 137:'polygon', 42161:'arbitrum', 10:'optimism', 43114:'avalanche' };` |
| `frontend/src/hooks/useWallet.ts` | 95-96 | LOW | Empty eslint-disable for deps; autoReconnect runs once on mount. Stale closure over `connect`/`fetchBalances` is acceptable for mount-only | Add comment explaining why deps are omitted |

---

## 6. PERFORMANCE ISSUES

| FILE | LINE | SEVERITY | ISSUE | FIX |
|------|------|----------|-------|-----|
| `frontend/src/hooks/useQuote.ts` | - | MEDIUM | Quote refresh — ensure debounce on amount input to avoid rapid API calls | Add 300–500ms debounce to `fetchQuote` trigger on amount change |
| `frontend/src/components/swap/SwapInterface.tsx` | - | MEDIUM | Large component; consider code-splitting if bundle is large | Lazy-load: `const SwapInterface = lazy(() => import('./SwapInterface'));` |
| `frontend/src/services/watchlistMonitor.ts` | - | LOW | Polls every 60s; reasonable | No change needed |
| `frontend/src/hooks/useWallet.ts` | 234-277 | LOW | `useEffect` for accounts/chain listeners has correct cleanup (`removeListener`) | No change |

---

## 7. SECURITY ISSUES

| FILE | LINE | SEVERITY | ISSUE | FIX |
|------|------|----------|-------|-----|
| `frontend/src/stores/systemStatusStore.ts` | 13 | MEDIUM | Hardcoded fallback `http://207.180.212.142:4001` exposes server IP | Use `import.meta.env.VITE_SIGNALS_API_URL` only, no hardcoded IP; require env in production |
| `frontend/src/services/signalsHealth.ts` | 9 | MEDIUM | Same hardcoded IP fallback | Same as above |
| `frontend/src/utils/constants.ts` | 71 | LOW | `WALLETCONNECT_PROJECT_ID` empty default — WC will fail if not set | Document in README that `VITE_WALLETCONNECT_PROJECT_ID` is required for WalletConnect |
| `frontend/src/utils/constants.ts` | 71 | LOW | No private keys or secrets in frontend code | None |

---

## 8. API & BACKEND INTEGRATION

| FILE | LINE | SEVERITY | ISSUE | FIX |
|------|------|----------|-------|-----|
| `frontend/src/api/client.ts` | 11 | MEDIUM | `API_URL = import.meta.env.VITE_API_URL \|\| 'http://localhost:8000'` — Python backend default. Ensure production uses correct URL | Document `VITE_API_URL` in .env.example |
| `frontend/src/services/signalsHealth.ts` | 40-43 | LOW | `checkSignalsHealth` fails silently (by design) — no retry | Acceptable; consider user-facing "Signals offline" when backend unavailable |
| `frontend/src/stores/signalsHealthStore.ts` | - | LOW | Proper fallback when backend down | TokenCheckInput shows "Backend may be offline" — good |
| `frontend/src/hooks/useSignals.ts` | 53 | HIGH | Different default port (3001) vs signalsHealth (4001) — see §1 | Unify to 4001 or env-only |

---

## Summary by Severity

| Severity | Count |
|----------|-------|
| CRITICAL | 5 |
| HIGH | 11 |
| MEDIUM | 10 |
| LOW | 5 |

---

## Recommended Fix Order

1. **Swap chain support**: Align `useSwap`, `quoteAggregator`, and balance refresh with 6 chains (or explicitly document 2-chain limitation).
2. **DexScreener tokenMeta**: Fix API URL to include chainId.
3. **WalletConnect**: Implement or hide in UI.
4. **NetworkSelector + useWallet fetchBalances**: Add all 6 chains.
5. **Signals API URL**: Unify `useSignals`, `signalsHealth`, `systemStatusStore` defaults and remove hardcoded IPs.
