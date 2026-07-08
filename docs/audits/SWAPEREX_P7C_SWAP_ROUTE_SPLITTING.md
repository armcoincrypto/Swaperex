# SWAPEREX P7C — Swap Shell Route Splitting

**Date:** 2026-07-08  
**Baseline live commit:** `2f00a45`  
**Scope:** Frontend bundling only — lazy `SwapInterface`  
**Mode:** Implemented, not deployed

---

## Executive Verdict

**`P7C_READY_TO_COMMIT`**

`SwapInterface` is no longer statically imported in `App.tsx`. The swap shell (~225 KB minified) loads only when `currentPage === 'swap'`. Passive routes (`/trust`, static pages, admin, portfolio, radar, screener) no longer pull the swap stack on cold load.

---

## Bundle Before (P7B baseline @ `2f00a45`)

| Asset | Raw | Gzip |
|-------|-----|------|
| `index-BD9owUku.js` (entry) | 498 KB | 140 KB |
| `vendor-ethers-CS9BpkGU.js` | 395 KB | 146 KB |
| `vendor-reown-walletconnect-*.js` | 2,597 KB | 685 KB |
| `TrustCenterPage-BZsIPHIQ.js` | 9 KB | 3 KB |
| SwapInterface | *(in entry)* | — |

**Initial HTML preloads:** entry + vendor-react + vendor-ethers

---

## Bundle After (P7C)

| Asset | Raw | Gzip | Load |
|-------|-----|------|------|
| `index-BikRjnJw.js` (entry) | **212 KB** | **70 KB** | Initial |
| **`SwapInterface-CWsnvE9G.js`** | **225 KB** | **58 KB** | **Lazy (swap tab only)** |
| `vendor-ethers-CS9BpkGU.js` | 395 KB | 146 KB | Initial (useWallet) |
| `vendor-reown-walletconnect-*.js` | 2,597 KB | 685 KB | Lazy (unchanged) |
| `TrustCenterPage-Ba-ciZVF.js` | 9 KB | 3 KB | Lazy (unchanged) |
| `AdminApp-D2PlL8Or.js` | 102 KB | 17 KB | Lazy (unchanged) |

**Entry reduction:** 498 KB → 212 KB (**−57%** raw, **−50%** gzip)

**Passive cold load savings:** ~286 KB raw / ~70 KB gzip swap stack not fetched on `/trust`

---

## Implementation

**File:** `frontend/src/App.tsx`

1. Removed static `import { SwapInterface } from '@/components/swap/SwapInterface'`
2. Added `LazySwapInterface` via `React.lazy(() => import('@/components/swap/SwapInterface'))`
3. Wrapped swap panel in `<Suspense fallback={lazySwapInterfaceFallback}>` only inside `currentPage === 'swap'` block
4. Fallback: minimal `dex-loading-shell` with “Loading swap…”

**Not changed:** `SwapInterface.tsx`, `useSwap.ts`, wallet/AppKit, quote/commission logic.

---

## Why This Is Safe

- Swap UI renders only on the swap tab (same `currentPage === 'swap'` gate as before)
- Lazy boundary is route-scoped — passive pages never mount `SwapInterface`
- No changes to swap execution, quotes, commission, wrappers, or wallet initialization
- Brief loading state on swap tab first visit (existing pattern used elsewhere)

---

## Routes Affected

| Route | Impact |
|-------|--------|
| `/` (swap tab) | SwapInterface loads async; brief “Loading swap…” |
| `/trust`, `/about`, etc. | **No swap chunk** on cold load |
| `/admin/*` | Unchanged (AdminApp lazy) |
| Portfolio / Radar / Screener | Unchanged (tab lazy); no SwapInterface |

---

## Routes Not Affected

- Swap quote/preview/sign flow (same component, deferred fetch)
- WalletConnect / AppKit init timing
- Admin intelligence API
- Commission pair routing

---

## Validation

| Gate | Result |
|------|--------|
| `git diff --check` | PASS |
| `npm run build` | PASS |
| `ANALYZE=true npm run build` | PASS (`dist/bundle-stats.html`) |
| `verify-wrappers.sh` | PASS |
| `audit-commission-pairs.mjs` | 126/126 |
| `pytest` | 119 passed |
| Swap-path diff (`useSwap`, wrappers, etc.) | **Empty** |

---

## Remaining Risk

1. **Brief swap tab flash** — “Loading swap…” on first swap visit (acceptable)
2. **Entry still includes `useWallet` + ethers** — further passive-route gains need P8 shell split
3. **Returning users on swap tab** — chunk cached after first load (expected)
4. **Not deployed** — production still `2f00a45` until static deploy approved

---

## Deploy Recommendation

Static frontend deploy only:

```bash
git push origin main
./scripts/safe-prod-deploy.sh --dry-run
./scripts/safe-prod-deploy.sh
```

Verify post-deploy:

- Cold `/trust` — Network tab: no `SwapInterface-*.js`
- `/` swap — quote + preview smoke
- `version.txt` updated

No `app_admin` restart required.

---

*End of P7C audit.*
