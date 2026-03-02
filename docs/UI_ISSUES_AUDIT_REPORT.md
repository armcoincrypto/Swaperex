# Swaperex UI Issues — Deep Audit Report

**Date:** 2026-03-02  
**Scope:** dex.kobbex.com production  
**Status:** Audit only — no fixes implemented

---

## A) Reproduction Map

### Routes & Components

| Feature | Route | Component(s) | Location |
|---------|-------|--------------|----------|
| Token Screener | Tab: `screener` | `TokenScreener` | `frontend/src/components/screener/TokenScreener.tsx` |
| Screener data | — | `useScreener` | `frontend/src/hooks/useScreener.ts` |
| Screener fetch | — | `fetchMarketTokens` | `frontend/src/services/screener/coingeckoService.ts` |
| Signals status badge | Radar, Swap | `SignalsStatusBadge` | `frontend/src/components/signals/SignalsStatusBadge.tsx` |
| Signals health check | — | `checkSignalsHealth` | `frontend/src/services/signalsHealth.ts` |
| Risk/liquidity alerts | Radar panel | `AlertsPanel` + `SignalsStatusBadge` | `frontend/src/components/radar/RadarPanel.tsx` L196, L260 |
| Chain dropdown | Header | `NetworkSelector` | `frontend/src/components/common/NetworkSelector.tsx` L125 |

### Network Calls (fetch URLs, base URLs, env vars)

| Caller | URL built from | Method | Env var |
|--------|----------------|--------|---------|
| **Screener (CoinGecko)** | `coingeckoService.ts` | GET | `VITE_SIGNALS_API_URL` |
| | `PROXY_BASE/coingecko/markets?category=...` | | Fallback: `http://207.180.212.142:4001` |
| **Signals health** | `signalsHealth.ts` | GET | `VITE_SIGNALS_API_URL` |
| | `SIGNALS_API_URL/health` | | Fallback: `http://207.180.212.142:4001` |
| **Signals data** | `useSignals.ts` | GET | `VITE_SIGNALS_API_URL` |
| | `SIGNALS_API_URL/api/signals?chainId=&token=` | | Fallback: `http://207.180.212.142:4001` |
| **Signals data** | `signalsHealth.ts` (fetchSignals) | GET | `VITE_SIGNALS_API_URL` |
| | `SIGNALS_API_URL/api/v1/signals?...` | | Fallback: `http://207.180.212.142:4001` |
| **System status** | `systemStatusStore.ts` | GET | `VITE_SIGNALS_API_URL` |
| | `SIGNALS_API_URL/api/v1/health` | | Fallback: `http://207.180.212.142:4001` |
| **Balance RPC** | `balanceStore.ts`, `evmBalanceService.ts` | POST (RPC) | `VITE_SIGNALS_API_URL` |
| | `RPC_PROXY/rpc/:chain` | | Fallback: `http://207.180.212.142:4001` |
| **Portfolio prices** | `priceService.ts` | GET | (none) |
| | Direct: `https://api.coingecko.com/api/v3/simple/price?...` | | Hardcoded |
| **DexScreener (screener expand)** | `dexScreenerService.ts` | GET | (none) |
| | Direct: `https://api.dexscreener.com/latest/dex/tokens/...` | | Hardcoded |

---

## B) Root-Cause Hypotheses + Evidence

### 1. "Failed to fetch" in Token Screener

**Where produced:**
- `frontend/src/hooks/useScreener.ts` L84: `setError(err instanceof Error ? err.message : 'Failed to load tokens')`
- Native `fetch` throws `TypeError: Failed to fetch` on network/CORS/mixed-content block

**Code path:**
1. `TokenScreener` → `useScreener` → `fetchMarketTokens(chainId, perPage, signal)`
2. `coingeckoService.ts` L60-62: `const url = \`${PROXY_BASE}/coingecko/markets?category=${category}&per_page=${perPage}&page=1\`;` then `fetch(url, { signal })`

**Evidence — wrong base URL:**
```15:16:frontend/src/services/screener/coingeckoService.ts
// Backend-signals proxy (server-side CoinGecko fetch → no CORS)
const PROXY_BASE = import.meta.env.VITE_SIGNALS_API_URL || 'http://207.180.212.142:4001';
```

**Hypothesis (high confidence):**  
When `VITE_SIGNALS_API_URL` is **not set at build time**, `PROXY_BASE` becomes `http://207.180.212.142:4001`.  
Loading the page over `https://dex.kobbex.com` and requesting `http://...` triggers **mixed content** blocking. The browser blocks the request; `fetch` throws, leading to "Failed to fetch" / "Failed to load tokens".

**Alternate possibilities (lower):**
- CORS: backend uses `origin: true` → unlikely
- CoinGecko rate limit: would return 429, not "Failed to fetch"
- Proxy route missing in nginx: would cause 404 if request reached server

---

### 2. "Signals temporarily unavailable" / "Risk & liquidity alerts are offline"

**Where produced:**
- `frontend/src/components/signals/SignalsStatusBadge.tsx` L47-49

**Trigger:**
- `useSignalsHealthStore().online === false` and `checked === true`
- `online` is set by `checkSignalsHealth()` in `signalsHealth.ts`

**Code path:**
1. `checkSignalsHealth()` fetches `${SIGNALS_API_URL}/health` (L30)
2. `SIGNALS_API_URL = import.meta.env.VITE_SIGNALS_API_URL || 'http://207.180.212.142:4001'` (L10)
3. On HTTPS page, HTTP request → mixed content → fetch fails → `catch` → returns `false` → `online = false`

**Evidence:**
```9:10:frontend/src/services/signalsHealth.ts
// Use environment variable or default to production URL
const SIGNALS_API_URL = import.meta.env.VITE_SIGNALS_API_URL || 'http://207.180.212.142:4001';
```

**Conclusion:** Same root cause as screener: HTTP fallback under HTTPS → mixed content → health check fails → "Signals offline".

---

### 3. "No tokens match your filters"

**Where produced:**
- `ScreenerTable` or filters logic when `tokens.length === 0` after filtering
- In Advanced mode, aggressive filters (e.g. min volume, price range) can zero out the list
- If the **initial fetch fails** (see #1), `rawTokens` stays `[]` → displayTokens is empty → "No tokens match"

**Evidence:** Screener shows both "Failed to fetch" (error) and "No tokens match" (empty list) when fetch fails.

---

### 4. Chain dropdown shows literal `\u25BC` instead of arrow (▼)

**Where produced:**
- `frontend/src/components/common/NetworkSelector.tsx` L125

**Evidence:**
```121:127:frontend/src/components/common/NetworkSelector.tsx
        ) : (
          <>
            <span className="text-lg">{currentNetwork?.icon}</span>
            <span className="text-sm font-medium">{currentNetwork?.name}</span>
            <span className="text-xs text-gray-400">\u25BC</span>
          </>
        )}
```

**Root cause:** In JSX, `\u25BC` as plain text is rendered as the six characters `\`, `u`, `2`, `5`, `B`, `C`. To display the Unicode character ▼, it must be in a string expression, e.g. `{'\u25BC'}`.

**Same issue elsewhere in the file:**
- L111: `\u27F3` (⟳) for spinner
- L116: `\u26A0\uFE0F` (⚠️)
- L158: `\u2713` (✓)

---

### 5. Config vs. hardcoded fallbacks

**Correct prod config (unused):**
- `frontend/src/config/api.ts` L17-20: prod uses `/api/v1` (same-origin) when `VITE_SIGNALS_API_URL` is unset

**Modules that ignore config and use HTTP fallback:**

| File | Constant | Fallback |
|------|----------|----------|
| `coingeckoService.ts` | PROXY_BASE | `http://207.180.212.142:4001` |
| `signalsHealth.ts` | SIGNALS_API_URL | `http://207.180.212.142:4001` |
| `useSignals.ts` | SIGNALS_API_URL | `http://207.180.212.142:4001` |
| `systemStatusStore.ts` | SIGNALS_API_URL | `http://207.180.212.142:4001` |
| `balanceStore.ts` | RPC_PROXY | `http://207.180.212.142:4001` |
| `evmBalanceService.ts` | RPC_PROXY | `http://207.180.212.142:4001` |
| `transactionHistory.ts` | EXPLORER_PROXY | `http://207.180.212.142:4001` |
| `useTxHistory.ts` | RPC_PROXY | `http://207.180.212.142:4001` |
| `walletScan/rpcConfig.ts` | RPC_PROXY | `http://207.180.212.142:4001` |
| `walletScan/enrichment.ts` | BACKEND_URL | `localhost:4001` (dev fallback) |

**Portfolio works because:**  
Balance/RPC calls may be going through `evmBalanceService` → `RPC_PROXY`. If Portfolio works while Screener/Signals fail, possible explanations:
- Different code paths or timing
- RPC uses different mechanism (e.g. ethers provider with public RPCs)
- User testing was not strict HTTPS or had different build/env

Most plausible: Portfolio balance uses ethers `provider.getBalance()` with public RPCs from chain config, not the signals backend proxy. So Portfolio succeeds regardless of the broken signals URL.

---

## C) Production Config Audit

### Frontend env vars (Vite)

| Var | Used for | Required for | When missing |
|-----|----------|--------------|--------------|
| `VITE_SIGNALS_API_URL` | All signals/screener/RPC/explorer proxy calls | Screener, Signals, Risk alerts | Fallback `http://207.180.212.142:4001` → mixed content |
| `VITE_API_URL` | Main backend | N/A (swap backend) | Fallback `localhost:8000` (dev) or `/api` (prod via api.ts) |
| `VITE_WC_PROJECT_ID` | WalletConnect | Optional | WC disabled |
| `VITE_ONEINCH_API_KEY` | 1inch quotes | Optional | 1inch may fail |
| `VITE_APP_URL` | Web3Modal metadata | Optional | `https://dex.kobbex.com` |

### Build-time behavior

- Vite replaces `import.meta.env.VITE_*` at **build time**. If `VITE_SIGNALS_API_URL` is not set during `npm run build`, the fallback `http://207.180.212.142:4001` is baked into the bundle.
- To confirm: inspect `dist/assets/index-*.js` for `207.180.212.142` or `http://` base URLs.

### Correct production value

For same-origin, no mixed content:

- `VITE_SIGNALS_API_URL=/api/v1`  
  Or the full origin:  
- `VITE_SIGNALS_API_URL=https://dex.kobbex.com/api/v1`

Backend routes:

- Health: `/health`, `/api/v1/health`
- Signals: `/api/v1/signals`
- CoinGecko: `/coingecko/markets` (at root, not under `/api/v1`)

So nginx must proxy:

- `/api/v1/*` → backend :4001 (matches `/api/v1/health`, `/api/v1/signals`)
- `/coingecko/*` → backend :4001 (for `/coingecko/markets`)

Or backend could expose `/api/v1/coingecko/markets` and proxy only `/api/v1`.

---

## D) Exact File Paths + Line Numbers

| Issue | File | Line(s) |
|-------|------|---------|
| Screener fetch URL | `frontend/src/services/screener/coingeckoService.ts` | 15-16, 60-62 |
| Screener error text | `frontend/src/hooks/useScreener.ts` | 84 |
| Signals health URL | `frontend/src/services/signalsHealth.ts` | 10, 30, 57 |
| "Signals offline" UI | `frontend/src/components/signals/SignalsStatusBadge.tsx` | 47-49 |
| useSignals URL | `frontend/src/hooks/useSignals.ts` | 52, 78 |
| System status URL | `frontend/src/stores/systemStatusStore.ts` | 13, 71 |
| Chain dropdown `\u25BC` | `frontend/src/components/common/NetworkSelector.tsx` | 111, 116, 125, 158 |
| Central API config (correct) | `frontend/src/config/api.ts` | 17-20 |

---

## E) Minimal Fix Plan (High Level — Do Not Implement Yet)

1. **Use central config for signals base URL**  
   Replace all local `VITE_SIGNALS_API_URL || 'http://207.180.212.142:4001'` with `SIGNALS_API_URL` from `@/config/api.ts`, or import `joinSignalsUrl` from config and use for path construction.

2. **Ensure production build gets same-origin base**  
   - Set `VITE_SIGNALS_API_URL=/api/v1` (or `https://dex.kobbex.com/api/v1`) at build time.  
   - Or rely on config defaults: `api.ts` already uses `/api/v1` in prod when env is unset. All callers must use that config.

3. **Proxy both signals and CoinGecko in nginx**  
   - `/api/v1/` → `http://127.0.0.1:4001/api/v1/`  
   - `/coingecko/` → `http://127.0.0.1:4001/coingecko/`  
   Or add `/api/v1/coingecko/markets` on the backend and proxy only `/api/v1`.

4. **Fix Unicode in NetworkSelector**  
   - Replace raw `\u25BC` with `{'\u25BC'}` (and similarly for `\u27F3`, `\u26A0\uFE0F`, `\u2713`).

5. **Optional: proxy CoinGecko price calls**  
   - `priceService.ts` calls `api.coingecko.com` directly. If that’s blocked by CORS or rate limits, add a backend proxy for `/simple/price` and point the frontend there.

---

## F) Quick Verification Checklist (After Fixes)

**Run on VPS:**
```bash
./scripts/audit/verify-live.sh
```

### API endpoints (should return 200)

- [ ] `https://dex.kobbex.com/api/v1/health`
- [ ] `https://dex.kobbex.com/api/v1/signals?chainId=1&token=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`
- [ ] `https://dex.kobbex.com/coingecko/markets?category=ethereum-ecosystem&per_page=100&page=1`

### Nginx proxy config (scripts/nginx/dex.kobbex.com.conf)

- [ ] `location /api/v1/` → proxy_pass http://127.0.0.1:4001
- [ ] `location /coingecko/` → proxy_pass http://127.0.0.1:4001
- [ ] `location /rpc/` → proxy_pass http://127.0.0.1:4001
- [ ] `location /explorer/` → proxy_pass http://127.0.0.1:4001

### UI checks (DevTools Network tab)

- [ ] No "Mixed Content" errors (all requests same-origin or HTTPS)
- [ ] Token Screener: table populated, no "Failed to fetch"
- [ ] Signals badge: hidden when backend is online
- [ ] Chain dropdown: shows ▼, not literal `\u25BC`
- [ ] Portfolio: balances load as before

### Build check

- [ ] `rg "207\.180\.212\.142" frontend/dist` → no matches
- [ ] `rg "http://.*4001" frontend/dist` → no matches (dev-only uses import.meta.env.DEV)
