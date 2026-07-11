/**
 * Canonical wallet-scoped known-transaction journal store (v2).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getExplorerTxUrl } from '@/config';
import type {
  ApprovalJournalContext,
  ApprovalJournalRecord,
  JournalError,
  JournalStoreResult,
  JournalTransactionStatus,
  ReceiptSnapshot,
  SwapJournalContext,
  SwapJournalRecord,
  TransactionJournalEnvelope,
  TransactionJournalRecord,
} from '@/types/transactionJournal';
import {
  JOURNAL_ENVELOPE_SCHEMA_VERSION,
  JOURNAL_RECORD_SCHEMA_VERSION,
  JOURNAL_STORAGE_KEY,
  JOURNAL_STALE_AFTER_MS,
  MAX_JOURNAL_RECORDS,
} from '@/types/transactionJournal';
import { createFlowId, createJournalRecordId } from '@/utils/transactionJournalIdentity';
import { normalizeReceipt } from '@/utils/transactionJournalReceipt';
import {
  buildTransitionPatch,
  receiptEventForStatus,
  transitionJournalRecord,
} from '@/utils/transactionJournalTransitions';
import {
  isTransactionJournalEnvelope,
  normalizeWalletAddress,
  parseTransactionJournalEnvelope,
  sanitizeEnvelopeRecords,
} from '@/utils/transactionJournalValidation';
import {
  migrateLegacyTransactionStorage,
  readLegacyStorageRaw,
} from '@/services/transactionJournalMigration';

const UNRESOLVED_STATUSES = new Set<JournalTransactionStatus>([
  'submitted',
  'pending',
  'unknown',
  'stale',
]);

export interface JournalSubmittedInput {
  flowId: string;
  walletAddress: string;
  chainId: number;
  transactionHash: string;
  context: ApprovalJournalContext | SwapJournalContext;
  submittedAt?: string;
  explorerUrl?: string;
}

interface TransactionJournalState {
  records: TransactionJournalRecord[];
  legacyQuarantine: TransactionJournalEnvelope['legacyQuarantine'];
  migratedAt: string | null;
  migrationDiagnostics: string[];
  hydrationComplete: boolean;

  runMigrationIfNeeded: () => void;
  journalApprovalSubmitted: (input: Omit<JournalSubmittedInput, 'context'> & { context: ApprovalJournalContext }) => JournalStoreResult;
  journalSwapSubmitted: (input: Omit<JournalSubmittedInput, 'context'> & { context: SwapJournalContext }) => JournalStoreResult;
  markTransactionPending: (recordId: string) => JournalStoreResult;
  applyConfirmedReceipt: (recordId: string, receipt: ReceiptSnapshot) => JournalStoreResult;
  applyRevertedReceipt: (recordId: string, receipt: ReceiptSnapshot) => JournalStoreResult;
  markTransactionUnknown: (recordId: string, error?: JournalError) => JournalStoreResult;
  markTransactionStale: (recordId: string) => JournalStoreResult;
  recordReconciliationAttempt: (recordId: string, patch: { error?: string; errorCategory?: string }) => JournalStoreResult;
  linkApprovalAndSwap: (approvalRecordId: string, swapRecordId: string) => JournalStoreResult;
  attachJournalError: (recordId: string, error: JournalError) => JournalStoreResult;
  getRecordById: (recordId: string) => TransactionJournalRecord | undefined;
  getRecordsByFlowId: (flowId: string) => TransactionJournalRecord[];
  getRecordsForWallet: (walletAddress: string | null | undefined) => TransactionJournalRecord[];
  getRecordsForWalletAndChain: (walletAddress: string | null | undefined, chainId: number) => TransactionJournalRecord[];
  getPendingRecordsForWallet: (walletAddress: string | null | undefined) => TransactionJournalRecord[];
  getApprovalForSwap: (swapRecordId: string) => ApprovalJournalRecord | undefined;
  getSwapForApproval: (approvalRecordId: string) => SwapJournalRecord | undefined;
  clearWalletRecords: (walletAddress: string) => void;
  enforceRetention: () => void;
  markStaleUnresolved: () => void;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sortBySubmittedDesc(a: TransactionJournalRecord, b: TransactionJournalRecord): number {
  return b.submittedAt.localeCompare(a.submittedAt);
}

function upsertRecord(
  records: TransactionJournalRecord[],
  record: TransactionJournalRecord,
): TransactionJournalRecord[] {
  const idx = records.findIndex((r) => r.id === record.id);
  if (idx >= 0) {
    const next = [...records];
    next[idx] = record;
    return next;
  }
  return [record, ...records];
}

function applyRetention(records: TransactionJournalRecord[]): TransactionJournalRecord[] {
  if (records.length <= MAX_JOURNAL_RECORDS) return records;

  const unresolved = records.filter((r) => UNRESOLVED_STATUSES.has(r.status));
  const resolved = records.filter((r) => !UNRESOLVED_STATUSES.has(r.status));

  const trimOrder = (a: TransactionJournalRecord, b: TransactionJournalRecord): number => {
    const rank = (s: JournalTransactionStatus): number => {
      if (s === 'confirmed') return 0;
      if (s === 'reverted') return 1;
      return 2;
    };
    const rankDiff = rank(a.status) - rank(b.status);
    if (rankDiff !== 0) return rankDiff;
    return a.submittedAt.localeCompare(b.submittedAt);
  };

  const sortedResolved = [...resolved].sort(trimOrder);
  const room = Math.max(MAX_JOURNAL_RECORDS - unresolved.length, 0);
  const keptResolved = sortedResolved.slice(Math.max(0, sortedResolved.length - room));
  return [...unresolved, ...keptResolved].sort(sortBySubmittedDesc);
}

function buildSubmittedRecord(
  kind: 'approval' | 'swap',
  input: JournalSubmittedInput,
): TransactionJournalRecord | null {
  const wallet = normalizeWalletAddress(input.walletAddress);
  const id = createJournalRecordId(input.chainId, kind, input.transactionHash);
  if (!wallet || !id) return null;

  const submittedAt = input.submittedAt ?? nowIso();
  const base = {
    schemaVersion: JOURNAL_RECORD_SCHEMA_VERSION,
    id,
    flowId: input.flowId || createFlowId(),
    kind,
    source: 'swaperex-client' as const,
    walletAddress: wallet,
    chainId: input.chainId,
    transactionHash: input.transactionHash.toLowerCase(),
    status: 'submitted' as const,
    submittedAt,
    updatedAt: submittedAt,
    relatedRecordIds: [] as string[],
    explorerUrl: input.explorerUrl ?? getExplorerTxUrl(input.chainId, input.transactionHash),
  };

  if (kind === 'approval') {
    return { ...base, kind: 'approval', context: input.context as ApprovalJournalContext };
  }
  return { ...base, kind: 'swap', context: input.context as SwapJournalContext };
}

function updateRecordById(
  records: TransactionJournalRecord[],
  recordId: string,
  updater: (record: TransactionJournalRecord) => TransactionJournalRecord | null,
): { records: TransactionJournalRecord[]; record: TransactionJournalRecord | null } {
  const idx = records.findIndex((r) => r.id === recordId);
  if (idx < 0) return { records, record: null };
  const updated = updater(records[idx]);
  if (!updated) return { records, record: null };
  const next = [...records];
  next[idx] = updated;
  return { records: next, record: updated };
}

function safePersistStorage(): Storage {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* private mode */
  }
  const memory = new Map<string, string>();
  return {
    get length() {
      return memory.size;
    },
    clear: () => memory.clear(),
    getItem: (key) => memory.get(key) ?? null,
    key: (index) => [...memory.keys()][index] ?? null,
    removeItem: (key) => {
      memory.delete(key);
    },
    setItem: (key, value) => {
      memory.set(key, value);
    },
  };
}

export const useTransactionJournalStore = create<TransactionJournalState>()(
  persist(
    (set, get) => ({
      records: [],
      legacyQuarantine: undefined,
      migratedAt: null,
      migrationDiagnostics: [],
      hydrationComplete: false,

      runMigrationIfNeeded: () => {
        const state = get();
        if (state.migratedAt) return;

        const existing: TransactionJournalEnvelope = {
          schemaVersion: JOURNAL_ENVELOPE_SCHEMA_VERSION,
          recordSchemaVersion: JOURNAL_RECORD_SCHEMA_VERSION,
          migratedAt: state.migratedAt ?? undefined,
          records: state.records,
          legacyQuarantine: state.legacyQuarantine,
        };

        const legacy = readLegacyStorageRaw();
        const result = migrateLegacyTransactionStorage({
          existingEnvelope: existing,
          pendingRaw: legacy.pendingRaw,
          historyRaw: legacy.historyRaw,
        });

        set({
          records: applyRetention(result.envelope.records),
          legacyQuarantine: result.envelope.legacyQuarantine,
          migratedAt: result.envelope.migratedAt ?? nowIso(),
          migrationDiagnostics: result.diagnostics,
        });
      },

      journalApprovalSubmitted: (input) => {
        try {
          const record = buildSubmittedRecord('approval', input);
          if (!record) {
            return { ok: false, reason: 'invalid_approval_submission', recoverable: true };
          }
          set((s) => ({ records: applyRetention(upsertRecord(s.records, record)) }));
          return { ok: true, record: record as ApprovalJournalRecord };
        } catch {
          return { ok: false, reason: 'storage_write_failed', recoverable: true };
        }
      },

      journalSwapSubmitted: (input) => {
        try {
          const record = buildSubmittedRecord('swap', input);
          if (!record) {
            return { ok: false, reason: 'invalid_swap_submission', recoverable: true };
          }
          set((s) => ({ records: applyRetention(upsertRecord(s.records, record)) }));
          return { ok: true, record: record as SwapJournalRecord };
        } catch {
          return { ok: false, reason: 'storage_write_failed', recoverable: true };
        }
      },

      markTransactionPending: (recordId) => {
        const { records, record } = updateRecordById(get().records, recordId, (r) =>
          transitionJournalRecord(r, 'TRANSACTION_PENDING', { lastCheckedAt: nowIso() }),
        );
        if (!record) return { ok: false, reason: 'transition_rejected', recoverable: true };
        set({ records });
        return { ok: true, record };
      },

      applyConfirmedReceipt: (recordId, receipt) => {
        const { records, record } = updateRecordById(get().records, recordId, (r) =>
          transitionJournalRecord(r, receiptEventForStatus('confirmed'), {
            lastCheckedAt: nowIso(),
            confirmedAt: receipt.confirmedAt,
            blockNumber: receipt.blockNumber,
            receipt,
          }),
        );
        if (!record) return { ok: false, reason: 'transition_rejected', recoverable: true };
        set({ records });
        return { ok: true, record };
      },

      applyRevertedReceipt: (recordId, receipt) => {
        const { records, record } = updateRecordById(get().records, recordId, (r) =>
          transitionJournalRecord(r, receiptEventForStatus('reverted'), {
            lastCheckedAt: nowIso(),
            blockNumber: receipt.blockNumber,
            receipt,
          }),
        );
        if (!record) return { ok: false, reason: 'transition_rejected', recoverable: true };
        set({ records });
        return { ok: true, record };
      },

      markTransactionUnknown: (recordId, error) => {
        const { records, record } = updateRecordById(get().records, recordId, (r) => {
          const patch = buildTransitionPatch(r, 'RECONCILIATION_UNKNOWN', {
            lastCheckedAt: nowIso(),
          });
          if (!patch) return null;
          return { ...r, ...patch, error: error ?? r.error };
        });
        if (!record) return { ok: false, reason: 'transition_rejected', recoverable: true };
        set({ records });
        return { ok: true, record };
      },

      markTransactionStale: (recordId) => {
        const { records, record } = updateRecordById(get().records, recordId, (r) =>
          transitionJournalRecord(r, 'TRANSACTION_STALE', { lastCheckedAt: nowIso() }),
        );
        if (!record) return { ok: false, reason: 'transition_rejected', recoverable: true };
        set({ records });
        return { ok: true, record };
      },

      recordReconciliationAttempt: (recordId, patch) => {
        const { records, record } = updateRecordById(get().records, recordId, (r) => ({
          ...r,
          updatedAt: nowIso(),
          lastCheckedAt: nowIso(),
          reconciliation: {
            attempts: (r.reconciliation?.attempts ?? 0) + 1,
            lastAttemptAt: nowIso(),
            lastProviderError: patch.error,
            lastProviderErrorCategory: patch.errorCategory,
            source: r.reconciliation?.source,
          },
        }));
        if (!record) return { ok: false, reason: 'record_not_found', recoverable: true };
        set({ records });
        return { ok: true, record };
      },

      linkApprovalAndSwap: (approvalRecordId, swapRecordId) => {
        const state = get();
        const approval = state.records.find((r) => r.id === approvalRecordId && r.kind === 'approval');
        const swap = state.records.find((r) => r.id === swapRecordId && r.kind === 'swap');
        if (!approval || !swap) {
          return { ok: false, reason: 'link_targets_missing', recoverable: true };
        }

        const next = state.records.map((r) => {
          if (r.id === approvalRecordId) {
            const related = [...new Set([...r.relatedRecordIds, swapRecordId])];
            return { ...r, relatedRecordIds: related, updatedAt: nowIso() };
          }
          if (r.id === swapRecordId && r.kind === 'swap') {
            const related = [...new Set([...r.relatedRecordIds, approvalRecordId])];
            return {
              ...r,
              relatedRecordIds: related,
              updatedAt: nowIso(),
              context: {
                ...r.context,
                approvalRecordId: approvalRecordId,
              },
            };
          }
          return r;
        });

        set({ records: next });
        const linked = next.find((r) => r.id === swapRecordId);
        return linked ? { ok: true, record: linked } : { ok: false, reason: 'link_failed', recoverable: true };
      },

      attachJournalError: (recordId, error) => {
        const { records, record } = updateRecordById(get().records, recordId, (r) => ({
          ...r,
          error,
          updatedAt: nowIso(),
        }));
        if (!record) return { ok: false, reason: 'record_not_found', recoverable: true };
        set({ records });
        return { ok: true, record };
      },

      getRecordById: (recordId) => get().records.find((r) => r.id === recordId),

      getRecordsByFlowId: (flowId) =>
        get()
          .records.filter((r) => r.flowId === flowId)
          .sort(sortBySubmittedDesc),

      getRecordsForWallet: (walletAddress) => {
        const wallet = walletAddress ? normalizeWalletAddress(walletAddress) : null;
        if (!wallet) return [];
        return get()
          .records.filter((r) => r.walletAddress === wallet)
          .sort(sortBySubmittedDesc);
      },

      getRecordsForWalletAndChain: (walletAddress, chainId) =>
        get()
          .getRecordsForWallet(walletAddress)
          .filter((r) => r.chainId === chainId),

      getPendingRecordsForWallet: (walletAddress) =>
        get()
          .getRecordsForWallet(walletAddress)
          .filter((r) => UNRESOLVED_STATUSES.has(r.status)),

      getApprovalForSwap: (swapRecordId) => {
        const swap = get().records.find((r) => r.id === swapRecordId && r.kind === 'swap');
        if (!swap) return undefined;
        const approvalId =
          swap.kind === 'swap'
            ? swap.context.approvalRecordId ?? swap.relatedRecordIds.find((id) => id.includes(':approval:'))
            : undefined;
        if (!approvalId) return undefined;
        const approval = get().records.find((r) => r.id === approvalId && r.kind === 'approval');
        return approval?.kind === 'approval' ? approval : undefined;
      },

      getSwapForApproval: (approvalRecordId) => {
        const approval = get().records.find((r) => r.id === approvalRecordId && r.kind === 'approval');
        if (!approval) return undefined;
        const swapId = approval.relatedRecordIds.find((id) => id.includes(':swap:'));
        if (!swapId) return undefined;
        const swap = get().records.find((r) => r.id === swapId && r.kind === 'swap');
        return swap?.kind === 'swap' ? swap : undefined;
      },

      clearWalletRecords: (walletAddress) => {
        const wallet = normalizeWalletAddress(walletAddress);
        if (!wallet) return;
        set((s) => ({
          records: s.records.filter((r) => r.walletAddress !== wallet),
        }));
      },

      enforceRetention: () => {
        set((s) => ({ records: applyRetention(s.records) }));
      },

      markStaleUnresolved: () => {
        const cutoff = Date.now() - JOURNAL_STALE_AFTER_MS;
        const next = get().records.map((r) => {
          if (!UNRESOLVED_STATUSES.has(r.status)) return r;
          const submittedMs = Date.parse(r.submittedAt);
          if (Number.isNaN(submittedMs) || submittedMs > cutoff) return r;
          if (r.status === 'stale') return r;
          return transitionJournalRecord(r, 'TRANSACTION_STALE', { lastCheckedAt: nowIso() }) ?? r;
        });
        set({ records: next });
      },
    }),
    {
      name: JOURNAL_STORAGE_KEY,
      version: JOURNAL_ENVELOPE_SCHEMA_VERSION,
      storage: createJSONStorage(() => safePersistStorage()),
      partialize: (state) => ({
        records: state.records,
        legacyQuarantine: state.legacyQuarantine,
        migratedAt: state.migratedAt,
        migrationDiagnostics: state.migrationDiagnostics,
      }),
      migrate: (persisted) => {
        if (isTransactionJournalEnvelope(persisted)) {
          return {
            records: persisted.records,
            legacyQuarantine: persisted.legacyQuarantine,
            migratedAt: persisted.migratedAt ?? null,
            migrationDiagnostics: [],
            hydrationComplete: false,
          };
        }
        const raw = persisted as { records?: unknown[]; legacyQuarantine?: unknown; migratedAt?: string };
        const sanitized = sanitizeEnvelopeRecords(Array.isArray(raw.records) ? raw.records : []);
        return {
          records: sanitized.valid,
          legacyQuarantine: raw.legacyQuarantine,
          migratedAt: raw.migratedAt ?? null,
          migrationDiagnostics: sanitized.skipped > 0 ? [`skipped_invalid_records:${sanitized.skipped}`] : [],
          hydrationComplete: false,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.runMigrationIfNeeded();
        state.markStaleUnresolved();
        state.enforceRetention();
        useTransactionJournalStore.setState({ hydrationComplete: true });
      },
    },
  ),
);

/** Apply receipt to journal by chain/kind/hash — convenience for useSwap integration. */
export function applyJournalReceiptUpdate(params: {
  chainId: number;
  kind: 'approval' | 'swap';
  transactionHash: string;
  receipt: { status?: number | null; blockNumber?: number | null; gasUsed?: bigint | null; gasPrice?: bigint | null; effectiveGasPrice?: bigint | null };
}): JournalStoreResult {
  const id = createJournalRecordId(params.chainId, params.kind, params.transactionHash);
  if (!id) return { ok: false, reason: 'invalid_record_id', recoverable: true };

  const store = useTransactionJournalStore.getState();
  const normalized = normalizeReceipt(params.receipt);
  if (!normalized) {
    return store.markTransactionUnknown(id);
  }

  if (normalized.status === 1) {
    return store.applyConfirmedReceipt(id, normalized);
  }
  return store.applyRevertedReceipt(id, normalized);
}

export function getJournalRecordId(
  chainId: number,
  kind: 'approval' | 'swap',
  transactionHash: string,
): string | null {
  return createJournalRecordId(chainId, kind, transactionHash);
}

export function hydrateJournalFromStorageRaw(raw: string | null): void {
  const envelope = parseTransactionJournalEnvelope(raw);
  if (!envelope) {
    useTransactionJournalStore.setState({
      records: [],
      legacyQuarantine: undefined,
      migratedAt: null,
      migrationDiagnostics: ['corrupt_envelope_reset'],
      hydrationComplete: true,
    });
    return;
  }
  useTransactionJournalStore.setState({
    records: envelope.records,
    legacyQuarantine: envelope.legacyQuarantine,
    migratedAt: envelope.migratedAt ?? null,
    hydrationComplete: true,
  });
  useTransactionJournalStore.getState().runMigrationIfNeeded();
}
