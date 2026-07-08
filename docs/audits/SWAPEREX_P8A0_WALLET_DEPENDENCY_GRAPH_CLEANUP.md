# SWAPEREX P8A.0 — Wallet Dependency Graph Cleanup

**Date:** 2026-07-08  
**Status:** Implemented on `main` (docs + import fix). **Not deployed** unless separately approved.  
**Production at write time:** Still `14cbf64` (P7C reverted). Trust Center + P5 live.  
**Related:** `docs/audits/SWAPEREX_P7C_RCA_VITE_TDZ_CIRCULAR_DEPENDENCY.md`

---

## 1. Problem summary

P7C lazy-loading `SwapInterface` exposed a latent ESM cycle. Rollup ordered
`wallet/connectors.ts` (which reads `WALLETCONNECT_PROJECT_ID`) before that
`const` finished initializing in the same entry chunk → TDZ blank page
(`Cannot access 'hr' before initialization`).

P8A.0 breaks that cycle with a **leaf import** so future PassiveShell / TradeShell
splits do not re-trigger the same TDZ. This is **not** a performance ship phase.

---

## 2. Exact old dependency cycle

```text
frontend/src/utils/constants.ts
  → import { CHAINS, SUPPORTED_CHAIN_IDS } from '@/wallet'   // barrel
      → wallet/index.ts
          → export … from './connectors'
              → wallet/connectors.ts
                  → import { WALLETCONNECT_PROJECT_ID } from '@/utils/constants'
```

Cycle:

```text
constants.ts ↔ wallet barrel ↔ connectors.ts ↔ constants.ts
```

---

## 3. Exact new dependency graph

```text
utils/constants.ts
  → import { … } from '@/wallet/chains'   // leaf only
      → wallet/chains.ts
          → @/config/rpc, ./types
          (does NOT import connectors or constants)

wallet/connectors.ts
  → import { WALLETCONNECT_PROJECT_ID } from '@/utils/constants'  // one-way OK
  → import { … } from './chains'

wallet/index.ts
  → re-exports chains + connectors (unchanged public API)
```

After:

```text
constants.ts → wallet/chains.ts
connectors.ts → constants.ts
No path from constants.ts back to connectors.ts
```

BFS over resolved `@/` / relative imports: **0 cycles** involving this subgraph;
`constants` no longer reaches `connectors.ts` or `wallet/index.ts`.

---

## 4. Files changed

| File | Change |
| --- | --- |
| `frontend/src/utils/constants.ts` | `@/wallet` → `@/wallet/chains` + anti-barrel comment |
| `docs/audits/SWAPEREX_P8A0_WALLET_DEPENDENCY_GRAPH_CLEANUP.md` | This audit |

**Not changed:** `wallet/index.ts`, `wallet/chains.ts`, `connectors.ts`, AppKit,
autoReconnect, `useSwap`, `SwapInterface`, commission/wrappers/contracts/tokens.

---

## 5. Why behavior is unchanged

- Same exports from `wallet/chains.ts` (`CHAINS` array, `SUPPORTED_CHAIN_IDS`).
- Same re-shape in `utils/constants.ts` (keyed `CHAINS` object + ID list).
- Same env-derived `WALLETCONNECT_PROJECT_ID` / `HAS_WALLETCONNECT_PROJECT_ID`.
- No runtime string / chain ID / connector / AppKit logic edits.
- App still **statically** imports `SwapInterface` (P7C not reapplied on main).

---

## 6. P7C local repro after cycle fix

Temporary branch `test/p8a0-cycle-fix-p7c-repro`:

1. Cycle-fix commit
2. Cherry-pick `bac05c0` (lazy `SwapInterface`) — **not merged to main**
3. `npm --prefix frontend run build`
4. Serve `dist` + Playwright (Chromium snap, `--no-sandbox`)

| URL | `#root > *` | pageerror |
| --- | --- | --- |
| `/` | 1 | none |
| `/trust` | 1 | none |

Entry ~212 KB + separate `SwapInterface-*.js` (~220 KB). TDZ previously seen
without the cycle fix did **not** recur.

Main kept static `SwapInterface` only.

---

## 7. Validation results

| Check | Result |
| --- | --- |
| Frontend production build | Pass |
| `scripts/audit/verify-wrappers.sh` | ALL CHECKS PASSED |
| `audit-commission-pairs.mjs` | PASS (no FAIL/BLOCKED) |
| `.venv/bin/pytest` | Pass (skipped/hard-skips as before) |
| Diff vs swap/wallet behavior paths | Only `utils/constants.ts` import path |

---

## 8. Remaining risks

- Other barrels may still create similar cycles; low-level config must keep
  **leaf** imports.
- `madge` may miss `@/` alias cycles — prefer manual / BFS checks for wallet graph.
- Cycle fix alone does **not** entitle a production P7C redeploy; still need
  TradeShell design (P8A.0 approval → P8A.1) + preview/Playwright gates.
- Auto-reconnect / AppKit not retested beyond hydrate smoke in headless Chromium.

---

## 9. Recommendation for next phase

```text
P8A.1 TradeShell / PassiveShell split design & implementation —
only after this graph cleanup is on main and any required deploy is approved.
Do not reapply naked lazy(SwapInterface) as the first step.
```

Deploy recommendation for P8A.0: **optional** (behavior-identical; safe anytime).
Not required for production stability.
