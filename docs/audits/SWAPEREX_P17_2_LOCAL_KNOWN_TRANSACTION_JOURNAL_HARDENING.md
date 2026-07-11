# SWAPEREX P17.2 — LOCAL KNOWN-TRANSACTION JOURNAL HARDENING

## Program

**P17_2_LOCAL_KNOWN_TRANSACTION_JOURNAL_HARDENING**

## Metadata

| Field | Value |
|-------|-------|
| Date (UTC) | 2026-07-11 |
| Repository | `/root/Swaperex` |
| Production URL | https://dex.kobbex.com |
| Production artifact | `b6024e3` (unchanged) |
| Starting HEAD | `28ddb66` |
| Final HEAD | `9b50e90` |
| Design authority | `docs/audits/SWAPEREX_P17_1_TRANSACTION_JOURNAL_AND_RECONCILIATION_DESIGN.md` |

## Scope

Implemented the canonical device-local known-transaction journal:

- Unified journal store (`swaperex-transaction-journal-v2`)
- Wallet + chain scoped approval and swap records
- Immediate post-broadcast journaling in `useSwap.ts`
- Guarded receipt-backed status transitions
- Legacy migration + quarantine for unscoped history
- Compatibility adapters for `swapHistoryStore` and `pendingSwapStorage`
- Legacy write cutover (no new pending/history swap writes)

## Non-scope

- Recovery UX (P17.3)
- History UI redesign (P17.4)
- Reconciliation scheduler (P17.3)
- Public status / operator dashboards
- Production deploy

## Architecture implemented

| Decision | Implementation |
|----------|----------------|
| Storage | `swaperex-transaction-journal-v2` Zustand persist |
| Envelope schema | 2 |
| Record schema | 2 |
| Kinds | `approval`, `swap` |
| Statuses | `submitted`, `pending`, `confirmed`, `reverted`, `unknown`, `stale` |
| Record ID | `${chainId}:${kind}:${txHashLowercase}` |
| Flow ID | UUID at `confirmSwap` entry |
| Source of truth | On-chain receipt via `applyJournalReceiptUpdate` |
| Legacy policy | Unscoped history → `legacyQuarantine`; never assign active wallet |

## Files added

```text
frontend/src/types/transactionJournal.ts
frontend/src/utils/transactionJournalValidation.ts
frontend/src/utils/transactionJournalIdentity.ts
frontend/src/utils/transactionJournalTransitions.ts
frontend/src/utils/transactionJournalReceipt.ts
frontend/src/utils/transactionLifecycleMapping.ts
frontend/src/utils/journalToSwapHistoryAdapter.ts
frontend/src/utils/swapJournalIntegration.ts
frontend/src/services/transactionJournalMigration.ts
frontend/src/stores/transactionJournalStore.ts
frontend/src/services/__tests__/transactionJournalMigration.test.ts
frontend/src/stores/__tests__/transactionJournalStore.test.ts
frontend/src/utils/__tests__/transactionJournalValidation.test.ts
frontend/src/utils/__tests__/transactionJournalTransitions.test.ts
frontend/src/utils/__tests__/transactionJournalReceipt.test.ts
```

## Files modified

```text
frontend/src/hooks/useSwap.ts
frontend/src/stores/swapHistoryStore.ts
frontend/src/utils/pendingSwapStorage.ts
```

## Integration summary

### Approval

1. `sendTransaction` returns hash
2. `journalApprovalSubmitted` (before `tx.wait()`)
3. `markTransactionPending`
4. Receipt → `applyJournalReceiptUpdate`

### Swap

1. `confirmSwap` creates `flowId`
2. `sendTransaction` returns hash
3. `journalSwapSubmitted` (before `tx.wait()`)
4. Link approval when same flow
5. Receipt → `applyJournalReceiptUpdate`

### Legacy cutover

- `writePendingSwap` → no-op
- `swapHistoryStore.addRecord` → transfers only; swaps projected from journal
- Legacy keys preserved read-only for migration

### Storage failure policy

Journal write returns `{ ok: false, recoverable: true }`; swap continues; bounded `console.warn` with hash preserved in runtime state.

## Tests

| Gate | Result |
|------|--------|
| Frontend tests | 47 files, **548/548 PASS** |
| Frontend build | **PASS** |
| P16 release certification | **P16_RELEASE_CERTIFICATION_PASS** |
| Production route smoke | **P16_ROUTE_SMOKE_PASS** (14/14) |

## Production validation

Read-only. Production artifact unchanged (`b6024e3`). No deploy.

## Evidence

`reports/p17-2/20260711T233124Z/`

## Warnings

1. Transfer records still use `swapHistoryStore` persist (by design; not journal kinds).
2. `clearPendingSwap` marks journal record stale rather than deleting (preserves audit trail).
3. Multi-tab reconciliation deferred to P17.3.

## Deferred

- P17.3 reconciliation service + recovery UX
- P17.4 history UX + wallet disclaimer copy
- Replacement/dropped detection
- BroadcastChannel multi-tab coordination

## Final verdict

**P17_2_LOCAL_KNOWN_TRANSACTION_JOURNAL_HARDENING_PASS**

## Recommended next phase

**P17_3_RECEIPT_RECONCILIATION_AND_PENDING_RECOVERY_UX**
