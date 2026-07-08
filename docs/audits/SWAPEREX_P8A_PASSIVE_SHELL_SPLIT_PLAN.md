# SWAPEREX P8A — Passive Shell Split Plan

**Date:** 2026-07-08  
**Live baseline:** `3d2944c`  
**Prior phase:** P7C swap route splitting (LIVE)  
**Mode:** Plan only — do not implement wallet init changes in this doc

---

## Executive Summary

P7C removed the swap stack from the entry bundle. The remaining first-load cost that hurts passive pages (`/trust`, `/about`, legal pages) is:

```text
vendor-ethers (~395 KB / ~146 KB gzip) — still modulepreloaded in index.html
```

**Root cause:** `DexMain` in `App.tsx` eagerly calls `useWallet()`, and the header always mounts `NetworkSelector` (which also uses `useWallet`). `useWallet` statically imports `ethers` (`BrowserProvider`, `JsonRpcSigner`, `isAddress`) and runs `autoReconnect()` on mount.

**P8A goal:** keep ethers/useWallet off the critical path for cold, disconnected visits to passive routes — without breaking WalletConnect reconnect.

---

## Current Problem

### Live entry graph (post-P7C)

From `/var/www/swaperex/index.html`:

```html
<script type="module" src="/assets/index-BikRjnJw.js"></script>
<link rel="modulepreload" href="/assets/vendor-react-*.js">
<link rel="modulepreload" href="/assets/vendor-ethers-*.js">
```

| Chunk | Role | Passive cold load |
|-------|------|------------------|
| `index-BikRjnJw.js` (~212 KB) | Dex shell | Yes |
| `vendor-react` (~146 KB) | React | Yes |
| `vendor-ethers` (~395 KB) | ethers | Yes (problem) |
| `SwapInterface-*.js` (~225 KB) | Swap UI | **No** (P7C) |
| `vendor-reown-walletconnect` (~2.6 MB) | AppKit/WC | **No** (already lazy) |

### Why ethers is still initial

```
App.tsx → DexMain
  ├─ useWallet()                          // EAGER — every DexMain route
  │    └─ import { BrowserProvider, ... } from 'ethers'
  │    └─ autoReconnect() on mount
  ├─ NetworkSelector                      // EAGER in header
  │    └─ useWallet()
  └─ LazyWalletConnect / WalletBootstrap  // already deferred (P4.4 / P7B)
```

Passive routes (`trust`, `about`, `terms`, `privacy`, `disclaimer`) still mount the full `DexMain` shell, so they pay for ethers + reconnect scan even though they never render swap UI.

---

## Safe Route Classification

| Route / page | Needs connected wallet UI? | Needs autoReconnect on entry? | P8A target shell |
|--------------|----------------------------|-------------------------------|------------------|
| `/trust`, About, Terms, Privacy, Disclaimer | No | No | **Passive shell** (no useWallet) |
| `/` swap tab | Yes | Yes | Trade shell |
| Send | Yes | Yes | Trade shell |
| Portfolio | Yes (balances) | Yes | Trade shell |
| Radar / Screener | Optional (scan tools) | Soft-yes if connected | **Hybrid** — defer wallet until interaction |
| `/admin/*` | Separate token auth | N/A | Already separate |

---

## Proposed No-Wallet Passive Shell

### Option A — Page-gated hooks (preferred first slice)

Keep one `DexMain`, but:

1. Split header into `PassiveHeader` vs `TradeHeader`.
2. On passive pages:
   - Render `PassiveHeader` (logo + nav links only; “Open swap” CTA).
   - Do **not** mount `NetworkSelector` or call `useWallet()`.
3. On trade pages:
   - Mount current header + `useWallet` + existing wallet chunk gates.
4. Keep `shouldLoadHeaderWalletChunk` and WalletBootstrap deferral as-is.

**Benefit:** removes ethers from entry **only if** entry no longer statically imports `useWallet` / `NetworkSelector` for all routes. Likely needs route-level code splitting of DexMain itself, or a separate `PassiveLayout` route branch in `App.tsx`.

### Option B — Route branch in `App.tsx` (cleaner bundle boundary)

```tsx
<Routes>
  <Route path="/admin/*" element={<LazyAdminApp />} />
  <Route path="/trust" element={<PassiveShell><LazyTrust /></PassiveShell>} />
  <Route path="/about|terms|privacy|disclaimer" element={<PassiveShell>...</PassiveShell>} />
  <Route path="/*" element={<TradeShell />} />  // DexMain as today
</Routes>
```

**PassiveShell:** footer + static page, zero wallet imports.  
**TradeShell:** current DexMain.

**Benefit:** Rollup can exclude ethers from passive entry/chunk graph more reliably.  
**Risk:** duplicate chrome (nav/footer) unless shared presentational components have zero wallet deps.

### Option C — Thin Zustand facade in shell (not recommended alone)

Keep reading `useWalletStore` in shell (tiny) but move provider/reconnect into trade routes. Still need to ensure `useWallet.ts` is not imported by passive tree, or ethers remains.

---

## Reconnect Risks

`useWallet` currently:

- imports ethers at module scope
- calls `autoReconnect()` once on mount
- participates AppKit open/disconnect via registry (not `@reown` imports)

Moving away from eager `useWallet` can break:

1. Returning WC users who land on `/trust` then go to swap — session must restore when trade shell mounts, not silently fail.
2. Storage-hint path (`hasWalletConnectStorageHint` + idle WalletBootstrap request) — today lives in DexMain; must be duplicated or moved carefully.
3. Read-only address sessions (`isReadOnly`) — header gating depends on this.
4. Chain warning banner — only after connect; safe to omit on passive.

**Hard rule for implementation:** do not change `initAppKit()`, WalletBootstrap module-load init, or AppKitBridge. Only change **which route tree mounts** useWallet.

---

## Required QA Matrix (P8B before/with P8A ship)

| Scenario | Expected |
|----------|----------|
| Fresh disconnected visitor `/trust` | No `vendor-ethers` *if* Option B lands; Network: no SwapInterface, no reown |
| Fresh `/` swap | SwapInterface lazy load; quotes work; connect works |
| Previously connected WC user lands `/trust` then clicks Swap | Session restores on trade shell |
| Previously connected WC user lands `/` | Restores as today |
| Stale `swaperex_last_connector=walletconnect` | Legacy autoReconnect path when trade shell mounts |
| Injected wallet | Still disabled in UI; no regression toast loops |
| Passive → Trade navigation | No blank header; network selector appears when needed |
| Admin routes | Unchanged |

---

## Implementation Options (ranked)

| Priority | Slice | Ethers off passive? | Reconnect risk | Notes |
|----------|-------|---------------------|----------------|-------|
| **P8A.1** | Option B route branch + PassiveShell | Yes (best) | Medium | Clearest bundle boundary |
| **P8A.2** | Lazy NetworkSelector behind trade-only | Partial | Low | Alone cannot drop ethers if useWallet stays in DexMain |
| **P8A.3** | Gate `autoReconnect` to trade routes only | No bundle win | Medium-High | Behavior-only; still plan in P8B |
| **P8A.4** | Defer initAppKit further | No | High | **Out of scope** for P8A |

---

## Recommendation

1. **Do not implement P8A wallet changes yet.**
2. Complete **operator browser QA** for P7C (Network tab on `/trust` vs `/`).
3. Next implementation: **P8A.1 PassiveShell route branch** — static marketing pages under a wallet-free layout.
4. Parallel: **P8B reconnect QA matrix** before merging P8A.1.
5. Keep `vendor-reown` lazy as-is; do not chase AppKit deferral until P8A.1 proven.

**Success metric for P8A.1:**

```text
Cold /trust index.html / initial graph does not modulepreload vendor-ethers.
Swap route still modulepreloads or fetches ethers when TradeShell loads.
Reconnect matrix green.
```

---

## Non-goals

- Changing quote/swap/commission logic
- Removing WalletConnect
- Deploy pipeline work
- Featured pairs (wait for P5 ≥10 quotes / 7d)

---

*End of P8A plan.*
