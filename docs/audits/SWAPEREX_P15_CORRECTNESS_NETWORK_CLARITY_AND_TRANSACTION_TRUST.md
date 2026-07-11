# SWAPEREX P15 — Correctness, Network Clarity, and Transaction Trust

**Program:** SWAPEREX_POST_P14_FULL_IMPROVEMENT_PROGRAM  
**Date:** 2026-07-10  
**Baseline production:** `eee0264`  
**Repository HEAD at start:** `11c13e7`  
**Scope:** P14-F001, P14-F003 (partial), P14-F008, P14-F015, preview/gas clarity  
**Deployed:** No

---

## Verdict

**P15_CORRECTNESS_AND_TRUST_PASS**

Minor gaps: live wallet gas estimate requires connected provider (by design); mobile WC validation deferred to P16.

---

## Findings addressed

| ID | Title | Status |
|----|-------|--------|
| P14-F001 | Six networks shown, two swap-enabled | **FIXED** — `networkCapabilities.ts` + selector badges |
| P14-F003 | Gas not shown pre-wallet | **FIXED** — gas units from quote + connect prompt; live fee when wallet connected |
| P14-F008 | Custom token friction | **FIXED** — risk acknowledgement + non-swap import block |
| P14-F015 | Wrong-chain banner dismissible on swap | **FIXED** — non-dismiss on swap tab |

---

## Implementation summary

### P15.1 — Network capability registry

**File:** `frontend/src/config/networkCapabilities.ts`

Canonical fields per chain: wallet, read-only, portfolio, send, swap, commission wrapper, production certified, display order, status reason.

### P15.2 — Network selector UX

**File:** `frontend/src/components/common/NetworkSelector.tsx`

- Swap-enabled networks listed first with green badge
- Read-only networks labeled "Balances & send only"
- Header explains swap vs balance-view split

### P15.3 — Wrong-chain banner

**Files:** `ChainWarning.tsx`, `TradeShell.tsx`

- Clearer unsupported-network copy
- Dismiss hidden on swap tab (`allowDismiss={false}`)
- `role="alert"` for accessibility

### P15.4 — Gas and network fee transparency

**Files:** `networkFeeEstimate.ts`, `NetworkFeeEstimateRow.tsx`, `SwapInterface.tsx`, `SwapPreviewModal.tsx`, `RouteTransparencyCard.tsx`

- Separates network gas from Swaperex commission
- Shows gas units from quote without wallet
- Live native fee estimate when provider available
- Connect-wallet guidance when not connected

### P15.5 — Transaction preview copy

**File:** `SwapPreviewModal.tsx`

- Network fee row in pre-sign confidence block
- Native ETH wrap routing note on ETH pairs

### P15.6 — Custom token safety

**File:** `SwapInterface.tsx` (TokenSelectorDropdown)

- Required risk acknowledgement checkbox
- Import blocked on non-swap chains
- Custom tokens remain unverified (no trust badge)

### P15.7 — Quote guard

**File:** `SwapInterface.tsx`

- Quote fetch skipped on non-swap networks (no generic quote failure loop)

---

## Tests added

| File | Coverage |
|------|----------|
| `config/__tests__/networkCapabilities.test.ts` | Registry, labels, ordering |
| `utils/__tests__/networkFeeEstimate.test.ts` | Fee display fallbacks |

---

## Non-scope (preserved)

- Commission routing logic
- Wrapper contracts and fee bps
- WalletConnect-only architecture
- AppKit sanitizer
- Audit allowlist

---

## Validation (pre-deploy)

Run before any production deploy:

```bash
npm --prefix frontend run build
npm --prefix frontend run test
bash scripts/audit/verify-wrappers.sh
node scripts/audit/audit-commission-pairs.mjs
node scripts/audit/p12-5-route-quote-regression-smoke.mjs
```

---

## Rollback

Revert P15 commits; production remains at `eee0264`. No contract or env changes.

---

## Known limitations

1. Network fee fiat equivalent not shown (no price oracle wired in P15)
2. Mobile WalletConnect human validation → P16
3. URL routes for tabs → P16

---

## Production recommendation

**Do not deploy until release certification passes.** P15 is code-complete for review; deploy requires explicit operator approval per program rules.
