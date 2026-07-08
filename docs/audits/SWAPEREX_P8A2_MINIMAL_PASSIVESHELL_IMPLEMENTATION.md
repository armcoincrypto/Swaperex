# SWAPEREX P8A.2 — Minimal PassiveShell Implementation

**Date:** 2026-07-08  
**Status:** Implemented on `main` (not deployed unless separately approved)  
**Design:** `docs/audits/SWAPEREX_P8A1_PASSIVE_TRADE_SHELL_DESIGN.md`  
**Prereq:** P8A.0 cycle fix (`e97d752`)

---

## 1. What changed

Route-level branch in `App.tsx`:

| Path | Shell |
|------|--------|
| `/admin/*` | `LazyAdminApp` (unchanged) |
| `/trust`, `/about`, `/terms`, `/privacy`, `/disclaimer` | **PassiveShell** + lazy page |
| `/*` | **DexMain** (trade shell; behavior preserved) |

PassiveShell provides wallet-free chrome (logo, Trust + Open swap links, footer).  
DexMain unchanged for swap/send/portfolio/radar/screener, including **static** `SwapInterface`.

Footer trade-tab links from PassiveShell hand off via `navigate('/', { state: { dexPage, section } })`; DexMain consumes that once then clears state.

No `/learn` route created.

---

## 2. Files changed

| File | Role |
|------|------|
| `frontend/src/components/layout/PassiveShell.tsx` | **New** — wallet-free layout |
| `frontend/src/App.tsx` | Passive routes + `PassiveRoute`; DexMain location-state handoff |
| `docs/audits/SWAPEREX_P8A2_MINIMAL_PASSIVESHELL_IMPLEMENTATION.md` | This audit |

**Not changed:** `SwapInterface`, `useSwap`, connectors, AppKit, WalletBootstrap modules, commission/wrappers/contracts/tokens.

---

## 3. Passive / trade route lists

**Passive:** `/trust`, `/about`, `/terms`, `/privacy`, `/disclaimer`  
**Trade (DexMain):** `/` and all in-app tabs (swap, send, portfolio, radar, screener)  
**Admin:** `/admin/*`

---

## 4. Proof PassiveShell is wallet-free

```bash
grep -RnE "useWallet|from '@/wallet|WalletBootstrap|NetworkSelector|SwapInterface|AppKit|from 'ethers|from \"ethers" \
  frontend/src/components/layout/PassiveShell.tsx
# → no matches (CLEAN)
```

Imports are limited to React, react-router, `DexSiteFooter`, `applyClientRouteSeo`.  
`DexSiteFooter` / `SystemStatusIndicator` do not import wallet/ethers.

At runtime, Passive routes do **not** mount `DexMain`, so they do not call `useWallet()` / autoReconnect in that tree.

---

## 5. Proof SwapInterface remains static

```tsx
import { SwapInterface } from '@/components/swap/SwapInterface';
// …
<SwapInterface />
```

No `lazy(() => import(…SwapInterface))` (P7C not reapplied).

---

## 6. Validation results

| Check | Result |
|-------|--------|
| `git diff --check` | Pass |
| `npm --prefix frontend run build` | Pass |
| `verify-wrappers.sh` | ALL CHECKS PASSED |
| `audit-commission-pairs.mjs` | PASS 126 / FAIL 0 / BLOCKED 0 |
| `.venv/bin/pytest` | 119 passed, 3 skipped |

---

## 7. Preview / Playwright smoke

Local `serve dist` + Playwright (Chromium snap, `--no-sandbox`):

| Path | `#root > *` | pageerror | Content check |
|------|-------------|-----------|---------------|
| `/` | 1 | none | Trade / Swap UI |
| `/trust` | 1 | none | Trust Center |
| `/about` | 1 | none | About Kobbex DEX |
| `/terms` | 1 | none | Terms of Use |
| `/privacy` | 1 | none | Privacy Policy |
| `/disclaimer` | 1 | none | Disclaimer |

---

## 8. Bundle impact (honest)

This phase is **mount-boundary** first, not full async TradeShell splitting.

- Entry `index-*.js` remains ~500 KB and still includes DexMain + static SwapInterface because they are static imports of the same `App.tsx` module graph.
- Cold `/trust` **does not mount** wallet hooks, but the shared entry **may still download/parse** ethers/swap code until a later phase lazy-loads `DexMain` as a whole (without lazy SwapInterface alone).

Documented follow-on (not this commit): `lazy(() => import('./TradeShell'))` wrapping today’s DexMain.

---

## 9. Risk notes

- Passive → Trade reconnect still starts when DexMain mounts (intended).
- Footer SPA tabs from Passive use location state; replace-clear must stay correct.
- Shared entry size is not a P8A.2 success metric; wallet-free **component** and non-mount of DexMain are.
- Do not “fix” remaining entry weight by reintroducing P7C-style lazy SwapInterface.

---

## 10. Deployment recommendation

**Do not deploy** until explicitly approved after review.  
Optional later: deploy with P8A.0 cycle fix in the same static bundle when approved.

---

## 11. Rollback plan

```text
1. Revert the P8A.2 commit(s) (App.tsx + PassiveShell.tsx + this doc).
2. Redeploy previous static frontend artifact / commit.
3. Do not rollback by re-adding lazy SwapInterface.
```

---

## 12. Next phase

```text
P8A.3 — Lazy TradeShell module boundary (lazy import DexMain/TradeShell as a unit)
so passive cold loads can omit ethers/swap from the initial JS graph —
still without lazy SwapInterface alone.
```

*End of P8A.2 implementation note.*
