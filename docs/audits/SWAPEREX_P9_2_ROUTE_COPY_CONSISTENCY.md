# SWAPEREX P9.2 — Route Support Copy Consistency

**Date:** 2026-07-09  
**Verdict:** `P9_2_READY_FOR_OPERATOR_WALLET_RETEST`

---

## 1. Root cause

**UI copy / precheck mismatch — not a routing regression.**

| Finding | Detail |
|---------|--------|
| Pair audit | `ETH→USDT`, `USDT→ETH`, `WETH→USDT`, `USDT→WETH` all **PASS** via `uniswap-v3-wrapper-v2` |
| Commission allowlist | `1\|ETH\|USDT`, `1\|USDT\|ETH`, `1\|WETH\|USDT`, `1\|USDT\|WETH` present in `COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS` |
| Native normalization | Wrapper V2 quotes native ETH using WETH addresses (`getSwapAddress`) — same as audit script |
| Mismatch | `computeRoutePrecheck` ignored audit catalog; quote failures always surfaced harsh **“not supported by commission routing yet”** even for audited pairs (e.g. preview RPC 404 → `unsupported_commission_route`) |
| Popular routes | Homepage catalog duplicated **ETH ⇄ USDT** alongside **WETH ⇄ USDT**, while featured routes already use WETH-only labels |

**Conclusion:** ETH ⇄ USDT is truly supported. The swap panel over-stated “unsupported” on quote failure; precheck did not anchor to audit facts; popular list duplicated native/WETH labels.

---

## 2. What changed (display-only)

1. **`routePrecheck.ts`** — If `isCommissionPairAuditSupported(chainId, from, to)` → `likely_routable` / “Audited route available”.
2. **`commissionRouteDisplay.ts`** (new) — Audit-aware issue copy: audited pairs get “Live wrapper quote unavailable…” instead of “not supported yet”.
3. **`swapSurfaceCopy.ts`** — New audited-failure strings; helper text leads with WETH majors.
4. **`popularCommissionRoutes.ts`** — Removed **ETH ⇄ USDC** and **ETH ⇄ USDT** display entries (WETH equivalents retained). Audit keys unchanged.
5. **`PopularCommissionRoutes.tsx`** / **`SwapInterface.tsx`** — Recovery/error panels use audit-aware copy.

**Not changed:** quote execution, wallet, wrappers, commission enforcement, routing engine.

---

## 3. Pair status after fix

| Pair | Audit / routing | Popular audited routes UI | Precheck (before quote) | Quote-failure panel |
|------|-----------------|----------------------------|-------------------------|---------------------|
| **ETH ⇄ USDT** | Supported (wrapper V2, native→WETH) | Removed duplicate; use WETH ⇄ USDT chip | Audited route available | Soft “quote unavailable” if fetch fails |
| **WETH ⇄ USDT** | Supported | Shown | Audited route available | Soft copy if audited direction fails |

---

## 4. Validation

| Gate | Result |
|------|--------|
| `git diff --check` | PASS |
| `npm --prefix frontend run build` | PASS |
| `verify-wrappers.sh` | PASS |
| `audit-commission-pairs.mjs` | PASS 126 / 0 / 0 |
| `.venv/bin/pytest` | PASS 119 / skip 3 |

---

## 5. Operator retest checklist

On preview/production build:

1. Select **ETH → USDT** — precheck should read **Audited route available** before quote.
2. Enter small amount — quote should succeed on live RPC (not preview-local 404).
3. If quote fails (network), panel should **not** say “not supported yet”; should say live quote unavailable.
4. Homepage **Popular audited routes** — shows **WETH ⇄ USDT**, not duplicate ETH chip.
5. **WETH → USDT** — same audited precheck; quote should succeed.

---

## 6. Production deploy recommendation

Safe to include in next deploy bundle after operator wallet retest confirms ETH and WETH USDT quotes on live infrastructure.

**Do not deploy until P9.1 operator wallet gate completes.**
