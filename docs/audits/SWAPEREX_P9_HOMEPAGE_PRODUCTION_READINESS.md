# SWAPEREX P9 — Homepage Production Readiness / Premium UX Upgrade

**Date:** 2026-07-09  
**Base commit:** `7c0532b` (P8D cert doc; production live at `ff6460d`)  
**Scope:** Presentational / product UX only on trade homepage (`/` swap tab)  
**Verdict:** `P9_READY_FOR_PREVIEW_QA`

---

## 1. What changed

### P9.1 — Hero trust strip
- Added compact pill strip above swap workspace: Self-Custody, Audited Routes, Live Quotes, No Registration, Ethereum & BNB Chain.
- Fixed `min-h` to avoid layout shift; screen-reader full sentence via `sr-only`.

### P9.2 — Premium product hero layer
- CSS-only gradient mesh, soft glow, glass-style stat/why cards, swap panel ring accent.
- `prefers-reduced-motion: reduce` lowers decorative glow opacity.
- No canvas, WebGL, video, or new animation libraries.

### P9.3 — Protocol statistics cards
- Four static credibility cards driven from `COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS.size` (42), 2 networks, 100% self-custody, 0 seed phrase access.
- Fee line: Ethereum 0.20%, BNB Chain 0.50% (matches Trust Center).

### P9.4 — Why Swaperex
- Three trust cards below swap workspace: Self-Custody, Audited Routes, Transparent Fees.

### P9.5 — Route confidence copy
- Display-only label/description updates in `routingDisplayStatus.ts` and `routePrecheck.ts`.
- Example: “Likely routable” → “Audited route available”; success quote badge helper → “Wrapper route supported”.
- No execution guarantees; liquidity caveat retained.

### P9.6 — Popular audited routes
- Read-only panel from `getVerifiedPopularCommissionRoutes()` — no fake activity/volume feed.
- Explicit disclaimer that list is audit catalog, not live swap activity.

### P9.7 — Footer authority
- “Routing infrastructure” integrations line: Uniswap V3 · PancakeSwap V3 · WalletConnect · GoPlus.
- Non-partnership disclaimer text.

---

## 2. Files changed

| File | Change |
|------|--------|
| `frontend/src/constants/homepageProductCopy.ts` | **New** — static product copy/constants |
| `frontend/src/components/homepage/HomepageTrustStrip.tsx` | **New** |
| `frontend/src/components/homepage/HomepageHeroWorkspace.tsx` | **New** |
| `frontend/src/components/homepage/HomepageProtocolStats.tsx` | **New** |
| `frontend/src/components/homepage/HomepageWhySwaperex.tsx` | **New** |
| `frontend/src/components/homepage/HomepagePopularRoutes.tsx` | **New** |
| `frontend/src/components/layout/TradeShell.tsx` | Wire homepage sections on swap tab only |
| `frontend/src/components/layout/DexSiteFooter.tsx` | Integrations / routing infrastructure block |
| `frontend/src/index.css` | P9 homepage CSS utilities |
| `frontend/src/utils/routingDisplayStatus.ts` | Route confidence display copy |
| `frontend/src/utils/routePrecheck.ts` | Precheck badge/description copy |

---

## 3. Intentionally not changed

- Swap execution, quote, approval/sign/confirm logic
- WalletConnect / AppKit setup, connectors, autoReconnect
- Wrapper contracts, commission logic, token registry, backend, routing engine
- P8A architecture: PassiveShell wallet-free; TradeShell lazy boundary; SwapInterface static inside TradeShell
- No direct lazy-load of `SwapInterface`
- No new npm production dependencies

---

## 4. Before / after UX assessment

| Area | Before (P8D) | After (P9) |
|------|----------------|------------|
| First impression | Functional swap tool; weak product hierarchy | Trust strip + hero polish immediately frames value |
| Credibility | Mostly inside swap card / Trust Center | Above-fold stats + Why Swaperex + popular routes |
| Route language | “Likely routable” felt tentative | “Audited route available” + liquidity caveat |
| Footer | Links + networks | Adds routing infrastructure references with disclaimer |
| Visual quality | Minimal shell chrome | Stripe/Linear-style glass + gradient mesh (CSS-only) |

---

## 5. Mobile validation

Playwright @ `serve dist` `127.0.0.1:4173`:

| Width | Horizontal overflow | Swap usable | Trust pills |
|-------|---------------------|-------------|-------------|
| 375px | No | Yes | 5 |
| 390px | No | Yes | 5 |
| 430px | No | Yes | 5 |
| 768px | No | Yes | 5 |

---

## 6. Build / test results

| Gate | Result |
|------|--------|
| `git diff --check` | PASS |
| `npm --prefix frontend run build` | PASS (TradeShell ~417 KB gzip ~115 KB; entry ~56 KB) |
| `bash scripts/audit/verify-wrappers.sh` | PASS |
| `node scripts/audit/audit-commission-pairs.mjs` | PASS 126 / FAIL 0 |
| `.venv/bin/pytest` | PASS 119, skip 3 |
| Playwright route matrix | PASS (see §7) |

---

## 7. Playwright route matrix

| Route | `#root > *` | pageerror | TradeShell | ethers |
|-------|-------------|-----------|------------|--------|
| `/` | 1 | none | yes | yes |
| `/trust` | 1 | none | no | no |
| `/about` | 1 | none | no | no |
| `/privacy` | 1 | none | no | no |
| `/disclaimer` | 1 | none | no | no |

P9 homepage markers on `/`: trust strip, hero workspace, stats, why section, popular routes, footer integrations — all present.

---

## 8. Wallet architecture safety

- **PassiveShell:** unchanged; passive routes still skip TradeShell/ethers on cold load.
- **TradeShell:** only added static presentational imports; `SwapInterface` remains static import inside TradeShell.
- **Wallet / quote hooks:** untouched.
- **No TDZ / blank `#root`:** automated smoke clean on `/` and passive routes.

---

## 9. Known warnings

- WalletConnect / Reown SDK console noise (pre-existing; external).
- Rollup chunk size advisory for `vendor-reown-walletconnect` (pre-existing).
- `SwapExecutionRail` still uses “Route ready” when a live quote exists — intentional; distinct from pre-quote heuristic badges updated in P9.5.
- P9 changes are **uncommitted** at audit time; production remains `ff6460d` until preview QA approval.

---

## 10. Deploy readiness

**Do not deploy to production** until operator preview QA on a staging/preview build (wallet connect, refresh, quote-only, mobile spot check).

Recommended next step: commit P9 → preview deploy → manual wallet smoke (P8B checklist) → then production approval gate.

---

## 11. Final verdict

**`P9_READY_FOR_PREVIEW_QA`**

Presentational homepage upgrade complete; all automated gates pass; wallet/quote/routing architecture preserved.
