/**
 * Apply pure reconciliation results to the journal store with guarded transitions.
 */

import type {
  ReconcileTransactionResult,
  ReconciliationMetadata,
  TransactionJournalRecord,
} from '@/types/transactionJournal';
import { JOURNAL_STALE_AFTER_MS } from '@/types/transactionJournal';
import { useTransactionJournalStore } from '@/stores/transactionJournalStore';

export const RECONCILIATION_ACTIVE_WINDOW_MS = 2 * 60 * 1000;
export const RECONCILIATION_BACKOFF_WINDOW_MS = 15 * 60 * 1000;
export const RECONCILIATION_INITIAL_INTERVAL_MS = 6_000;
export const RECONCILIATION_BACKOFF_INTERVAL_MS = 30_000;
export const RECONCILIATION_MAX_CONCURRENCY = 3;
export const RECONCILIATION_PROVIDER_ERROR_UNKNOWN_THRESHOLD = 2;
export const RECONCILIATION_NOT_FOUND_UNKNOWN_AFTER_MS = 30 * 60 * 1000;
export const MANUAL_RECHECK_COOLDOWN_MS = 4_000;

const UNRESOLVED = new Set(['submitted', 'pending', 'unknown', 'stale']);

function recordAgeMs(record: TransactionJournalRecord): number {
  const submitted = Date.parse(record.submittedAt);
  return Number.isNaN(submitted) ? 0 : Date.now() - submitted;
}

export function shouldMarkRecordStale(record: TransactionJournalRecord): boolean {
  if (!UNRESOLVED.has(record.status)) return false;
  return recordAgeMs(record) >= JOURNAL_STALE_AFTER_MS;
}

export function applyReconciliationResultToJournal(
  record: TransactionJournalRecord,
  result: ReconcileTransactionResult,
  source: ReconciliationMetadata['source'] = 'refresh-recovery',
): void {
  const store = useTransactionJournalStore.getState();

  if (result.kind === 'confirmed') {
    store.applyConfirmedReceipt(record.id, result.receipt);
    store.recordReconciliationAttempt(record.id, { errorCategory: 'confirmed' });
    return;
  }

  if (result.kind === 'reverted') {
    store.applyRevertedReceipt(record.id, result.receipt);
    store.recordReconciliationAttempt(record.id, { errorCategory: 'reverted' });
    return;
  }

  if (result.kind === 'pending') {
    store.markTransactionPending(record.id);
    store.recordReconciliationAttempt(record.id, {
      error: result.transactionSeen ? 'transaction_seen' : undefined,
      errorCategory: 'pending',
    });
    return;
  }

  if (result.kind === 'not_found') {
    store.recordReconciliationAttempt(record.id, { errorCategory: 'not_found' });
    const age = recordAgeMs(record);
    const attempts = (record.reconciliation?.attempts ?? 0) + 1;

    if (shouldMarkRecordStale(record)) {
      store.markTransactionStale(record.id);
      return;
    }

    if (age < RECONCILIATION_NOT_FOUND_UNKNOWN_AFTER_MS) {
      if (record.status === 'submitted') {
        store.markTransactionPending(record.id);
      }
      return;
    }

    if (attempts >= 3) {
      store.markTransactionUnknown(record.id, {
        category: 'network_error',
        technicalSummary: 'Transaction not found after bounded checks',
        occurredAt: new Date().toISOString(),
        stage: 'reconciliation',
        broadcastKnown: true,
        retryable: true,
      });
    } else if (record.status === 'submitted') {
      store.markTransactionPending(record.id);
    }
    return;
  }

  if (result.kind === 'provider_error') {
    store.recordReconciliationAttempt(record.id, {
      error: result.error.message,
      errorCategory: result.error.category,
    });

    if (shouldMarkRecordStale(record)) {
      store.markTransactionStale(record.id);
      return;
    }

    const attempts = (record.reconciliation?.attempts ?? 0) + 1;
    if (attempts >= RECONCILIATION_PROVIDER_ERROR_UNKNOWN_THRESHOLD) {
      store.markTransactionUnknown(record.id, {
        category: result.error.category === 'timeout' ? 'network_error' : 'rpc_error',
        technicalSummary: result.error.message,
        occurredAt: new Date().toISOString(),
        stage: 'reconciliation',
        broadcastKnown: true,
        retryable: true,
      });
    }
    return;
  }

  if (result.kind === 'unsupported_chain' || result.kind === 'invalid_record') {
    store.recordReconciliationAttempt(record.id, {
      errorCategory: result.kind,
    });
  }

  void source;
}

export function getReconciliationIntervalMs(record: TransactionJournalRecord): number | null {
  if (!UNRESOLVED.has(record.status)) return null;
  const age = recordAgeMs(record);
  if (age <= RECONCILIATION_ACTIVE_WINDOW_MS) {
    return RECONCILIATION_INITIAL_INTERVAL_MS;
  }
  if (age <= RECONCILIATION_BACKOFF_WINDOW_MS) {
    return RECONCILIATION_BACKOFF_INTERVAL_MS;
  }
  return null;
}
