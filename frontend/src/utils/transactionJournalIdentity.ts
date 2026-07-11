/**
 * Deterministic journal record and flow identity helpers.
 */

import type { JournalRecordKind } from '@/types/transactionJournal';
import { isTransactionHash, normalizeTransactionHash } from '@/utils/transactionJournalValidation';

export function createJournalRecordId(
  chainId: number,
  kind: JournalRecordKind,
  transactionHash: string,
): string | null {
  const normalized = normalizeTransactionHash(transactionHash);
  if (!normalized) return null;
  if (!Number.isInteger(chainId) || chainId <= 0) return null;
  return `${chainId}:${kind}:${normalized}`;
}

export function createFlowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `flow-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function journalRecordIdsEqual(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function assertValidRecordIdForHash(
  chainId: number,
  kind: JournalRecordKind,
  transactionHash: string,
): void {
  if (!isTransactionHash(transactionHash)) {
    throw new Error('Invalid transaction hash for journal record id');
  }
  const id = createJournalRecordId(chainId, kind, transactionHash);
  if (!id) {
    throw new Error('Unable to derive journal record id');
  }
}
