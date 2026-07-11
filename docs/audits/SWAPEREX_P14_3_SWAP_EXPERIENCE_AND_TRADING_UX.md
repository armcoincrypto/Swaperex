# SWAPEREX P14.3 — Swap Experience and Trading UX Audit

**Program:** P14 | **Date:** 2026-07-10 | **Production:** `eee0264`

---

## Verdict

**P14_3_SWAP_UX_FUNCTIONAL_BUT_INCOMPLETE**

---

## What is already strong

1. **Audited commission routing** — 126 pair tests pass; smoke confirms ETH/BSC majors.
2. **Pre-sign preview** — `SwapPreviewModal` with route transparency, slippage, minimum received.
3. **Quote expiry discipline** — Explicit refresh flow; stale quote execution blocked.
4. **Approval modes** — Exact vs unlimited with warning copy.
5. **Blocked pair handling** — PEPE and non-audit pairs fail safely in smoke.
6. **Swap intelligence panel** — Contextual slippage/impact guidance.
7. **Featured / popular routes** — One-click pair prefill from verified catalog.

---

## What is acceptable

- Default slippage 0.5% with presets and custom input
- Token search and route-support badges in selector
- Commission chain banner when on non-swap network
- Read-only mode clearly blocks swap CTA
- Loading skeletons and `aria-live` quote updates

---

## What is weak

| Area | Issue | Severity |
|------|-------|----------|
| Network selector vs swap capability | User can select Polygon/Arbitrum but cannot commission-swap | **HIGH** |
| Gas transparency | Not consistently shown before wallet opens | **MEDIUM** |
| Price impact | Missing or "no trustworthy impact" on some direct quotes | **MEDIUM** |
| Route visualization | Provider name yes; hop-by-hop pool path no | **MEDIUM** |
| Transaction history | Local/history store only; no persistent explorer-linked feed | **MEDIUM** |
| Information density | Advanced details collapsed; power users must expand | **LOW** |
| Brand naming | Swaperex vs Kobbex DEX in SEO titles | **LOW** |

---

## What is missing (vs mature DEX expectations)

- Limit orders, TWAP, cross-chain
- MEV / private tx options
- Permit2 / gasless approvals
- Portfolio-linked swap from holdings row
- Public swap volume / TVL stats (intentionally omitted — good)
- Multi-hop route comparison UI

---

## What should be redesigned (future phases)

1. **Network tier UX** — Separate "Swap networks" from "Balance view" in selector (P15/P16).
2. **Gas + total cost row** — Always visible when quote ready (P16).
3. **Post-swap receipt** — Explorer link + save to activity (P17).
4. **Mobile swap settings** — Bottom sheet for slippage/approval (P16).

---

## What must not be changed (without separate approval)

- Commission wrapper routing logic and fee bps
- Quote provider selection for audited pairs
- WalletConnect-only connector policy (P11 certified)
- AppKit persisted state sanitizer
- Production wrapper contract addresses
- Audit-gated pair allowlist

---

## Transaction state machine (source confirmed)

From `useSwap.ts`:

```
idle → fetching_quote → checking_allowance → previewing
     → approving → swapping → confirming → success | error
```

Additional: quote expired, wrong chain, read-only blocked, insufficient balance.

| State | User clarity | Status |
|-------|--------------|--------|
| Idle | Clear | OK |
| Loading quote | Spinner + live region | OK |
| Quote ready | Output + rate shown | OK |
| Approval required | "2 transactions" message | OK |
| Pending wallet | Depends on wallet UI | Acceptable |
| Success | Toast + history store | OK |
| Error | Global error + retry where applicable | OK |

---

## Competitive reference (conceptual)

| Dimension | Swaperex | Mature DEX |
|-----------|----------|------------|
| Quote speed | ~40–140ms smoke | Competitive |
| Route transparency | Moderate | Below Uniswap/1inch |
| Network breadth (swap) | 2 chains | Below market |
| Approval UX | Exact/unlimited | Competitive |
| Mobile | Functional; WC deferred QA | Below Pancake mobile |
| Trust copy | Strong Trust Center | Competitive for size |
