# Portfolio v2 Audit Report

**Auditor**: Staff Engineer Audit
**Date**: 2026-02-10
**Scope**: Portfolio v2 (commit `affbb05` on `claude/explore-codebase-tbXec`)
**Status**: Audit Complete — fixes implemented

---

## 1. Current Behavior Overview

Portfolio v2 provides multi-chain balance aggregation (ETH + BSC + Polygon) with:

- **PortfolioPage** orchestrates `usePortfolio` hook, syncs to `portfolioStore`, auto-refreshes every 30s
- **PortfolioHeader** shows total USD, per-chain chips, privacy toggle, hide small balances
- **PortfolioTokenTable** displays flattened, filterable, sortable token list with hover actions
- **ActivityPanel** merges local swap history (localStorage) with blockchain explorer data (Etherscan/BscScan)
- **portfolioStore** persists snapshot (10-min TTL), sort/filter prefs, privacy mode
- **activityService** normalizes, deduplicates (by txHash, local wins), exports CSV/JSON

Data flow:
```
usePortfolio hook → RPC (evmBalanceService) → CoinGecko (priceService)
                  ↓
PortfolioPage syncs → portfolioStore (+ localStorage snapshot)
                  ↓
PortfolioHeader / PortfolioTokenTable / ActivityPanel (read from store)
```

---

## 2. Findings

### 2.1 Functional Correctness

| ID | Severity | Finding | File:Line |
|----|----------|---------|-----------|
| F1 | **P0** | `PortfolioPage` subscribes to entire store via `usePortfolioStore()` — every keystroke in search, every sort toggle, every loading flip causes full component tree re-render (including ActivityPanel re-fetch) | `PortfolioPage.tsx:29` |
| F2 | **P0** | `fetchActivity` captures stale `localRecords` — new swaps recorded after initial fetch never appear in merged activity until address/chain changes | `ActivityPanel.tsx:37-61` |
| F3 | **P0** | Snapshot hydration calls `setPortfolio(snapshot)` which re-stamps `snapshotAt = Date.now()` — snapshot never expires, stale data persists forever | `PortfolioPage.tsx:75-77` + `portfolioStore.ts:70-78` |
| F4 | **P0** | Privacy mode leaks real USD values in chain chip tooltips (`title` attribute) | `PortfolioHeader.tsx:108` |
| F5 | **P1** | No concurrent refresh guard — multiple `fetchPortfolio()` calls can run simultaneously (30s interval + manual click), causing RPC rate limit risk and race conditions | `PortfolioPage.tsx:81-89` |
| F6 | **P1** | ActivityPanel hardcodes `chainIds = [1, 56]` — Polygon (137) activity never fetched even though it's a supported portfolio chain | `ActivityPanel.tsx:47` |

### 2.2 Data Integrity & Dedup Logic

| ID | Severity | Finding |
|----|----------|---------|
| D1 | OK | `mergeLocalAndExplorer` correctly deduplicates by txHash (case-insensitive), local wins |
| D2 | OK | Export JSON correctly strips `localRecord` to avoid internal data exposure |
| D3 | **P1** | CSV export doesn't quote `txHash` or `explorerUrl` fields — safe today (hex strings/URLs), but violates CSV spec |
| D4 | OK | `SwapRecord.txHash` dedup in swapHistoryStore prevents local duplicates |

### 2.3 Pricing Correctness

| ID | Severity | Finding |
|----|----------|---------|
| P1 | OK | CoinGecko prices cached 1 minute (module-level `priceCache`), prevents rapid re-fetch |
| P2 | OK | Tokens with null `usdValue` display "—" instead of $0 — correct |
| P3 | OK | `applyPricesToChainBalance` sums only non-null USD values — correct |
| P4 | **P2** | Tokens not in `COINGECKO_IDS` map get no price silently — no indication to user |
| P5 | OK | `formatUsdPrivate` handles NaN → returns `$0.00` |

### 2.4 Multi-Chain Correctness

| ID | Severity | Finding |
|----|----------|---------|
| M1 | OK | `flattenPortfolioTokens` correctly iterates chains, skips null |
| M2 | OK | `getChainTotals` correctly parses per-chain `totalUsdValue` |
| M3 | **P2** | `PORTFOLIO_CHAIN_IDS['solana']` returns string `'solana'` — PortfolioTokenTable falls back to chainId=1, would show Ethereum explorer links for Solana tokens | `PortfolioTokenTable.tsx:152-154` |
| M4 | OK | `fetchMultiEvmBalances` uses `Promise.all` with per-chain error handling — individual chain failures don't break others |

### 2.5 UX Clarity & User Trust

| ID | Severity | Finding |
|----|----------|---------|
| U1 | **P1** | No per-chain status indicators — user can't tell if a chain's data is fresh, stale, or failed without hovering error chips | All chain chips |
| U2 | OK | Loading skeleton shows 4 placeholder rows — professional |
| U3 | OK | Empty states differentiate search miss, threshold filter, no tokens |
| U4 | **P2** | `formatTokenBalance` has dead code: `if (num < 1)` is subset of `if (num < 1000)` — both return `toFixed(4)` | `PortfolioTokenTable.tsx:291-293` |
| U5 | OK | Privacy mode hides both balance and USD in token rows |
| U6 | OK | Relative time ("just now", "1m ago") updates every 30s in header |

### 2.6 Performance

| ID | Severity | Finding |
|----|----------|---------|
| R1 | **P0** | Full store subscription in PortfolioPage → re-render storm (see F1) |
| R2 | **P1** | `displayTokens` in PortfolioTokenTable correctly uses `useMemo` — good |
| R3 | OK | Token balance fetching batches by 5 (`evmBalanceService.ts:173`) — avoids RPC flood |
| R4 | **P2** | `getRecentRecords(100)` called every render in ActivityPanel body — creates new array reference each time |
| R5 | OK | Price cache prevents duplicate CoinGecko calls within 1 minute |
| R6 | **P2** | Chain chip `Set()` for counting unique chains recalculated twice (line 121) — minor |

### 2.7 Resilience

| ID | Severity | Finding |
|----|----------|---------|
| E1 | OK | `usePortfolio` has retry with exponential backoff (2 retries for RPC, 1 for price) |
| E2 | OK | `fetchEvmChainBalance` returns ChainBalance with error field on failure — never throws |
| E3 | OK | `getRecentTransactions` returns empty array on failure — never throws |
| E4 | **P1** | ActivityPanel error state shows "Failed to load" but doesn't indicate which chains failed |
| E5 | OK | ActivityPanel falls back to local-only on explorer failure — graceful degradation |

### 2.8 Security / Privacy

| ID | Severity | Finding |
|----|----------|---------|
| S1 | **P0** | Privacy mode leak in tooltip (see F4) |
| S2 | **P1** | Privacy mode doesn't affect CSV/JSON exports — user can export real values while in privacy mode |
| S3 | OK | localStorage contains only balances/preferences — no secrets, no private keys |
| S4 | OK | `logPortfolioLifecycle` truncates address to first 10 chars — adequate redaction |
| S5 | OK | No full address in `console.error` calls within portfolio components |
| S6 | OK | Portfolio snapshot in localStorage is read-only balance data — safe |

### 2.9 Code Quality

| ID | Severity | Finding |
|----|----------|---------|
| C1 | **P2** | `CHAIN_LABELS` duplicated in 5 locations (portfolioStore ×2, activityService, ActivityPanel, watchlistStore) |
| C2 | **P2** | `formatTokenBalance` dead code branch (see U4) |
| C3 | OK | Types are clean — no `any` in portfolio code |
| C4 | OK | All helpers are pure functions, easily testable |

---

## 3. Bug List (with reproduction)

### BUG-1: Store subscription re-render storm (P0)
**Repro**: Open Portfolio → type in search box → observe entire page flickers / ActivityPanel re-fetches
**Root cause**: `const store = usePortfolioStore()` subscribes to all state
**Impact**: 5-10x unnecessary re-renders per user interaction

### BUG-2: Stale localRecords in activity merge (P0)
**Repro**: Do a swap → go to Portfolio → Activity tab shows old data → click Refresh → still old data
**Root cause**: `useCallback` deps missing `localRecords`; stale closure
**Impact**: New swaps invisible in activity until page reload

### BUG-3: Snapshot never expires (P0)
**Repro**: Load portfolio → wait 15 minutes → reload page → see "Updated just now" with 15-min-old data
**Root cause**: `setPortfolio` always re-stamps `snapshotAt`
**Impact**: Users may see stale balances and believe they're current

### BUG-4: Privacy mode tooltip leak (P0)
**Repro**: Enable privacy mode → hover over "BSC: ****" chip → tooltip shows "BSC: $0.72"
**Root cause**: Tooltip uses `total.toFixed(2)` without checking `privacyMode`
**Impact**: USD values visible to shoulder-surfers

### BUG-5: Concurrent refresh race condition (P1)
**Repro**: Click Refresh rapidly 5 times → observe 5 parallel RPC calls in Network tab
**Root cause**: No guard against concurrent `fetchPortfolio()` calls
**Impact**: Rate limiting, wasted bandwidth, potential state race

---

## 4. Risk Assessment

| Scenario | Risk | Mitigation |
|----------|------|------------|
| CoinGecko rate limit (free tier: 10-30 calls/min) | Medium | 1-min cache helps, but 3 chains × 30s refresh can hit limit |
| RPC public endpoint unreliable | Low | Retry logic + per-chain error handling in place |
| Large token list causing slow load | Low | Batch-of-5 fetching + only non-zero balances displayed |
| Privacy-sensitive user | **High** | Tooltip leak exposes real values (BUG-4) |
| User returns after hours | Medium | Stale snapshot shown as fresh (BUG-3) |

---

## 5. Prioritized Improvement Plan

### P0 — Must Fix (breaking bugs)

- [x] **FIX-1**: Replace `usePortfolioStore()` with individual selectors in PortfolioPage
- [x] **FIX-2**: Fix stale `localRecords` by reading from store directly inside callback
- [x] **FIX-3**: Add `hydrateFromSnapshot` action that doesn't re-stamp `snapshotAt`
- [x] **FIX-4**: Apply `formatUsdPrivate` to tooltip text in PortfolioHeader
- [x] **FIX-5**: Add refresh-in-progress guard (skip if already loading)

### P1 — Should Fix (important improvements)

- [x] **FIX-6**: Add Polygon (137) to ActivityPanel chain IDs
- [x] **FIX-7**: Per-chain status chips with tooltip showing error/last update
- [ ] **FIX-8**: Warn user when exporting in privacy mode (out of scope — minimal risk)

### P2 — Nice to Have (polish)

- [ ] Consolidate CHAIN_LABELS to single constants module
- [ ] Clean up `formatTokenBalance` dead code branch
- [ ] Add missing test: token with null usdValue in sort
- [ ] Add missing test: null txHash in merge

---

## 6. Implementation Checklist

### Implemented in this audit:

1. **PortfolioPage.tsx** — Replace `usePortfolioStore()` with individual selectors; add refresh guard
2. **portfolioStore.ts** — Add `hydrateFromSnapshot` action (no re-stamp)
3. **ActivityPanel.tsx** — Fix stale localRecords; add Polygon to chain IDs
4. **PortfolioHeader.tsx** — Fix privacy leak in tooltips; add per-chain status indicators
5. **Tests** — Add tests for new helpers and edge cases
6. **Build** — Verify tsc + vitest + vite build pass

---

*End of audit report.*
