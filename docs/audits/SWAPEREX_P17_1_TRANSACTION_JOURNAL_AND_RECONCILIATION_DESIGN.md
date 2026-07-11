# SWAPEREX P17.1 — Transaction Journal and Reconciliation Design

**Program:** P17_1_TRANSACTION_JOURNAL_AND_RECONCILIATION_DESIGN  
**Date:** 2026-07-12  
**Repository path:** `/root/Swaperex`  
**Production URL:** https://dex.kobbex.com  
**Production artifact:** `b6024e3`  
**Starting HEAD:** `864ae6d`  
**Final HEAD:** _(recorded at commit time)_

---

## Verdict

**P17_1_TRANSACTION_JOURNAL_AND_RECONCILIATION_DESIGN_PASS**

---

## Scope

Design-only: canonical transaction journal domain model, storage envelope, status transitions, reconciliation contract, migration from existing stores, privacy/threat model, and P17.2/P17.3 implementation plan.

## Non-scope

No runtime journal implementation, history UI, recovery modal wiring, database, indexer, cross-device sync, deployment, or product behavior changes.

---

## Current architecture summary (from P17 audit + code re-read)

| Layer | Current artifact | Role |
|-------|------------------|------|
| Runtime state | `useSwap.ts` `SwapStatus` | Ephemeral execution pipeline |
| Presentation | `transactionLifecycle.ts` `TransactionLifecycleId` | User-facing lifecycle copy |
| In-flight persist | `pendingSwapStorage.ts` key `swaperex-pending-swap-v1` | Single pending **swap** only; wallet+chain scoped; 48h TTL |
| History persist | `swapHistoryStore.ts` key `swaperex-swap-history` | Up to 100 **swap** records; **not wallet-scoped** |
| Explorer merge | `activityService.ts`, `transactionHistory.ts` | Wallet-wide recent txs via proxy (not Swaperex journal) |
| Recovery | `useSwap` effects L3157–3310 | `getTransactionReceipt` / `waitForTransaction` |
| Modal recovery UI | `SwapPreviewModal` `recoveredTrace` | **Defined but not wired from `SwapInterface`** |

---

## Current data model comparison

| Model | File | Persisted? | Wallet scoped? | Approval? | Hash timing |
|-------|------|------------|----------------|-----------|-------------|
| `SwapStatus` + `SwapState` | `useSwap.ts` | No | N/A | Runtime only | In memory |
| `TransactionLifecycleId` | `transactionLifecycle.ts` | No | N/A | Presentation | N/A |
| `PendingSwapV1` | `pendingSwapStorage.ts` | Yes | Yes | No | Swap only, on broadcast |
| `SwapRecord` | `swapHistoryStore.ts` | Yes | **No** | No | Swap on broadcast |
| `Transaction` (explorer) | `transactionHistory.ts` | No (remote) | Yes (by address) | Heuristic | N/A |
| `RecoveredSwapTrace` | `SwapPreviewModal.tsx` | No | N/A | No | UI-only |

**Conflict:** Three overlapping concepts for swap post-broadcast state (`PendingSwapV1`, `SwapRecord`, runtime `txHash`). **No approval journal at all.**

**Recommended future role:**

- **Replace** dual swap stores with one `TransactionJournalRecord` store (hybrid migration).
- **Keep** `TransactionLifecycleId` as presentation-only mapping input.
- **Keep** explorer `Transaction` as read-only supplemental feed, not journal source of truth.
- **Deprecate** `PendingSwapV1` and unscoped `SwapRecord` after migration cutover.

---

## Write-timing trace (current code)

### Approval (`executeApproval`, `useSwap.ts` ~1685–1920)

| Moment | Data available | Current storage |
|--------|----------------|-----------------|
| Before `sendTransaction` | calldata built | None |
| After `sendTransaction` returns | **`tx.hash`** | **None** — gap |
| After `tx.wait()` | receipt | None |
| User rejection | no hash | Returns to `previewing`; telemetry only |

**Race window:** Approval hash exists from broadcast until `wait()` completes, but is never persisted. Refresh during approval wait loses traceability.

### Swap (`executeSwap`, ~2404–2858)

| Moment | Data available | Current storage |
|--------|----------------|-----------------|
| After `sendTransaction` | **`tx.hash`**, explorer URL | `writePendingSwap` + `addSwapRecord(pending)` **immediately** ✓ |
| During `tx.wait()` | pending | Both stores |
| Receipt success | receipt | `clearPendingSwap`, history → `success` |
| Receipt revert | receipt.status≠1 | history → `failed` |
| Post-broadcast RPC error | hash known | `markPendingSwapOutcomeUncertain`, history → `uncertain` |
| Pre-broadcast rejection | no hash | No journal (correct) |

**Design requirement met for swap only:** persist immediately after hash. **Approval must match this pattern in P17.2.**

### Recovery effects (~3157–3310)

- On mount: single `getTransactionReceipt` for pending swap → update history, toast, clear pending.
- If still confirming without quote: `waitForTransaction(hash)`.
- **Not connected to modal:** `pendingSubmittedSwap` exported from `useSwap` but `SwapInterface` does not pass `recoveredTrace` / `onClearPendingSwap`.

---

## Architecture decision: storage

### Options evaluated

| Option | Verdict |
|--------|---------|
| **1 — Extend pendingSwap + swapHistory** | **Rejected** — dual ownership, approval awkward, wallet scoping hard to retrofit |
| **2 — New unified journal only** | Partial — needs migration path |
| **3 — Hybrid transition** | **Selected** — canonical `swaperex-transaction-journal-v2`; read legacy on first load; write only v2 after cutover |

### ADR-03 — Unified versioned journal

- **Storage key:** `swaperex-transaction-journal-v2`
- **Envelope schema version:** `2`
- **Record schema version:** `2` (per-record field for forward compatibility)

```ts
type TransactionJournalEnvelope = {
  schemaVersion: 2;
  migratedAt?: string;           // ISO UTC
  legacyQuarantine?: LegacyQuarantinedRecord[];
  records: TransactionJournalRecord[];
};
```

No separate index maps at ≤200 records — derive indexes in selectors.

---

## Canonical domain model

```ts
/** Persistent journal statuses — post-broadcast only (ADR: Option A) */
type JournalTransactionStatus =
  | 'submitted'   // hash captured; first receipt check not done
  | 'pending'     // tx known/wait active; no final receipt
  | 'confirmed'   // receipt.status === 1
  | 'reverted'    // receipt present, status !== 1
  | 'unknown'     // cannot determine chain truth (provider failure)
  | 'stale';      // unresolved past resolution window

type TransactionJournalRecord = {
  schemaVersion: 2;
  id: string;                    // `${chainId}:${kind}:${txHashLower}`
  flowId: string;                // UUID v4
  kind: 'approval' | 'swap';
  source: 'swaperex-client' | 'legacy-migrated';
  walletAddress: string;         // lowercase
  chainId: number;
  transactionHash: string;       // lowercase storage
  status: JournalTransactionStatus;
  submittedAt: string;           // ISO UTC
  updatedAt: string;
  lastCheckedAt?: string;
  confirmedAt?: string;
  blockNumber?: number;
  confirmations?: number;        // optional; 1 after first receipt in P17.2
  explorerUrl?: string;
  context: ApprovalJournalContext | SwapJournalContext;
  receipt?: ReceiptSnapshot;
  error?: JournalError;
  reconciliation?: ReconciliationMetadata;
  relatedRecordIds?: string[];  // e.g. approval id linked to swap id
};
```

### Field authority

| Field group | Authoritative source | Who updates |
|-------------|---------------------|-------------|
| `transactionHash`, `submittedAt`, `context` snapshot | Client at broadcast | `journalSubmittedTransaction` |
| `status` confirmed/reverted | **On-chain receipt** | `updateFromReceipt` only |
| `receipt` | Derived cache from receipt | reconciliation service |
| `error` | Parsed client error | submit/reconcile paths |
| `reconciliation` | Client retry mechanics | reconciliation scheduler |

---

## Record identity (Phase 6)

| Concept | Rule |
|---------|------|
| **Record ID** | Stored: `` `${chainId}:${kind}:${transactionHash.toLowerCase()}` `` |
| **Flow ID** | `crypto.randomUUID()` at **`confirmSwap` entry** (or first execution intent after preview confirm) |
| **Hash normalization** | Lowercase in storage, queries, dedupe |
| **Wallet normalization** | Lowercase in storage/queries; optional `displayWalletAddress` checksum in context for UI |
| **Retries** | New broadcast hash → **new record**; may share `flowId` via `relatedRecordIds` |

No timestamp-only IDs.

---

## Status model (Phase 7)

### Decision: Option A — journal contains **post-broadcast records only**

Pre-broadcast states (`awaiting_wallet`, user `rejected`) remain in:

- Runtime `SwapStatus`
- Presentation `TransactionLifecycleId`
- Optional telemetry (`productionMonitoring`) — not transaction history

### Status semantics

| Status | Meaning | Entry |
|--------|---------|-------|
| `submitted` | Hash persisted; reconciliation not yet completed | Immediately on broadcast |
| `pending` | Active wait or tx seen without receipt | After first reconcile returns pending |
| `confirmed` | `receipt.status === 1` | Receipt success |
| `reverted` | Receipt with `status !== 1` | Receipt revert |
| `unknown` | Provider error / conflict; **not** a revert claim | Bounded failed lookups |
| `stale` | No receipt after **48h** (aligns with current pending TTL) | Timeout policy |

**Do not use** generic `failed` as persistent status — use `reverted`, `unknown`, or ephemeral error.

### Mapping from legacy `SwapRecord.status`

| Legacy | Journal |
|--------|---------|
| `pending` | `pending` |
| `success` | `confirmed` |
| `failed` | `reverted` |
| `uncertain` | `unknown` |

---

## Runtime → presentation → journal mapping

Recommended module: `frontend/src/utils/transactionLifecycleMapping.ts` (P17.2)

| Runtime `SwapStatus` | Presentation `TransactionLifecycleId` | Journal effect |
|---------------------|--------------------------------------|----------------|
| `idle` | `idle` | none |
| `fetching_quote` / `checking_allowance` | `quote_loading` | none |
| `previewing` | `quote_ready` / `approval_required` | none |
| `approving` | `approval_pending` | none (until hash → `journalSubmittedTransaction` approval) |
| `swapping` / `confirming` | `swap_pending` | update existing swap record status |
| `success` | `swap_confirmed` | `confirmed` via receipt |
| `error` (pre-broadcast) | `swap_failed` / `approval_rejected` | none |
| `error` (post-broadcast) | `swap_failed` | `unknown` or `reverted` via reconcile |

**Rule:** Only components calling `transactionJournalStore` actions mutate journal — not UI directly.

---

## Approval record schema (Phase 9)

```ts
type ApprovalJournalContext = {
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  spenderAddress: string;
  approvalMode: 'exact' | 'unlimited';  // matches useSwap approvalMode
  approvedAmountRaw?: string;           // when exact
  approvedAmountDisplay?: string;
  provider: string;                     // swap quote provider context
  relatedSwapRecordId?: string;         // populated when swap hash known
};
```

**Linkage timing:**

1. Create approval record at **`sendTransaction` return** (hash available).
2. Set `relatedSwapRecordId` when swap record created in same `flowId`.
3. Swap context gets `approvalRecordId` when approval in same flow confirmed or pending.

**Cases supported:** B (approval→swap), C (approval confirmed, swap rejected), D (approval reverted), E (approval pending after refresh). Case F (prior session allowance): **no forced link** — new swap may omit `approvalRecordId` if allowance pre-existed.

---

## Swap record schema (Phase 10)

```ts
type SwapJournalContext = {
  fromTokenAddress: string;
  fromTokenSymbol: string;
  fromTokenDecimals: number;
  toTokenAddress: string;
  toTokenSymbol: string;
  toTokenDecimals: number;
  inputAmountRaw: string;
  inputAmountDisplay: string;
  expectedOutputRaw?: string;
  expectedOutputDisplay: string;
  minimumOutputRaw?: string;
  minimumOutputDisplay?: string;
  slippageBps: number;
  provider: string;
  routerOrSpenderAddress?: string;
  recipientAddress?: string;
  quoteFingerprint?: string;           // from swapQuoteInputFingerprint if available
  approvalRecordId?: string;
};
```

| Field class | Examples |
|-------------|----------|
| **Required** | tokens, amounts display, provider, slippageBps |
| **Recommended** | minimum output, quoteFingerprint, approvalRecordId |
| **Optional** | raw wei strings if easily available |
| **Unsafe to persist** | full quote JSON, calldata, API keys, signed tx |

Compact snapshot only — reuse existing `AssetInfo`-derived fields at broadcast time.

---

## Receipt snapshot (Phase 11)

```ts
type ReceiptSnapshot = {
  status: 0 | 1;
  blockNumber: number;
  transactionIndex?: number;
  gasUsed?: string;
  effectiveGasPrice?: string;
  confirmedAt: string;       // ISO UTC at observation time
};
```

- **Not** full receipt object.
- **Reorg policy (Phase 23):** Mark `confirmed` after first successful receipt (`status===1`). Optional single recheck on next app open for records confirmed <10 minutes ago. No continuous polling of old confirmed records. No `finalized` UI state in P17.2.

---

## Reconciliation metadata (Phase 12)

```ts
type ReconciliationMetadata = {
  attempts: number;
  lastAttemptAt?: string;
  nextAttemptAt?: string;
  lastProviderError?: string;
  lastProviderErrorCategory?: string;
  source: 'in-session-wait' | 'refresh-recovery' | 'background-scheduler' | 'manual-refresh';
  replacementHash?: string;      // reserved; not populated in P17.2 unless reliable
  replacementReason?: string;
};
```

### Retry policy (proposed — align with 48h TTL)

| Window | Behavior |
|--------|----------|
| 0–2 min | In-session `waitForTransaction` / poll every ~4s (existing ethers behavior) |
| 2–15 min | Backoff ~30s on app foreground |
| 15 min–48 h | Slow reconcile on app open, wallet reconnect, manual refresh |
| >48 h | Transition `pending`/`unknown` → **`stale`**; preserve explorer link |

### Reconciliation API (Phase 26)

```ts
type ReconcileTransactionResult =
  | { kind: 'confirmed'; receipt: ReceiptSnapshot }
  | { kind: 'reverted'; receipt: ReceiptSnapshot }
  | { kind: 'pending' }
  | { kind: 'not_found' }              // no receipt yet, no tx dropped claim
  | { kind: 'provider_error'; error: NormalizedError };

function reconcileKnownTransaction(
  record: TransactionJournalRecord,
  readProvider: Provider,
): Promise<ReconcileTransactionResult>;
```

Pure service — no toast, no modal, no localStorage. Used by store + `useSwap` recovery effects.

---

## Unknown / stale / replacement (Phase 13)

| State | When | UX implication (P17.3) |
|-------|------|------------------------|
| **Unknown** | RPC failure after bounded attempts | “Could not verify on-chain — check explorer” |
| **Stale** | >48h unresolved | “Still unconfirmed — may have been dropped; verify manually” |
| **Dropped** | **Not a journal status in P17.2** | Do not claim without `getTransaction` evidence |
| **Replaced** | **Metadata only** | Investigate ethers `TRANSACTION_REPLACED`; defer auto-detection |

---

## Wallet and chain scoping (Phase 16)

**Visibility rule:**

```text
normalize(record.walletAddress) === normalize(activeWallet)
```

**Default view:** Connected wallet, all supported swap chains (1, 56), with chain labels — matches enhanced ActivityPanel intent.

**Disconnected:** Show **no wallet-specific journal**. Optional read-only “device-local legacy (unscoped)” section during migration only.

**Security:** Wallet A records never render under Wallet B.

---

## Retention (Phase 17)

| Policy | Value |
|--------|-------|
| Max records | **200** (increase from 100; configurable constant) |
| Active reconciliation window | 48 h |
| Stale threshold | 48 h unresolved |
| Cleanup | Drop oldest **confirmed** first, then **reverted**, then **stale**; never delete newest unresolved first |

---

## Migration strategy (Phase 18)

### Sources

1. `swaperex-pending-swap-v1` → single swap record, status `pending`/`unknown` if `outcomeUncertain`
2. `swaperex-swap-history` → swap records by txHash

### Wallet inference

| Source | walletAddress |
|--------|---------------|
| `pendingSwapStorage` | **`fromAddress` present** — use it |
| `swapHistoryStore` | **Missing** — **do not assign to active wallet** |

### Unscoped legacy policy (security-first)

Records from `swapHistoryStore` without provable wallet ownership → **`legacyQuarantine`** bucket in envelope (or separate key `swaperex-transaction-journal-legacy-quarantine-v1`):

- Not shown in wallet-scoped history
- Optional one-time “device-local swaps (legacy)” read-only section with clear disclaimer
- Never auto-attributed to currently connected wallet

### Dedupe

Merge by record `id` (chain+kind+hash). Pending + history same hash → single record; prefer pending timestamps + richer status.

### Idempotency

Migration runs once per envelope (`migratedAt` set). Re-run safe.

### Rollback

Keep legacy keys read-only for **one release cycle** (P17.2–P17.10); remove writes to legacy keys immediately at cutover; delete legacy keys only after P17.10 certification.

---

## Approval-to-swap linkage (Phase 19)

| Case | Records |
|------|---------|
| A — No approval needed | Swap only |
| B — Approval → swap same flow | Two records, shared `flowId`, cross `relatedRecordIds` |
| C — Approval OK, swap rejected | Approval terminal `confirmed`; no swap record |
| D — Approval reverted | Approval `reverted`; no swap |
| E — Approval pending after refresh | Reconcile approval first; block swap CTA until confirmed |
| F — Allowance from prior session | Swap without `approvalRecordId` link |

---

## UI consumer contract (Phase 20)

### Selectors

```ts
getRecordsForWallet(wallet: string): TransactionJournalRecord[]
getRecordsForWalletAndChain(wallet, chainId): TransactionJournalRecord[]
getPendingRecordsForWallet(wallet): TransactionJournalRecord[]
getRecordById(id): TransactionJournalRecord | undefined
getRecordsByFlowId(flowId): TransactionJournalRecord[]
getApprovalForSwap(swapRecordId): TransactionJournalRecord | undefined
getSwapForApproval(approvalRecordId): TransactionJournalRecord | undefined
```

### Actions (typed, guarded)

```ts
journalSubmittedTransaction(event: TransactionSubmittedEvent): void
updateFromReceipt(event: ReceiptObservedEvent): void
markUnknown(recordId, error?): void
markStale(recordId): void
recordReconciliationAttempt(recordId, meta): void
linkApprovalAndSwap(approvalId, swapId): void
migrateLegacyStorage(): MigrationResult
clearWalletHistory(wallet): void   // user privacy control (P17.4+)
```

Store accepts **normalized domain events**, not raw ethers objects.

---

## Status transition matrix (Phase 22)

| Current | Event | Next | Allowed |
|---------|-------|------|---------|
| submitted | receipt missing | pending | yes |
| submitted | receipt success (status=1) | confirmed | yes |
| submitted | receipt reverted | reverted | yes |
| submitted | provider error | unknown | yes |
| pending | receipt success | confirmed | yes |
| pending | receipt reverted | reverted | yes |
| pending | provider error | unknown | yes |
| pending | timeout 48h | stale | yes |
| unknown | receipt success | confirmed | yes |
| unknown | receipt reverted | reverted | yes |
| unknown | timeout 48h | stale | yes |
| confirmed | any | * | **no** (except optional reorg recheck metadata) |
| reverted | retry new hash | * | **new record** — not transition |
| stale | manual recheck success | confirmed | yes |
| stale | manual recheck revert | reverted | yes |

---

## Provider policy (Phase 25)

**Primary:** Read-only `JsonRpcProvider` via existing same-origin `/rpc/eth` and `/rpc/bsc` (`config/rpc.ts`, `evmBalanceService.ts` patterns).

**Secondary:** Public RPC fallback list in `config/rpc.ts`.

**Not required:** Active wallet connection for reconciliation.

**Wallet provider:** In-session `tx.wait()` only; not reconciliation source of truth.

---

## Error model (Phase 27)

```ts
type JournalError = {
  category: ErrorCategory;  // from utils/errors.ts
  code?: string;
  userMessage?: string;
  technicalSummary?: string;  // truncated, no stack
  occurredAt: string;
  stage: 'approval-submit' | 'approval-confirm' | 'swap-submit' | 'swap-confirm' | 'reconciliation';
  broadcastKnown: boolean;
  retryable: boolean;
};
```

Reuse `parseTransactionError` / `parseSwapExecutionError`. Never persist stacks, signed payloads, WC topics.

---

## Support diagnostic contract (Phase 28)

Future copy bundle (P17.5) — safe fields:

```text
appVersion, recordId, flowId, kind, status, walletAddressMasked,
chainId, transactionHash, approvalHash?, tokenPair, inputAmount,
expectedOutput, provider, submittedAt, lastCheckedAt, receiptStatus,
blockNumber, errorCategory, errorStage, browserName, walletProviderName
```

Formats: human multiline + JSON. No secrets.

---

## Privacy model (Phase 29)

| Data | Stored | Retention | Shared device risk |
|------|--------|-----------|-------------------|
| Tx hashes, amounts, tokens | localStorage | Until cleanup/max | **Yes — mitigated by wallet scoping** |
| Wallet address | localStorage lowercase | Same | Isolation required |
| Monitoring events | opt-in POST | server policy | Separate |

**Required product copy (P17.4+):**

> Transaction history shown by Swaperex is stored on this device and may not include all wallet activity.

localStorage is **not encrypted**. User can clear via browser storage or future in-app control.

---

## Threat model (Phase 30)

| Threat | Mitigation | Phase |
|--------|------------|-------|
| Shared-browser leakage | Wallet-scoped queries | P17.2 |
| localStorage tampering | Validate hash/chain/status on read | P17.2 |
| Wrong-chain explorer link | `getExplorerTxUrl(chainId, hash)` only | existing |
| Injected fake hash | Hash format validation; reconcile before `confirmed` | P17.2 |
| Schema corruption | Parse guard; quarantine envelope; empty safe default | P17.2 |
| Oversized payload | Max record size ~4KB; reject on migrate | P17.2 |
| False confirmed without receipt | Transition guards | P17.2 |

**Principle:** Local journal records are **untrusted input** until validated.

---

## Data validation (Phase 31)

**Decision:** Manual type guards — **no new dependency** (no Zod in `package.json`).

File: `frontend/src/utils/transactionJournalValidation.ts`

Validate: envelope, record, hash (`/^0x[0-9a-f]{64}$/i`), address, chainId (supported set), status enum, ISO dates.

On failure: skip record, log bounded dev warning, never crash app.

---

## Test strategy (Phase 32)

See machine-readable design + P17.2 test files:

- `transactionJournalValidation.test.ts`
- `transactionJournalStore.test.ts`
- `transactionJournalMigration.test.ts`
- `transactionReconciliation.test.ts`
- `transactionLifecycleMapping.test.ts`

Coverage: schema, transitions, wallet isolation, migration, reconciliation, linkage, quota errors.

---

## Performance boundaries (Phase 33)

| Limit | Value |
|-------|-------|
| Max records | 200 |
| Max record JSON size | ~4 KB target |
| Max envelope size | ~800 KB hard guard |
| Concurrent reconciliations | 2 (one per chain max) |
| Reconcile only | `submitted`, `pending`, `unknown` |

---

## Implementation file plan (Phase 34)

| File | Phase |
|------|-------|
| `frontend/src/types/transactionJournal.ts` | P17.2 |
| `frontend/src/utils/transactionJournalValidation.ts` | P17.2 |
| `frontend/src/utils/transactionLifecycleMapping.ts` | P17.2 |
| `frontend/src/stores/transactionJournalStore.ts` | P17.2 |
| `frontend/src/services/transactionJournalMigration.ts` | P17.2 |
| `frontend/src/services/transactionReconciliation.ts` | P17.2–P17.3 |
| Integration: `useSwap.ts` | P17.2 submit; P17.3 recovery |
| Integration: `SwapInterface.tsx`, `SwapPreviewModal.tsx` | P17.3 |
| Integration: `ActivityPanel.tsx`, `DeviceSwapActivityStrip` | P17.4 |

---

## P17.2 implementation sequence (Phase 35)

1. Add domain types + validators + lifecycle mapping  
2. Add `transactionJournalStore` with envelope v2  
3. Implement migration (pending + history + quarantine)  
4. Journal **swap** hash immediately after broadcast (parallel write; then cutover)  
5. Journal **approval** hash immediately after broadcast  
6. Typed transition guards + receipt updates  
7. Wallet-scoped selectors  
8. Unit/integration tests  
9. Stop writing legacy keys (read fallback one release)  

**P17.3:** Reconciliation service, scheduler, `useSwap` recovery refactor, modal wiring, unknown/stale UX.

---

## Architecture Decision Records

### ADR-01 — Chain receipt as authoritative status
Confirmed/reverted only via receipt. Local journal holds context, not truth.

### ADR-02 — Device-local known-hash journal
Not a wallet indexer. UI must not imply completeness.

### ADR-03 — Unified versioned journal v2
Replace dual stores via hybrid migration.

### ADR-04 — Approval and swap as separate linked records
Distinct hashes, statuses, explorer links; linked by `flowId`.

### ADR-05 — Wallet + chain isolation
Mandatory `walletAddress` on every record.

### ADR-06 — Unknown/stale before dropped/replaced
Conservative semantics; extensible replacement metadata.

### ADR-07 — No cross-device sync in initial P17
Document limitation explicitly.

### ADR-08 — No database/indexer in initial P17
Reuse localStorage + RPC + explorer proxy.

### ADR-09 — Operator-first observability unchanged
P13 tooling remains separate from user journal.

### ADR-10 — No public status page in P17.1
Unchanged from P17 audit.

---

## Baseline validation

| Gate | Result |
|------|--------|
| Frontend tests | 42 files, **527/527 PASS** |
| Frontend build | **PASS** |
| Production mutation | **None** |

---

## Open questions

1. Should `DeviceSwapActivityStrip` show only current chain or all wallet chains? **Recommend all with chain badge (P17.4).**
2. Include `finalized` status after N confirmations? **Defer until product requires.**
3. BroadcastChannel for multi-tab? **P17.3 optional; idempotent writes sufficient initially.**

## Risks

| Risk | Mitigation |
|------|------------|
| Migration mis-attributes legacy history | Quarantine unscoped records |
| Dual-write period inconsistency | Short parallel write; tests; cutover flag |
| localStorage quota | Max records + compact context |

---

## Implementation readiness

**P17.2 is implementation-ready.** All ADRs decided; contracts defined; migration and transition rules specified.

**Recommended next phase:** `P17_2_LOCAL_KNOWN_TRANSACTION_JOURNAL_HARDENING`

---

## Files inspected

`useSwap.ts`, `transactionLifecycle.ts`, `swapCtaStates.ts`, `swapHistoryStore.ts`, `pendingSwapStorage.ts`, `transactionHistory.ts`, `activityService.ts`, `ActivityPanel.tsx`, `SwapHistory.tsx`, `SwapPreviewModal.tsx`, `SwapInterface.tsx`, `errors.ts`, `config/chains.ts`, `config/rpc.ts`, P17 audit docs.

**Machine-readable design:** `reports/p17-1/transaction-journal-design.json`
