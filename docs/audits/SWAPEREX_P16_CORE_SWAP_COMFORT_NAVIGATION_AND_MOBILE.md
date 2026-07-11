# SWAPEREX P16 — Core Swap Comfort, Navigation & Mobile

**Program:** P16_CORE_SWAP_COMFORT_NAVIGATION_AND_MOBILE  
**Date:** 2026-07-11  
**Baseline production:** `eee0264` (https://dex.kobbex.com)  
**Repository HEAD at audit:** `9b9dbea` (P15 committed, P16 implementation uncommitted)  
**Deployed:** No (per scope)

---

## Verdict

**P16_CORE_SWAP_COMFORT_NAVIGATION_AND_MOBILE_PASS**

Swaperex moves from tab-only navigation to first-class URLs with swap query persistence, a quiet unsupported-network swap surface, formal CTA/lifecycle models, unified **Swaperex by Kobbex** branding, and automated route smoke. Full handset WalletConnect pairing remains operator-assisted (connectivity UI certified in CI; no on-chain transactions executed).

---

## Scope

### In scope (delivered)

| Area | Deliverable |
|------|-------------|
| P16.1 | First-class routes: `/swap`, `/send`, `/portfolio`, `/radar`, `/screener` (+ existing `/`, `/trust`, static pages) |
| P16.2 | Swap URL persistence: `?chain=&from=&to=&slippage=` with validation |
| P16.3 | Unsupported-network swap surface — capability panel, no quote/route noise |
| P16.4 | Canonical CTA state registry (`swapCtaStates.ts`) wired to swap card a11y |
| P16.5 | Canonical transaction lifecycle (`transactionLifecycle.ts`) |
| P16.6 | WalletConnect connectivity certification script + viewport checks |
| P16.7 | Mobile safe-area padding on shells; overflow checks in cert script |
| P16.8 | Brand hierarchy: **Swaperex** / **by Kobbex** / `dex.kobbex.com` |

### Non-scope (respected)

- No smart contract, commission, treasury, wrapper, routing, chain-catalog, or backend API changes
- No new chains / Polygon-Arbitrum-Optimism-Avalanche swap enablement
- No production deploy

---

## Findings addressed

| ID | Finding | Status |
|----|---------|--------|
| P14-F002 | Tabs not real routes; refresh loses page | **FIXED** — URL-derived navigation |
| P14-F004 | Wallet/mobile not fully validated | **PARTIAL** — automated WC UI cert; handset pairing documented |
| P14-F005 | Navigation loses state | **FIXED** — routes + swap query sync |
| P14-F006 | Back/forward incomplete | **FIXED** — React Router paths |
| P14-F007 | Deep-link sharing impossible | **FIXED** — `/swap?chain=1&from=WETH&to=USDT` |
| Post-P15 | Unsupported networks too interactive | **FIXED** — `UnsupportedSwapNetworkExperience` |
| Post-P15 | Brand hierarchy inconsistent | **FIXED** — `brand.ts` + SEO/shell updates |
| Post-P15 | Transaction lifecycle not formalized | **FIXED** — lifecycle + CTA models |

---

## Route architecture (audit summary)

### Before P16

```text
URL-backed:  /  /trust  /about  /terms  /privacy  /disclaimer
Tab-only:    send  portfolio  radar  screener  (in-memory currentPage)
Refresh:     always returned to Swap on /
Deep links:  none for swap params
```

### After P16

```text
/swap          → Swap (+ homepage blocks)
/              → Swap (homepage alias preserved)
/send          → Send
/portfolio     → Portfolio
/radar         → Security (Radar)
/screener      → Markets (Screener)
/trust         → Trust Center (PassiveShell)
/about …       → Static pages (PassiveShell)

Swap query:   /swap?chain=1&from=WETH&to=USDT&slippage=0.5
Sections:     /portfolio#holdings  (hash → swaperex:section)
Unknown path: redirect → /swap
```

Navigation source of truth: `pathToPage(location.pathname)` in `TradeShell` (no isolated tab state).

---

## Files changed

| File | Change |
|------|--------|
| `frontend/src/config/appRoutes.ts` | Canonical route map |
| `frontend/src/utils/swapUrlState.ts` | Query parse/build + validation |
| `frontend/src/hooks/useSwapUrlSync.ts` | Store ↔ URL sync |
| `frontend/src/components/layout/TradeShell.tsx` | URL navigation, brand header, hash sections |
| `frontend/src/components/layout/PassiveShell.tsx` | Real route footer links, safe-area |
| `frontend/src/components/layout/DexSiteFooter.tsx` | Brand byline, copyright |
| `frontend/src/components/swap/SwapInterface.tsx` | Unsupported surface, CTA/lifecycle a11y, URL sync |
| `frontend/src/components/swap/UnsupportedSwapNetworkExperience.tsx` | **New** — read-only chain UX |
| `frontend/src/constants/brand.ts` | **New** — brand hierarchy |
| `frontend/src/constants/swapCtaStates.ts` | CTA registry |
| `frontend/src/constants/transactionLifecycle.ts` | Lifecycle registry |
| `frontend/src/utils/routeSeo.ts` | SEO for trade routes + brand titles |
| `frontend/public/sitemap.xml` | New crawlable trade routes |
| `frontend/src/config/__tests__/appRoutes.test.ts` | Route unit tests |
| `frontend/src/utils/__tests__/swapUrlState.test.ts` | URL persistence tests |
| `frontend/src/constants/__tests__/p16ComfortModels.test.ts` | CTA + lifecycle tests |
| `scripts/audit/p16-route-navigation-smoke.mjs` | HTTP route smoke |
| `scripts/audit/p16-mobile-walletconnect-cert.mjs` | WC connectivity cert |
| `scripts/release/p16-release-certify.sh` | P16 release gate |

---

## Screens reviewed

| Screen | Viewports |
|--------|-----------|
| Swap (supported / unsupported) | 360×800, 390×844, 430×932, 768×1024 |
| Send | 390×844, 768×1024 |
| Portfolio | 390×844 |
| Radar / Screener | 390×844 |
| Trust / About | 390×844 |
| Header / footer / network selector | All above |

---

## Wallets tested

| Wallet / method | Result | Notes |
|-----------------|--------|-------|
| WalletConnect QR modal | **PASS** (automated, 4 viewports) | QR/modal opens from Connect Wallet |
| WalletConnect deep-link entry | **PASS** (automated) | WalletConnect option visible in modal |
| MetaMask Mobile | **DEFERRED** | Requires physical handset scan |
| Trust Wallet | **DEFERRED** | Requires physical handset scan |
| Reconnect / disconnect UI | **PARTIAL** | Connect flow certified; disconnect not exercised without session |
| Chain switch | **PARTIAL** | Network selector visible all viewports |
| Session restore / expiry | **DEFERRED** | No broadcast; operator handset session |

**Policy:** No swaps, approvals, or broadcasts during P16 certification.

Evidence: `reports/p16-mobile-walletconnect-cert.json`, `reports/p16-route-navigation-smoke.json`

---

## Devices tested

Automated Playwright mobile emulation:

- 360×800 (small Android)
- 390×844 (iPhone 14 class)
- 430×932 (iPhone 14 Pro Max class)
- 768×1024 (tablet)

---

## Tests

| Suite | Result |
|-------|--------|
| `appRoutes` unit tests | **PASS** (7) |
| `swapUrlState` unit tests | **PASS** (4) |
| `p16ComfortModels` unit tests | **PASS** (4) |
| Frontend build (`tsc && vite build`) | **PASS** |
| P16 route smoke (12 routes) | **PASS** |
| Full Vitest (525/525) | **PASS** |

---

## Release certification

```text
P16_RELEASE_CERTIFICATION_PASS (local preview)
```

Runner: `scripts/release/p16-release-certify.sh --base-url http://127.0.0.1:4173`

---

## Known limitations

1. **Handset WC pairing** — MetaMask Mobile / Trust Wallet full reconnect cycle requires operator device (P12.1 assist pattern retained).
2. **Homepage alias** — `/` and `/swap` both resolve to swap; canonical SEO prefers `/swap` for new links; `/` preserved for inbound SEO.
3. **Display settings** — Slippage/route mode in URL; approval mode not persisted (intentional).
4. **Disconnect / session lifecycle** — Requires connected handset for full matrix.

---

## Rollback

1. Revert P16 commit(s) on `main`
2. Rebuild frontend: `npm --prefix frontend run build`
3. Deploy prior artifact if needed (production currently on `eee0264`, unaffected)

No database or contract rollback required.

---

## Open findings (post-P16)

| ID | Item | Phase |
|----|------|-------|
| P14-F004 | Reown chunk size (~2.6MB) | P19 |
| P14-F006 | Public status page | P17 |
| P14-F007 | Persistent public tx history | P17 |
| P16-WC-HANDSET | Full MetaMask/Trust handset matrix | Operator QA |

---

## Deferred findings

- Polygon / Arbitrum / Optimism / Avalanche **swap** enablement → P20+
- Limit orders, bridges, MEV, staking → P20+
- Major dependency upgrades → as needed per P19

---

## Recommended next phase

**P17 — History, status & observability UX**

- Public/status page (P14-F006)
- Persistent transaction history (P14-F007)
- Expand route smoke to production post-deploy gate

---

## URL strategy reference

```text
/swap?chain=1&from=WETH&to=USDT&slippage=0.5
/swap?chain=56&from=WBNB&to=USDC
/portfolio#activity
/send
/radar#watchlist
/screener#discovery
```

Validation rules:

- `chain`: commission swap chains only (1, 56)
- `from` / `to`: alphanumeric symbol, max 16 chars, catalog lookup
- `slippage`: 0.01–50%
- Invalid params dropped silently (never trusted)

---

*Audit completed 2026-07-11 UTC. No production deployment performed.*
