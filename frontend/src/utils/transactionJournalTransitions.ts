/**
 * Guarded journal status transitions — single authority for persistent status changes.
 */

import type {
  JournalTransitionEvent,
  JournalTransactionStatus,
  ReceiptSnapshot,
  TransactionJournalRecord,
} from '@/types/transactionJournal';

export interface TransitionResult {
  allowed: boolean;
  nextStatus: JournalTransactionStatus;
  reason?: string;
}

const ALLOWED: Record<
  JournalTransactionStatus,
  Partial<Record<JournalTransitionEvent, JournalTransactionStatus>>
> = {
  submitted: {
    TRANSACTION_PENDING: 'pending',
    RECEIPT_CONFIRMED: 'confirmed',
    RECEIPT_REVERTED: 'reverted',
    RECONCILIATION_UNKNOWN: 'unknown',
  },
  pending: {
    RECEIPT_CONFIRMED: 'confirmed',
    RECEIPT_REVERTED: 'reverted',
    RECONCILIATION_UNKNOWN: 'unknown',
    TRANSACTION_STALE: 'stale',
  },
  unknown: {
    MANUAL_RECHECK_STARTED: 'pending',
    RECEIPT_CONFIRMED: 'confirmed',
    RECEIPT_REVERTED: 'reverted',
    TRANSACTION_STALE: 'stale',
  },
  stale: {
    MANUAL_RECHECK_STARTED: 'pending',
    RECEIPT_CONFIRMED: 'confirmed',
    RECEIPT_REVERTED: 'reverted',
    RECONCILIATION_UNKNOWN: 'unknown',
  },
  confirmed: {},
  reverted: {},
};

export function resolveTransition(
  current: JournalTransactionStatus,
  event: JournalTransitionEvent,
): TransitionResult {
  if (current === 'confirmed' || current === 'reverted') {
    if (event === 'RECEIPT_CONFIRMED' && current === 'confirmed') {
      return { allowed: true, nextStatus: 'confirmed' };
    }
    if (event === 'RECEIPT_REVERTED' && current === 'reverted') {
      return { allowed: true, nextStatus: 'reverted' };
    }
    return {
      allowed: false,
      nextStatus: current,
      reason: `Terminal status ${current} cannot transition via ${event}`,
    };
  }

  const next = ALLOWED[current][event];
  if (!next) {
    return {
      allowed: false,
      nextStatus: current,
      reason: `Transition ${current} -> (${event}) not allowed`,
    };
  }
  return { allowed: true, nextStatus: next };
}

export function journalStatusFromReceipt(receiptStatus: number | null | undefined): 'confirmed' | 'reverted' | null {
  if (receiptStatus === 1) return 'confirmed';
  if (receiptStatus === 0) return 'reverted';
  return null;
}

export function receiptEventForStatus(
  status: 'confirmed' | 'reverted',
): 'RECEIPT_CONFIRMED' | 'RECEIPT_REVERTED' {
  return status === 'confirmed' ? 'RECEIPT_CONFIRMED' : 'RECEIPT_REVERTED';
}

export interface TransitionPatch {
  status: JournalTransactionStatus;
  updatedAt: string;
  lastCheckedAt?: string;
  confirmedAt?: string;
  blockNumber?: number;
  receipt?: ReceiptSnapshot;
}

export function buildTransitionPatch(
  record: TransactionJournalRecord,
  event: JournalTransitionEvent,
  extras?: Partial<TransitionPatch>,
): TransitionPatch | null {
  const result = resolveTransition(record.status, event);
  if (!result.allowed) {
    if (
      (record.status === 'confirmed' && event === 'RECEIPT_CONFIRMED') ||
      (record.status === 'reverted' && event === 'RECEIPT_REVERTED')
    ) {
      return {
        status: record.status,
        updatedAt: extras?.updatedAt ?? new Date().toISOString(),
        ...extras,
      };
    }
    return null;
  }
  return {
    status: result.nextStatus,
    updatedAt: extras?.updatedAt ?? new Date().toISOString(),
    ...extras,
  };
}

export function transitionJournalRecord(
  record: TransactionJournalRecord,
  event: JournalTransitionEvent,
  extras?: Partial<TransitionPatch>,
): TransactionJournalRecord | null {
  const patch = buildTransitionPatch(record, event, extras);
  if (!patch) return null;
  return { ...record, ...patch };
}
