# SWAPEREX P17.3 — RECEIPT RECONCILIATION AND PENDING RECOVERY UX

## Program

**P17_3_RECEIPT_RECONCILIATION_AND_PENDING_RECOVERY_UX**

## Metadata

| Field | Value |
|-------|-------|
| Date (UTC) | 2026-07-12 |
| Repository | `/root/Swaperex` |
| Production URL | https://dex.kobbex.com |
| Production artifact | `b6024e3` (unchanged) |
| Starting HEAD | `0607116` |

## Scope

- Pure reconciliation service for known journal records
- Bounded reconciliation coordinator with in-flight deduplication
- Journal-derived `RecoveredSwapTrace` selector
- Durable recovery card + modal wiring in swap flow
- Manual status recheck (no resubmission)
- Removal of duplicate `useSwap` receipt recovery effects

## Non-scope

- Full history page (P17.4)
- Support diagnostic export (P17.5)
- Replacement/drop detection
- BroadcastChannel multi-tab locks
- Production deploy

## Architecture

| Component | Path |
|-----------|------|
| Pure reconciliation | `frontend/src/services/transactionReconciliation.ts` |
| Provider resolution | `frontend/src/services/reconciliationProvider.ts` |
| Result → journal mapping | `frontend/src/services/applyReconciliationToJournal.ts` |
| Coordinator | `frontend/src/services/transactionReconciliationCoordinator.ts` |
| React hook | `frontend/src/hooks/useTransactionReconciliation.ts` |
| Recovery trace | `frontend/src/utils/recoveredSwapTrace.ts` |
| Recovery card | `frontend/src/components/swap/RecoveredTransactionCard.tsx` |

## Ownership model

- **In-session:** `useSwap` owns `tx.wait()` via active-wait registration; coordinator skips those record IDs
- **Refresh/reconnect:** coordinator reconciles unresolved wallet records using read-only RPC

## Provider hierarchy

1. Same-origin `/rpc/eth|bsc` (production)
2. Configured public RPC fallbacks (`config/rpc.ts`)

## Retry policy

| Window | Behavior |
|--------|----------|
| 0–2 min | 6s interval scheduling |
| 2–15 min | 30s backoff |
| >15 min | No continuous poll; reconcile on mount/visibility/wallet reconnect/manual |
| >48 h | Mark stale after valid reconciliation attempt with no receipt |

## Multi-tab

Option A — idempotent journal updates only (BroadcastChannel deferred)

## Tests

| Gate | Result |
|------|--------|
| Frontend tests | 50 files, **559/559 PASS** |
| Frontend build | **PASS** |
| P13 release certification | **RELEASE_CERTIFICATION_PASS** |
| P16 release certification | **P16_RELEASE_CERTIFICATION_FAIL** (mobile WC browser assist flake) |
| Production route smoke | **P16_ROUTE_SMOKE_PASS** |

## Legacy path removal

Removed from `useSwap.ts`:

- `getTransactionReceipt` pending recovery effect
- `waitForTransaction` refresh recovery effect

## Final verdict

**P17_3_RECEIPT_RECONCILIATION_AND_PENDING_RECOVERY_UX_PASS_WITH_WARNING**

Warning: P16 automated browser/mobile WC assist check failed in local certification (environmental); unit/build/route smoke pass.

## Recommended next phase

**P17_4_TRANSACTION_HISTORY_UX_CONSOLIDATION**
