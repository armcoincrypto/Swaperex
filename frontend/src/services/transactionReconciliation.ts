/**
 * Pure known-transaction reconciliation — no UI or store side effects.
 */

import type { Provider } from 'ethers';
import type {
  ReceiptSnapshot,
  ReconcileTransactionResult,
  TransactionJournalRecord,
} from '@/types/transactionJournal';
import { normalizeReceipt } from '@/utils/transactionJournalReceipt';
import {
  isSupportedJournalChain,
  isTransactionHash,
} from '@/utils/transactionJournalValidation';

export interface NormalizedReconciliationError {
  category: 'network_error' | 'rpc_error' | 'timeout' | 'unsupported_chain' | 'invalid_record';
  message: string;
}

export interface ReconcileKnownTransactionOptions {
  readProvider: Provider;
  signal?: AbortSignal;
  checkTransactionExistence?: boolean;
}

function classifyProviderError(err: unknown): NormalizedReconciliationError {
  const message = err instanceof Error ? err.message : String(err);
  if (/timeout/i.test(message)) {
    return { category: 'timeout', message: message.slice(0, 240) };
  }
  if (/network|fetch|ECONN|socket/i.test(message)) {
    return { category: 'network_error', message: message.slice(0, 240) };
  }
  return { category: 'rpc_error', message: message.slice(0, 240) };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
}

export function validateRecordForReconciliation(
  record: TransactionJournalRecord,
): ReconcileTransactionResult | null {
  if (!isSupportedJournalChain(record.chainId)) {
    return { kind: 'unsupported_chain' };
  }
  if (!isTransactionHash(record.transactionHash)) {
    return { kind: 'invalid_record' };
  }
  return null;
}

export async function reconcileKnownTransaction(
  record: TransactionJournalRecord,
  options: ReconcileKnownTransactionOptions,
): Promise<ReconcileTransactionResult> {
  const invalid = validateRecordForReconciliation(record);
  if (invalid) return invalid;

  const { readProvider, signal, checkTransactionExistence = true } = options;

  try {
    throwIfAborted(signal);
    const receipt = await readProvider.getTransactionReceipt(record.transactionHash);
    throwIfAborted(signal);

    if (receipt) {
      const snapshot: ReceiptSnapshot | null = normalizeReceipt(receipt);
      if (!snapshot) {
        return {
          kind: 'provider_error',
          error: {
            category: 'rpc_error',
            message: 'Receipt returned without a valid status',
          },
        };
      }
      if (snapshot.status === 1) {
        return { kind: 'confirmed', receipt: snapshot };
      }
      return { kind: 'reverted', receipt: snapshot };
    }

    if (!checkTransactionExistence) {
      return { kind: 'not_found' };
    }

    throwIfAborted(signal);
    const tx = await readProvider.getTransaction(record.transactionHash);
    if (tx) {
      return { kind: 'pending', transactionSeen: true };
    }
    return { kind: 'not_found' };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        kind: 'provider_error',
        error: { category: 'timeout', message: 'Reconciliation aborted' },
      };
    }
    return {
      kind: 'provider_error',
      error: classifyProviderError(err),
    };
  }
}

export function classifyReceiptResult(
  receiptStatus: number | null | undefined,
): 'confirmed' | 'reverted' | null {
  if (receiptStatus === 1) return 'confirmed';
  if (receiptStatus === 0) return 'reverted';
  return null;
}
