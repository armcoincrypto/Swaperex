# SWAPEREX P8A.3 — Lazy TradeShell Module Boundary

**Date:** 2026-07-08  
**Status:** Implemented on `main` (not deployed unless separately approved)  
**Prior:** P8A.0 cycle fix, P8A.2 PassiveShell mount split  
**Production at write time:** Still `14cbf64`

---

## 1. What changed

| File | Change |
|------|--------|
| `frontend/src/components/layout/TradeShell.tsx` | **New** — former DexMain (static `SwapInterface`) |
| `frontend/src/App.tsx` | Slim router: PassiveShell routes + `lazy(() => import(TradeShell))` |
| `docs/audits/SWAPEREX_P8A3_LAZY_TRADESHELL_BOUNDARY.md` | This audit |

App no longer statically imports wallet/swap modules. Trade/wallet graph loads only when the `/*` trade route mounts TradeShell.

---

## 2. Why this is not a P7C duplicate

| P7C (failed) | P8A.3 (this) |
|--------------|--------------|
| `lazy(() => import(SwapInterface))` from App/DexMain | **Never** lazy-loads SwapInterface |
| Peeled swap UI while DexMain kept wallet/connectors in entry | Entry is shell-only; **whole TradeShell** is the async unit |
| Exposed constants↔wallet TDZ in residual entry | Cycle fixed in P8A.0; TradeShell keeps connectors + SwapInterface together |

---

## 3. Proof SwapInterface remains static

```tsx
// TradeShell.tsx
import { SwapInterface } from '@/components/swap/SwapInterface';
// …
<SwapInterface />
```

No `lazy(() => import(…SwapInterface))` anywhere in App or TradeShell.

---

## 4. Proof App / PassiveShell are wallet-free

```bash
grep -nE "SwapInterface|useWallet|NetworkSelector|WalletBootstrap|AppKit|from '@/wallet|ethers" \
  frontend/src/App.tsx frontend/src/components/layout/PassiveShell.tsx
# → no matches
```

---

## 5. Validation

| Check | Result |
|-------|--------|
| `git diff --check` | Pass |
| Frontend build | Pass |
| `verify-wrappers.sh` | ALL CHECKS PASSED |
| Pair audit | PASS 126 / 0 / 0 |
| pytest | 119 passed, 3 skipped |

---

## 6. Playwright smoke

| Path | `#root` | pageerror | TradeShell.js | vendor-ethers |
|------|---------|-----------|---------------|---------------|
| `/` | 1 | none | loaded | loaded |
| `/trust` | 1 | none | **not** loaded | **not** loaded |
| `/about` | 1 | none | not | not |
| `/terms` | 1 | none | not | not |
| `/privacy` | 1 | none | not | not |
| `/disclaimer` | 1 | none | not | not |

---

## 7. Bundle impact

| Asset | Approx size | Role |
|-------|-------------|------|
| `index-*.js` (entry) | **~54 KB** (was ~500 KB) | Router + PassiveShell wiring |
| `TradeShell-*.js` | ~412 KB | Dex trade/wallet graph + static SwapInterface |
| `vendor-ethers` | ~395 KB | Loaded with TradeShell, not cold `/trust` |
| `index.html` modulepreload | `vendor-react` only | **ethers no longer modulepreloaded** on cold HTML |

Success metric from P8A design: cold `/trust` does not fetch TradeShell or ethers — **met**.

---

## 8. Known risks

- First navigation Passive → Trade pays one-time TradeShell + ethers download (acceptable).
- Reconnect / WalletBootstrap only run when TradeShell mounts (same as intended design).
- Static pages still lazy-load their own small chunks (`TrustCenterPage`, `StaticPages`) on passive routes.
- Do not “improve” further by reintroducing naked lazy SwapInterface.

---

## 9. Deploy recommendation

**Do not deploy** until explicit approval after review.  
Prefer shipping **P8A.0 + P8A.2 + P8A.3** together when deploying frontend.

---

## 10. Rollback plan

```text
1. Revert the P8A.3 commit (App.tsx + TradeShell.tsx + this doc).
2. Redeploy prior static artifact.
3. Never rollback via bac05c0-style lazy SwapInterface.
```

---

## 11. Next phase

```text
P8A.4 / P8B — Optional operator QA matrix (WC reconnect: /trust → Open swap),
then approved static deploy of P8A stack. No further chunk experiments until then.
```

*End of P8A.3.*
