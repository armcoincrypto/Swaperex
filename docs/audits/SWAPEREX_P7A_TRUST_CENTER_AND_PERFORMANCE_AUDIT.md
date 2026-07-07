# SWAPEREX P7A — Trust Center & Performance Audit

**Date:** 2026-07-08  
**Production:** https://dex.kobbex.com @ `8937baa`  
**Scope:** Trust Center (public), trust links, performance investigation, deploy plan (doc only)

---

## P5 Live Verification (Phase 1)

| Check | Result |
|-------|--------|
| `version.txt` | `short=8937baa`, `environment=production` |
| `/api/health`, `/api/v1/health` | 200 JSON |
| `swaperex-admin.service` | active (running) |
| Local `127.0.0.1:8001/api/v1/health` | `{"status":"healthy","service":"swaperex"}` |
| `GET /api/v1/admin/operator-intelligence` (local + nginx) | 200 |
| `schema_version` | **3** |
| `data_confidence` | present (`insufficient` — low telemetry, expected) |
| `window.scan` | present |
| Status | `INSUFFICIENT_DATA` (correct for low sample) |
| Plain GET side effect | No snapshot write required for certification (persistDaily opt-in) |

**Verdict:** P5 intelligence layer is **live and functioning**.

---

## P7A Trust Center

**Route:** `/trust`  
**Component:** `frontend/src/components/pages/TrustCenterPage.tsx`

### Sections

- Trust & Transparency hero
- Non-custodial by design
- Supported networks (swap vs balance-view)
- Commission transparency (20 bps ETH, 50 bps BSC)
- Audited production routes (internal certification language)
- Wrapper contract addresses (Etherscan/BscScan links)
- Wallet safety
- Unsupported chains explanation
- Operational monitoring (high level, no admin data)
- FAQ
- Risk disclaimer + legal links

### Design

- Premium dark UI matching existing static pages
- Mobile-first card layout
- No fake external audit claims
- Lazy-loaded route chunk

---

## Trust Links Added

| Location | Link |
|----------|------|
| `DexSiteFooter` Resources | Trust Center |
| `DexLearnMoreSection` | Trust Center |
| `SwapInterface` trust footer | Trust Center |
| `CommissionSwapChainBanner` | “Why only some networks support swaps” |
| `OperatorIntelligencePage` | Public trust page (new tab) |
| `sitemap.xml` | `/trust` |
| `routeSeo.ts` | SEO meta for `/trust` |

---

## Performance Investigation (Phase 4)

### Build output (largest assets)

| Asset | Size | Gzip (build report) |
|-------|------|---------------------|
| `vendor-reown-walletconnect-*.js` | **2.5 MB** | ~685 KB |
| `index-Dbi_swzx.js` (main app chunk) | **488 KB** | ~139 KB |
| `vendor-ethers-*.js` | 388 KB | ~146 KB |
| `index-VBRCn1hP.js` | 324 KB | — |
| `solanaBalanceService-*.js` | 180 KB | lazy (portfolio) |
| `AdminApp-*.js` | 100 KB | lazy (`/admin/*` only) |
| `WalletConnect-*.js` | 12 KB | lazy header chunk |

### Root causes

1. **WalletConnect/Reown vendor chunk (2.5 MB)** — largest by far. Vite intentionally isolates `@reown/*` and `@walletconnect/*` into one chunk to avoid circular dependency issues (`vite.config.ts` documents this).

2. **Main chunk (`index-Dbi_swzx.js`)** — includes `DexMain` shell, `SwapInterface`, `useWallet`, and static imports from `@/wallet/connectors`. Even though WC provider uses dynamic `import()`, the dependency graph still ships the vendor chunk when wallet code paths load.

3. **`WalletBootstrap` calls `initAppKit()` at module load** — when the lazy wallet bootstrap chunk loads, AppKit initializes immediately (required for hook registration). This is intentional for reconnect UX.

4. **Already lazy (good):** AdminApp, Send, Portfolio, Radar, Screener, static pages, SwapPreviewModal, TradingIntelligence, TokenList sidebar.

5. **`shouldLoadHeaderWalletChunk`** — defers WalletConnect UI on passive routes (radar, screener, static pages) for disconnected users. Good existing optimization.

### Recommendations (not implemented in P7A)

| Priority | Change | Risk |
|----------|--------|------|
| P1 | Run `ANALYZE=true npm run build` + review treemap quarterly | Low |
| P2 | Defer `initAppKit()` until first connect click | **Medium** — may break auto-reconnect |
| P2 | Split `useWallet` from heavy `@/wallet` imports for disconnected shell | **Medium** |
| P3 | Route-level code split for `SwapInterface` on non-swap tabs | Low |
| P3 | Preconnect hints for CDN/assets only (not WC) | Low |

**P7A decision:** No wallet lazy-loading changes — risk to connect/reconnect UX outweighs gain without dedicated QA.

---

## Deploy Pipeline Plan

See `docs/audits/SWAPEREX_DEPLOY_PIPELINE_SIMPLIFICATION_PLAN.md` (plan only, not implemented).

---

## Swap Path

No changes to `useSwap`, wrappers, commission bps, pair allowlist, or contracts.

---

## Remaining Risks

1. Trust Center wrapper addresses must stay in sync with `.env.production` when contracts change
2. Performance: 2.5 MB WC vendor still loads on wallet bootstrap path
3. P7A not yet deployed to production (commit pending)

---

*End of P7A audit.*
