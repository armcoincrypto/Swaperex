/**
 * Pending swap read adapter — canonical writes go to transaction journal v2.
 * Legacy key preserved read-only for migration; no new writes after P17.2 cutover.
 */

import { useTransactionJournalStore } from '@/stores/transactionJournalStore';
import { getLatestPendingSwapJournalRecord } from '@/utils/journalToSwapHistoryAdapter';

export const PENDING_SWAP_STORAGE_KEY = 'swaperex-pending-swap-v1';

/** Drop stale entries so localStorage does not accumulate forever */
export const PENDING_SWAP_MAX_AGE_MS = 48 * 60 * 60 * 1000;

export type PendingSwapV1 = {
  v: 1;
  chainId: number;
  /** Wallet that signed (lowercase) */
  fromAddress: string;
  txHash: string;
  explorerUrl: string;
  submittedAt: number;
  fromSymbol: string;
  toSymbol: string;
  fromAmount: string;
  toAmount: string;
  outcomeUncertain?: boolean;
};

function journalRecordToPendingSwapV1(
  record: ReturnType<typeof getLatestPendingSwapJournalRecord>,
): PendingSwapV1 | null {
  if (!record) return null;
  const ctx = record.context;
  return {
    v: 1,
    chainId: record.chainId,
    fromAddress: record.walletAddress,
    txHash: record.transactionHash,
    explorerUrl: record.explorerUrl ?? '',
    submittedAt: Date.parse(record.submittedAt) || Date.now(),
    fromSymbol: ctx.fromTokenSymbol,
    toSymbol: ctx.toTokenSymbol,
    fromAmount: ctx.inputAmountDisplay,
    toAmount: ctx.expectedOutputDisplay,
    outcomeUncertain: record.status === 'unknown' || record.status === 'stale',
  };
}

export function readPendingSwap(): PendingSwapV1 | null {
  try {
    useTransactionJournalStore.getState().runMigrationIfNeeded();
    const records = useTransactionJournalStore.getState().records;
    const pending = records
      .filter(
        (r) =>
          r.kind === 'swap' &&
          ['submitted', 'pending', 'unknown', 'stale'].includes(r.status),
      )
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];

    if (pending?.kind === 'swap') {
      const mapped = journalRecordToPendingSwapV1(pending);
      if (mapped && Date.now() - mapped.submittedAt <= PENDING_SWAP_MAX_AGE_MS) {
        return mapped;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** @deprecated P17.2 cutover — journal is the write path. No-op for backwards compatibility. */
export function writePendingSwap(_entry: Omit<PendingSwapV1, 'v'>): void {
  /* no new legacy writes */
}

/** @deprecated Updates journal record via uncertain status path in useSwap. */
export function markPendingSwapOutcomeUncertain(): void {
  /* legacy no-op — useSwap marks journal unknown directly */
}

/** Clears unresolved pending swap state in journal (marks stale) for active account. */
export function clearPendingSwap(): void {
  try {
    const raw = readPendingSwap();
    if (!raw) return;
    const id = `${raw.chainId}:swap:${raw.txHash.toLowerCase()}`;
    const record = useTransactionJournalStore.getState().getRecordById(id);
    if (record && ['submitted', 'pending', 'unknown'].includes(record.status)) {
      useTransactionJournalStore.getState().markTransactionStale(id);
    }
  } catch {
    /* noop */
  }
}

export function getPendingSwapForAccount(chainId: number, address: string): PendingSwapV1 | null {
  try {
    useTransactionJournalStore.getState().runMigrationIfNeeded();
    const record = getLatestPendingSwapJournalRecord(
      useTransactionJournalStore.getState().records,
      chainId,
      address,
    );
    const mapped = journalRecordToPendingSwapV1(record);
    if (!mapped) return null;
    if (Date.now() - mapped.submittedAt > PENDING_SWAP_MAX_AGE_MS) return null;
    return mapped;
  } catch {
    return null;
  }
}
