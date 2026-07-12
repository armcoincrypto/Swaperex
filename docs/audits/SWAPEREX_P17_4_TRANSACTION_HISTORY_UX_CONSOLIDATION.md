# SWAPEREX P17.4 — TRANSACTION HISTORY UX CONSOLIDATION

## Program

`P17_4_TRANSACTION_HISTORY_UX_CONSOLIDATION`

## Date

2026-07-12 (UTC)

## Repository

`/root/Swaperex`

## Production

- URL: https://dex.kobbex.com
- Artifact: `b6024e3` (unchanged)
- Starting HEAD: `9b68807`
- Final HEAD: `e75bb55`

## Scope

Consolidated wallet-scoped transaction history into one presentation model and one aggregation owner, with portfolio ActivityPanel as the primary surface and compact swap-page summaries.

## Non-scope

No new backend, journal schema changes, transfer-to-journal migration, P17.5 diagnostics, deployment, or push.

## P17.3 baseline

`P17_3_RECEIPT_RECONCILIATION_AND_PENDING_RECOVERY_UX_PASS_WITH_WARNING` at `9b68807`.

## Previous activity surfaces

| Surface | Role before P17.4 |
|---------|-------------------|
| `ActivityPanel` | swapHistoryStore + explorer merge, hash-only dedupe, no approvals |
| `SwapHistory` / `DeviceSwapActivityStrip` | Local swapHistory recent list |
| `RecoveredTransactionCard` | Active recovery on swap page |

## Previous activity sources

- `transactionJournalStore` — canonical but not shown in ActivityPanel
- `swapHistoryStore` — journal swap projection + transfers
- `activityService` — legacy `ActivityItem` merge
- `transactionHistory` — explorer proxy

## Canonical presentation model

`UnifiedActivityItem` in `frontend/src/types/unifiedActivity.ts` — derived at read time, not persisted.

## Aggregation ownership

Extended `frontend/src/services/activityService.ts`:

- `buildUnifiedWalletActivity()` — sync merge
- `fetchUnifiedWalletActivity()` — explorer fetch + merge
- `getCompactJournalActivity()` — swap-page strip

Helpers:

- `frontend/src/utils/unifiedActivityAdapters.ts`
- `frontend/src/utils/unifiedActivityDedupe.ts`
- `frontend/src/utils/unifiedActivityFlowGrouping.ts`
- `frontend/src/utils/activityPresentation.ts`

## Source precedence

1. Journal (wallet + chain + context)
2. Explorer
3. Legacy transfer (`swapHistoryStore.transferRecords`)

## Deduplication

Identity: `chainId + kind + transactionHash` (lowercase). Approval and swap remain distinct. Terminal journal status overrides weaker explorer status.

## Flow grouping

Journal records sharing `flowId` render as a compact “Swap flow” card with approval before swap.

## Primary history surface

**Portfolio `ActivityPanel`** (`/portfolio`)

## Contextual summary surfaces

- **Swap page:** `DeviceSwapActivityStrip` — recent journaled Swaperex activity (excludes active recovery flow)
- **Swap page:** `RecoveredTransactionCard` — sole active unresolved-flow surface

## Filters

All, Swaps, Approvals, Transfers, Pending

## Status copy

`unknown` → Status unavailable; `stale` → Unresolved (via `activityPresentation.ts`)

## Source copy

Swaperex / Explorer / This device

## Device-local disclaimer

Shown above ActivityPanel list.

## Empty states

Disconnected, no device history, no filter match, explorer error (journal still visible)

## Partial failures

Explorer errors do not hide journal or transfer rows; per-source status in `UnifiedActivityResult.sources`

## Loading behavior

Journal renders immediately from local stores; explorer loads asynchronously with lightweight indicator

## Wallet switching

Activity state resets on address change; fetch generation guard prevents stale merges

## Chain behavior

Rows include chain badge; explorer links use row chain; supported chains 1/56/137 for explorer fetch

## Explorer refresh policy

Wallet connect, route mount, manual refresh — no aggressive polling in ActivityPanel

## Manual refresh

“Refresh activity” re-fetches explorer and triggers `transactionReconciliationCoordinator.reconcileWallet(..., 'manual')`

## Mobile UX

Compact stacked rows; no horizontal tables; strip and panel use responsive layout

## Accessibility

Semantic lists/tabs, status text labels (not color-only), keyboard-accessible refresh and explorer links

## Files added

- `frontend/src/types/unifiedActivity.ts`
- `frontend/src/utils/unifiedActivityAdapters.ts`
- `frontend/src/utils/unifiedActivityDedupe.ts`
- `frontend/src/utils/unifiedActivityFlowGrouping.ts`
- `frontend/src/utils/activityPresentation.ts`
- `frontend/src/utils/__tests__/unifiedActivity.test.ts`
- `frontend/src/components/portfolio/__tests__/ActivityPanel.test.tsx`

## Files modified

- `frontend/src/services/activityService.ts`
- `frontend/src/components/portfolio/ActivityPanel.tsx`
- `frontend/src/components/history/SwapHistory.tsx`
- `frontend/src/components/swap/SwapInterface.tsx`

## Duplicate modules removed or thinned

- `activityService.ts` — now canonical aggregation owner (legacy `ActivityItem` helpers retained for export/tests)
- `SwapHistory.tsx` — full history component unchanged; strip refactored to journal-only compact view
- `journalToSwapHistoryAdapter.ts` — unchanged; still powers swapHistoryStore compatibility

## Tests

- Frontend: **52 files, 584/584 PASS**
- Build: **PASS**

## Release certification

- Full pipeline: `P16_RELEASE_CERTIFICATION_FAIL` (mobile WC assist step in certify script)
- Independent `p16-mobile-walletconnect-cert.mjs` reruns (×2): **PASS** both — environmental flake in pipeline timing

## Production read-only validation

`P16_ROUTE_SMOKE_PASS` (14/14) — production artifact unchanged `b6024e3`

## Evidence

`reports/p17-4/20260712T180903Z/`

## Open findings

- Legacy transfer records lack wallet address field; shown as device-local for connected session (medium)

## Deferred items

P17.5 transaction details and support diagnostics

## Warnings

P16 release certification mobile WalletConnect browser-assist fails inside certify pipeline but passes on independent reruns — same class of warning as P17.3

## Final verdict

**`P17_4_TRANSACTION_HISTORY_UX_CONSOLIDATION_PASS_WITH_WARNING`**
