# SWAPEREX P7C RCA — Vite/Rollup TDZ + Circular Dependency

**Date:** 2026-07-08  
**Status:** RCA complete (local reproduction + root-cause confirmed)  
**Production:** Restored at `14cbf64` (P7C reverted). Trust Center + P5 intelligence remain live.  
**Scope:** Diagnosis only. Do **not** reapply direct `lazy(SwapInterface)` to production without an approved follow-up.

---

## 1. Incident summary

P7C (`bac05c0`) replaced the static `SwapInterface` import in `frontend/src/App.tsx` with `React.lazy` + `Suspense`.

| Stage | Result |
| --- | --- |
| `npm run build` | Passed |
| Static deploy | Passed; hashed assets present |
| Runtime (`/`, `/trust`) | Crashed before React hydrate |
| Symptom | Empty `#root`, blue/dark blank page |
| Production error (minified) | `ReferenceError: Cannot access 'hr' before initialization` |
| Fix | Revert P7C → `14cbf64` |

Swap / quote / commission / wrapper logic was unchanged. Only route loading boundary changed.

---

## 2. Production impact

- Entire SPA failed to mount (swap and passive routes including `/trust`).
- Assets were not missing; this was not a 404/deploy mismatch.
- Rollback restored hydration on `/` and `/trust` with no pageerrors.

Live at RCA time:

```text
environment=production
short=14cbf64
```

---

## 3. Why build passed but runtime failed

Vite/Rollup finished successfully. The failure is a **Temporal Dead Zone (TDZ)** error on a `const` binding during **entry chunk evaluation**, before React can render.

Minifiers rename bindings (`WALLETCONNECT_PROJECT_ID` → `hr`). Unminified RCA build mapped the crash to:

```text
ReferenceError: Cannot access 'WALLETCONNECT_PROJECT_ID' before initialization
  at index-*.js  (connectors eval: const WC_PROJECT_ID = WALLETCONNECT_PROJECT_ID)
```

Declaration order in the **same** rolled-up entry module (P7C lazy build, `minify: false`):

1. `wallet/connectors.ts` top-level: `const WC_PROJECT_ID = WALLETCONNECT_PROJECT_ID` (use)
2. Later: `const WALLETCONNECT_PROJECT_ID = ...` from `utils/constants.ts` (define)

ESM `const` bindings are live but uninitialized until their own statement runs. A circular init order that uses the binding before its statement → TDZ → blank page.

Static import of `SwapInterface` pulled a larger shared graph into the entry/chunk sort such that the bad order either did not surface or was ordered safely. Removing that static edge changed Rollup’s module initialization order for the residual entry graph and exposed the latent cycle.

---

## 4. Exact P7C diff

**Commit:** `bac05c0` — `perf(dex): lazy-load swap shell for passive routes`  
**Files:** `frontend/src/App.tsx` (+ audit doc). `SwapInterface.tsx` unchanged.

Diff essence:

```diff
- import { SwapInterface } from '@/components/swap/SwapInterface';
+ const LazySwapInterface = lazy(() =>
+   import('@/components/swap/SwapInterface').then((m) => ({ default: m.SwapInterface })),
+ );
+ // Suspense + "Loading swap…" fallback around the swap panel
- <SwapInterface />
+ <Suspense fallback={...}><LazySwapInterface /></Suspense>
```

**Revert:** `14cbf64` restored the static import.

---

## 5. Circular dependency findings

### Confirmed ESM cycle (first-party)

```text
utils/constants.ts
  → import { CHAINS, SUPPORTED_CHAIN_IDS } from '@/wallet'   // barrel
      → wallet/index.ts
          → export … from './connectors'
              → wallet/connectors.ts
                  → import { WALLETCONNECT_PROJECT_ID } from '@/utils/constants'
```

So:

```text
constants.ts ↔ wallet barrel ↔ connectors.ts ↔ constants.ts
```

`madge` (ts/tsx) reported “no circular dependency” for this graph (likely incomplete resolution of `@/` alias / re-export edges). A direct BFS over resolved `@/` imports still found the cycle above.

### Binding that TDZs

| Binding | Defined in | Used at module top-level in |
| --- | --- | --- |
| `WALLETCONNECT_PROJECT_ID` | `utils/constants.ts` | `wallet/connectors.ts` (`const WC_PROJECT_ID = …`) |

`App.tsx` / `useWallet` keep connectors in the **entry** residual graph even when `SwapInterface` is lazy. Lazy wrappers do not remove that edge.

---

## 6. Reproduction status

| Step | Result |
| --- | --- |
| Baseline `main` @ `14cbf64` | Clean; production `version.txt` matches |
| Branch `rca/p7c-tdz-repro` + cherry-pick `bac05c0` | Build OK |
| Local `serve dist` + Playwright | `/` and `/trust`: `rootChildren: 0`, TDZ error |
| Unminified + sourcemap build | `hr` → `WALLETCONNECT_PROJECT_ID` confirmed |
| Cycle-break experiment (local only) | `constants` import `@/wallet/chains` instead of `@/wallet` + P7C lazy → `/` and `/trust` hydrate, no pageerror |

Experimental branch was **not** merged. Cycle-break patch was discarded after RCA.

---

## 7. Generated chunk observations (P7C)

Typical sizes (gzip-ish build report):

| Asset | ~size | Role |
| --- | --- | --- |
| `index-*.js` (app entry) | ~212 KB | Residual shell + wallet/hooks; **crash site** |
| `SwapInterface-*.js` | ~225 KB | Deferred swap UI |
| Without P7C (static) | entry ~498 KB | Single larger entry; no TDZ at runtime |

Vite emitted named-export remapping similar to:

```js
import("./SwapInterface-….js").then((n) => n.S).then((m) => ({ default: m.SwapInterface }))
```

That remapping is a secondary concern. The **blank page occurs during entry evaluation**, before the swap chunk needs to load successfully—so fixing only the `.then(m => m.SwapInterface)` pattern would **not** have prevented this incident.

---

## 8. Strategy tests (local only; not shipped)

| Strategy | Change | Result |
| --- | --- | --- |
| **A** Lazy wrapper `LazySwapRoute` (default export; static `SwapInterface` inside) | App `lazy(() => import(LazySwapRoute))` | **FAIL** — same `hr` / TDZ on entry |
| **B** `TradeShell` default export; static `SwapInterface` inside | App `lazy(() => import(TradeShell))` | **FAIL** — same TDZ on entry |
| **C** Static `SwapInterface` again (manualChunks only / production shape) | No App lazy | **PASS** — hydrates; no pageerror |
| **Extra (proof)** P7C lazy + break cycle (`constants` → `@/wallet/chains`) | Local only | **PASS** — hydrates; proves root cause |

**Conclusion:** Renaming the lazy boundary (A/B) does **not** fix the failure while `useWallet` / connectors remain in the entry chunk and the constants↔wallet barrel cycle remains. A TradeShell split is only safe **after** the cycle is broken (or connectors are moved out of the entry init path safely).

---

## 9. Recommended safe future implementation

1. **Do not reapply direct `lazy(() => import(SwapInterface))` to production** until the cycle is fixed and preview+Playwright gates pass.
2. **Prerequisite fix (when performance work resumes):** break `utils/constants.ts` → `@/wallet` barrel by importing chain config from `@/wallet/chains` (or move `WALLETCONNECT_PROJECT_ID` to a leaf module with **no** import from `wallet/connectors`). Prefer leaf imports over barrel for any module that also feeds connectors.
3. **Then** prefer a higher-level **TradeShell** split (App lazy-loads a shell that statically contains swap+needed wallet UI), keeping the wallet/swap graph coherent in one async chunk where possible.
4. Optional: `manualChunks` only for vendor cacheability **without** changing App’s static `SwapInterface` until (2)+(3) are proven.

Preferred next phase (design only): **P8A.0 TradeShell split design** — no implementation until this RCA strategy is approved.

---

## 10. Do-not-repeat rule

```text
Do NOT reapply direct lazy-load of SwapInterface (named or default) to production
without:
  (a) breaking constants ↔ wallet barrel ↔ connectors TDZ cycle, and
  (b) local preview + Playwright pageerror capture on / and /trust, and
  (c) confirming entry chunk does not evaluate WALLETCONNECT_PROJECT_ID before its const.
```

---

## 11. Required QA before any future performance deploy

- [ ] `npm --prefix frontend run build`
- [ ] Preview `dist` on loopback
- [ ] Playwright (or equivalent): `/` and `/trust` → `#root > *` count ≥ 1, **zero** `pageerror`
- [ ] Capture stack with sourcemap or unminified RCA build if any TDZ appears
- [ ] Confirm production `version.txt` after deploy matches intended commit
- [ ] Pair/wrapper audits unchanged (no coincidence regressions)

---

## 12. Explicit non-goals of this RCA

- No production redeploy of P7C
- No change to useSwap / quotes / commission / wrappers / contracts / AppKit
- No merge of experimental cycle-break or TradeShell code in this doc commit
