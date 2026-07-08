# SWAPEREX P7B — Frontend Performance Audit

**Audit date:** 2026-07-08  
**Live commit:** `2f00a45` (https://dex.kobbex.com)  
**Repo HEAD:** `2f00a45`  
**Mode:** Report-only — no production deploy, no risky optimizations

---

## Executive Verdict

**`P7B_REPORT_ONLY_PASS`**

Swaperex frontend performance is **understood and bounded**. WalletConnect/Reown is **already deferred** from the HTML entry graph for cold disconnected sessions. The dominant cost is the **static import of `SwapInterface`** into `App.tsx`, which pulls swap/ethers logic into the initial bundle even on passive routes like `/trust`. Further gains require **P7C** work with dedicated wallet/reconnect QA — not blind lazy-loading in this phase.

---

## Build Output Summary

```bash
npm --prefix frontend run build  # PASS
ANALYZE=true npm run build       # PASS → frontend/dist/bundle-stats.html (1.97 MB treemap)
```

Vite warns on chunks >500 KB: `vendor-reown-walletconnect`, `index-BD9owUku`, `vendor-ethers`.

---

## Largest Assets (Top 20 by size)

| Rank | Asset | Raw | Gzip (Vite) | Classification |
|------|-------|-----|-------------|----------------|
| 1 | `vendor-reown-walletconnect-*.js` | 2.60 MB | 685 KB | **Lazy** (WalletBootstrap chain) |
| 2 | `index-BD9owUku.js` | 498 KB | 140 KB | **Initial entry** |
| 3 | `vendor-ethers-*.js` | 395 KB | 146 KB | **Initial** (modulepreload) |
| 4 | `index-VBRCn1hP.js` | 330 KB | 119 KB | **Reown subgraph** (inside WC vendor split) |
| 5 | `solanaBalanceService-*.js` | 182 KB | 50 KB | Lazy (Portfolio) |
| 6 | `vendor-react-*.js` | 146 KB | 47 KB | **Initial** (modulepreload) |
| 7 | `RadarPanel-*.js` | 141 KB | 38 KB | Lazy |
| 8 | `PortfolioPage-*.js` | 102 KB | 28 KB | Lazy |
| 9 | `AdminApp-*.js` | 102 KB | 17 KB | Lazy (`/admin/*`) |
| 10 | `vendor-crypto-shared-*.js` | 95 KB | 34 KB | Shared lazy dep |
| 11 | `index-*.css` | 85 KB | 15 KB | Initial |
| 12 | `SwapPreviewModal-*.js` | 38 KB | 9 KB | Lazy |
| 13 | `TokenScreener-*.js` | 32 KB | 10 KB | Lazy |
| 14 | `SendPage-*.js` | 30 KB | 9 KB | Lazy |
| 15 | `TradingIntelligencePanel-*.js` | 17 KB | 6 KB | Lazy |
| 16 | `StaticPages-*.js` | 12 KB | 3 KB | Lazy |
| 17 | `WalletConnect-*.js` | 11 KB | 3 KB | Lazy header UI |
| 18 | **`TrustCenterPage-*.js`** | **9 KB** | **3 KB** | **Lazy** (`/trust`) |
| 19 | `WalletBootstrap-*.js` | 2 KB | 1 KB | Lazy (triggers AppKit init) |
| 20 | Phosphor icon chunks | 2–12 KB each | — | Lazy (AppKit UI) |

### Initial route cold load (disconnected, no WC storage hint)

From `dist/index.html`:

```html
<script type="module" src="/assets/index-BD9owUku.js">
<link rel="modulepreload" href="/assets/vendor-react-*.js">
<link rel="modulepreload" href="/assets/vendor-ethers-*.js">
```

**Estimated initial JS (minified):** ~1.04 MB (~333 KB gzip) = entry + react + ethers + CSS.  
**`vendor-reown-walletconnect` is NOT preloaded** in HTML.

---

## Initial vs Lazy Classification

| Route / feature | Lazy? | Notes |
|-----------------|-------|-------|
| `/` (swap tab) | Partial | Shell eager; SwapInterface **eager import** |
| `/trust` | Partial | TrustCenterPage lazy; **swap stack still in entry** |
| `/about`, `/terms`, etc. | Partial | StaticPages lazy; swap stack in entry |
| `/admin/*` | **Yes** | AdminApp separate chunk |
| Portfolio / Radar / Screener | **Yes** | Tab lazy |
| WalletConnect / AppKit | **Yes** | WalletBootstrap + vendor-reown lazy |
| Swap preview modal | **Yes** | lazySwapUiChunks |

---

## WalletConnect / AppKit Import Graph

### Initialization chain

```
App.tsx
  └─ LazyWalletBootstrap (lazy) ──► WalletBootstrap.tsx
        ├─ initAppKit() at MODULE LOAD  ◄── runs when chunk loads
        ├─ @reown/appkit/react (createAppKit, useAppKit, useDisconnect)
        └─ AppKitBridge.tsx (@reown/appkit/react hooks)

useWallet.ts (EAGER — DexMain always calls)
  ├─ ethers BrowserProvider (vendor-ethers — eager)
  ├─ @/wallet/connectors → dynamic import('@walletconnect/ethereum-provider') on legacy reconnect only
  └─ appKitActionsRegistry (no @reown import — by design)

lazyWalletChunks.tsx
  └─ lazy(() => import('WalletConnect')) — header UI only
```

### Key findings

1. **`initAppKit()` runs at module load** inside `WalletBootstrap.tsx` (line 16), not on user click. When the bootstrap chunk loads, AppKit initializes immediately.

2. **WalletBootstrap is gated** by `walletHostNeeded` in `App.tsx` (Zustand store). It does **not** mount on cold `/trust` unless connect/disconnect requested or storage hint path fires.

3. **Deferred WC storage activation** (`App.tsx` P4.4.2): if `hasWalletConnectStorageHint()`, `requestIdleCallback` (400ms timeout) calls `walletBootstrapStore.request()` — avoids competing with first paint for returning users.

4. **`shouldLoadHeaderWalletChunk`** excludes `trust`, `about`, `radar`, `screener` when disconnected — header WalletConnect UI not loaded on passive routes.

5. **Legacy `autoReconnect()`** in `useWallet` on mount can dynamic-import `@walletconnect/ethereum-provider` if `swaperex_last_connector === 'walletconnect'`. Primary WC restore is AppKitBridge, not this path.

6. **`vite.config.ts`** intentionally keeps `@reown/*` + `@walletconnect/*` in one vendor chunk to avoid Rollup circular chunk warnings. React must stay separate (documented in config).

7. **Main performance gap:** `import { SwapInterface } from '@/components/swap/SwapInterface'` is **static** in `App.tsx` line 11. SwapInterface imports `useSwap` → large swap/quote/commission dependency tree in **entry bundle** even when `currentPage === 'trust'`.

---

## Route Loading Audit

| Route | Type | Wallet WC chunk | Swap stack in entry |
|-------|------|-----------------|---------------------|
| `/` (default swap) | Swap-critical | On connect / WC hint / connected | **Yes (static import)** |
| `/trust` | Passive marketing | **No** (cold disconnected) | **Yes (unnecessary)** |
| `/about`, `/terms`, etc. | Passive | **No** (cold disconnected) | **Yes (unnecessary)** |
| `/admin/*` | Admin | Separate app shell | N/A |
| Portfolio / Radar / Screener | Feature tabs | Header WC deferred | **Yes (entry)** |
| Send | Wallet-needed | Header WC when disconnected | **Yes (entry)** |

**SPA note:** `/` and `/trust` serve identical `index.html`; route differences are client-side only.

**Goal compliance:**

| Goal | Status |
|------|--------|
| `/trust` should not load wallet connect | **PASS** (cold, no hint) |
| Passive pages should not load WC | **PASS** (cold) |
| Swap page can load wallet | **PASS** |
| Admin separate | **PASS** |
| Passive pages should not load swap stack | **FAIL** — static SwapInterface import |

---

## Browser Smoke Findings

| Check | Result |
|-------|--------|
| Live `version.txt` | `short=2f00a45` |
| `curl -I /` | HTTP 200 |
| `curl -I /trust` | HTTP 200 |
| Live HTML entry script | Same `index-BD9owUku.js` for `/` and `/trust` |
| Lighthouse / Playwright | **Not run** — tooling unavailable in audit environment |

**Limitation:** No lab LCP/JS transfer measurement. Recommend Chrome DevTools Performance + Network throttling on `/trust` vs `/` in P7C.

**Expected runtime behavior (code review):**

- Cold `/trust`, disconnected, no WC localStorage keys → no `WalletBootstrap`, no `vendor-reown` fetch
- User clicks Connect on swap → `requestWalletBootstrap()` → lazy load WalletBootstrap → vendor-reown (~685 KB gzip)

---

## Safe Optimization Plan (Ranked)

### Safe Now (P7C low risk)

| # | Change | Impact | Risk |
|---|--------|--------|------|
| 1 | **Lazy-load `SwapInterface`** with `React.lazy` when `currentPage === 'swap'` | Large entry bundle reduction on `/trust`, static pages | Medium — swap mount timing QA |
| 2 | Keep Trust Center / Admin / tab routes lazy | Already done | None |
| 3 | Document `WalletBootstrap` + `initAppKit` deferral rationale | Operator clarity | None |
| 4 | Run `npm run analyze` in release checklist | Visibility | None |
| 5 | Avoid new static imports of `ethers` in passive components | Prevent regression | Low |

### Needs Dedicated QA (P7C/P8)

| # | Change | Impact | Risk |
|---|--------|--------|------|
| 1 | Defer `initAppKit()` until first connect click | Delay 2.6 MB WC until interaction | **High** — reconnect/hook race |
| 2 | Split `useWallet` out of DexMain for passive route shell | Remove ethers from passive paths | **High** — architecture |
| 3 | Gate `autoReconnect()` on swap/trade routes only | Stop legacy WC import on `/trust` | Medium |
| 4 | Further `manualChunks` splits inside reown vendor | Marginal | **High** — circular deps |

### Do Not Do Yet

- Remove WalletConnect / AppKit
- Change wagmi/provider architecture (not used today)
- Modify swap/quote/commission logic for perf
- Defer reconnect without AppKitBridge test matrix

---

## Risks

1. **Perceived slowness on swap home** is largely entry + ethers + swap stack — not only WC
2. **Returning WC users** will load vendor-reown after idle callback — intentional for reconnect
3. **Lazy SwapInterface** is the best next win but touches swap-critical render path
4. **Bundle analyzer** at `frontend/dist/bundle-stats.html` — regenerate per release; not committed

---

## Recommendation: P7C Performance Implementation

**Scope:** Lazy `SwapInterface` + passive-route shell split (no wallet init changes in v1)

**QA matrix:**

- Cold load `/trust` — Network tab: no `vendor-reown-walletconnect` until connect
- Cold load `/` — swap renders; quote + preview unchanged
- WC reconnect with storage hint — session restores
- Connect → quote → preview → sign (ETH + BSC smoke)
- Commission pair audit + wrapper audit unchanged

**Do not deploy P7C without full matrix.**

---

## Validation (P7B audit session)

| Gate | Result |
|------|--------|
| `git diff --check` | PASS (no changes) |
| `npm run build` | PASS |
| `verify-wrappers.sh` | PASS |
| `audit-commission-pairs.mjs` | 126/126 PASS |
| `pytest` | 119 passed |
| Swap path diff | **Empty** (report-only) |

---

*End of P7B Performance Audit.*
