# SWAPEREX P14.1 — Current Functionality Inventory

**Program:** P14_FULL_PRODUCT_FUNCTIONALITY_AND_EXPERIENCE_AUDIT  
**Date:** 2026-07-10  
**Production:** https://dex.kobbex.com (`eee0264`)  
**Repository HEAD:** `11c13e7`  
**Evidence:** `docs/audits/raw/p14/baseline/`

---

## Verdict

**P14_1_FUNCTIONALITY_INVENTORY_COMPLETE**

---

## Executive summary

Swaperex is a **non-custodial EVM DEX aggregator SPA** deployed as static assets. The **core product** is commission-wrapper swap on **Ethereum (1)** and **BNB Chain (56)**. Additional surfaces (Portfolio, Radar, Screener, Send, Admin) ship in the same bundle but vary in infra dependency and maturity.

---

## Master functionality matrix

| Area | Feature | Route / page / component | User-visible | Current status | Production tested | Source confirmed | Dependencies | Known limitations | Risk | Recommended action |
|------|---------|--------------------------|--------------|----------------|-------------------|------------------|--------------|-------------------|------|-------------------|
| **Home** | Landing hero + trust strip | `/` → `TradeShell` + homepage sections | Yes | **CONFIRMED** complete | Smoke HTTP 200 | `HomepageHeroWorkspace.tsx` | None | Below-fold SEO deferred until scroll | LOW | Optional LCP polish |
| **Home** | Popular routes presets | `/` → `HomepagePopularRoutes` | Yes | **CONFIRMED** | Commission audit 126/126 | `popularCommissionRoutes.ts` | Audit allowlist | Only audited pairs shown | LOW | Keep synced with audit script |
| **Home** | Protocol stats | `/` → `HomepageProtocolStats` | Yes | **PARTIALLY CONFIRMED** | Not in smoke | `HomepageProtocolStats.tsx` | External APIs | May show placeholders if APIs fail | LOW | Document data sources |
| **Swap** | Token input / output | `/` → `SwapInterface` | Yes | **CONFIRMED** | P12.5 UI quote smoke | `SwapInterface.tsx` | Token lists, RPC | Large component (~3.7k lines) | MED | Monitor regression |
| **Swap** | Token selector | Inline `TokenSelectorDropdown` | Yes | **CONFIRMED** | Source + smoke | `SwapInterface.tsx` | Static JSON lists | ~142 tokens across 9 chain files | LOW | Expand audited pairs first |
| **Swap** | Network selector | Header `NetworkSelector` | Yes | **CONFIRMED** | Source | `NetworkSelector.tsx` | Wallet provider | 6 wallet chains; 2 swap chains | **HIGH** confusion | P15: clearer network tier UX |
| **Swap** | Quote flow | `useSwap` + quote services | Yes | **CONFIRMED** | 19/19 route smoke | `useSwap.ts`, wrapper quotes | RPC, DEX pools | Non-audited pairs may fail | MED | Keep audit gate |
| **Swap** | Route details | `RouteTransparencyCard` | Yes | **CONFIRMED** | Source | `RouteTransparencyCard.tsx` | Quote metadata | Less granular than 1inch path view | LOW | P16 route detail polish |
| **Swap** | Price impact | Swap intel + quote UI | Yes | **CONFIRMED** | Source | `SwapInterface.tsx` | Quote provider | Direct Uniswap may lack % | LOW | Document limitation |
| **Swap** | Slippage | Settings panel in swap | Yes | **CONFIRMED** | Source | `SwapInterface.tsx` | User setting | Default 0.5% | LOW | — |
| **Swap** | Minimum received | Quote display | Yes | **CONFIRMED** | Smoke assertions | `useSwap.ts` | Slippage math | — | LOW | — |
| **Swap** | Gas estimate | Preview + wallet | Yes | **PARTIALLY CONFIRMED** | Source | Wallet provider | Not always pre-shown in card | MED | P16 gas transparency |
| **Swap** | Approval flow | `useSwap` states | Yes | **CONFIRMED** source | Not live-tested (no sig) | `useSwap.ts` | ERC-20 allowance | Exact vs unlimited modes | MED | P15 approval clarity |
| **Swap** | Swap confirmation | `SwapPreviewModal` | Yes | **CONFIRMED** source | Not live-tested | `SwapPreviewModal.tsx` | Wallet | — | LOW | — |
| **Swap** | Tx pending / success / fail | `useSwap` status machine | Yes | **CONFIRMED** source | Unit tests partial | `useSwap.ts` | Wallet + RPC | No public tx history page | MED | P17 activity |
| **Wallet** | WalletConnect connect | `WalletConnect.tsx` + AppKit | Yes | **CONFIRMED** | P11/P12 ops scripts | `appkit.ts` | Reown WC | WC-only; no injected | LOW | — |
| **Wallet** | Read-only mode | `enterReadOnlyMode` | Yes | **CONFIRMED** | Source | `useWallet.ts` | RPC reads | Cannot swap/send | LOW | — |
| **Wallet** | Disconnect / reconnect | AppKit + sanitizer | Yes | **CONFIRMED** | Vitest sanitizer | `sanitizeAppKitPersistedState.ts` | localStorage | Stale connector risk mitigated P11 | LOW | — |
| **Wallet** | Wrong-network handling | `ChainWarningBanner` | Yes | **CONFIRMED** | Source | `ChainWarning.tsx` | Wallet switch | Banner dismissible | MED | P16 non-dismiss on swap |
| **Wallet** | Unsupported network | Commission banner | Yes | **CONFIRMED** | Source | `CommissionSwapChainBanner.tsx` | Chain config | Swap blocked on L2s | **HIGH** | P15 network truth UX |
| **Portfolio** | Holdings / allocation | Tab `portfolio` | Yes | **PARTIALLY CONFIRMED** | Not in smoke | `PortfolioPage.tsx` | RPC, CoinGecko proxy | Proxy-dependent | MED | Verify prod proxies |
| **Portfolio** | Activity / tx history | `ActivityPanel` | Yes | **PARTIALLY CONFIRMED** | Source | `activityService.ts` | Explorer proxy | Limited vs Etherscan | MED | P17 |
| **Send** | Token transfer | Tab `send` | Yes | **CONFIRMED** source | Not smoke-tested | `SendPage.tsx` | Wallet + RPC | Blocked in read-only | LOW | — |
| **Radar** | Token signals | Tab `radar` | Yes | **PARTIALLY CONFIRMED** | Health API up | `RadarPanel.tsx` | `/api/v1/signals` | GoPlus/DexScreener dependent | MED | Monitor signals health |
| **Radar** | Wallet scan | `WalletScan` | Yes | **PARTIALLY CONFIRMED** | Source | `walletScan/` | backend-signals | chains 1,56,137 | LOW | — |
| **Screener** | Market table | Tab `screener` | Yes | **PARTIALLY CONFIRMED** | CoinGecko proxy OK | `TokenScreener.tsx` | CoinGecko proxy | Not swap-integrated | LOW | Growth feature |
| **Trust** | Trust Center | `/trust` | Yes | **CONFIRMED** | HTTP 200 smoke | `TrustCenterPage.tsx` | Static copy | No third-party audit badge | LOW | P18 education |
| **Trust** | Contract addresses | Trust Center | Yes | **CONFIRMED** | Wrapper verify script | `TrustCenterPage.tsx` | On-chain | V1 legacy listed | LOW | — |
| **Trust** | Fee disclosure | Trust Center + swap UI | Yes | **CONFIRMED** | Commission audit | Copy + on-chain feeBps | Wrappers | ETH 20bps, BSC 50bps | LOW | — |
| **Legal** | Terms / Privacy / Disclaimer | `/terms`, `/privacy`, `/disclaimer` | Yes | **CONFIRMED** | HTTP 200 smoke | `StaticPages.tsx` | None | — | LOW | — |
| **Legal** | Terms gate before connect | `TermsGateModal` | Yes | **CONFIRMED** | Source | `WalletConnect.tsx` | localStorage | — | LOW | — |
| **Nav** | Primary command center | `TradeShell` header | Yes | **CONFIRMED** | Source | `productShell.ts` | — | Tabs not URL-routed | **HIGH** | P16 deep links |
| **Nav** | Footer | `DexSiteFooter` | Yes | **CONFIRMED** | Source | `DexSiteFooter.tsx` | System status | — | LOW | — |
| **SEO** | Meta / OG / sitemap | Static + client SEO | Yes | **CONFIRMED** | curl sitemap | `routeSeo.ts`, `index.html` | — | Tab routes not in sitemap | MED | P11 SEO |
| **Ops** | Admin dashboard | `/admin/*` | Operator | **CONFIRMED** | Source | `AdminApp.tsx` | Admin token API | Not user-facing | LOW | — |
| **Ops** | System status indicator | Footer | Yes | **PARTIALLY CONFIRMED** | Health 200 | `SystemStatusIndicator` | `/api/v1/health` | Signals schema | LOW | — |
| **Legacy** | Withdrawal UI | Not routed | No | **MISSING** from product | Source only | `WithdrawalInterface.tsx` | Python API | Custodial-era | LOW | Remove or document |
| **Legacy** | Python swap API | Not mounted | No | **NOT CONFIRMED** live | Source | `web/controllers/` | — | Repo drift | LOW | Phase 2 cleanup |

---

## Area summaries

### Core swap (CONFIRMED usable on production)

- Commission wrapper routing on ETH + BSC with **126/126** audited pair tests passing.
- P12.5 production smoke: **19/19** (HTTP routes, bundles, on-chain quotes, UI quote path, blocked PEPE pair).

### Optional surfaces (PARTIALLY CONFIRMED)

- Portfolio, Radar, Screener depend on same-origin proxies (`/rpc`, `/coingecko`, `/api/v1/signals`).
- Production health confirms signals engine running; CoinGecko proxy responded in baseline curl.

### Misleading / incomplete appearances

| Item | Classification |
|------|----------------|
| 6 networks in wallet selector vs 2 swap networks | **MISLEADING** without banner |
| Token lists on non-commission chains | **MISLEADING** if user expects swap |
| "Audited routes" marketing vs internal certification | **PARTIALLY CONFIRMED** — clarified in Trust Center |
| Protocol stats on homepage | **PARTIALLY CONFIRMED** — verify live data |

---

## Files referenced

- `frontend/src/App.tsx`, `TradeShell.tsx`, `SwapInterface.tsx`, `useSwap.ts`
- `frontend/src/constants/commissionChains.ts`, `popularCommissionRoutes.ts`
- `frontend/src/components/pages/TrustCenterPage.tsx`
- `docs/PRODUCT_TRUTH.md`, `docs/FEATURE_MATRIX.md`
