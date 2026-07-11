/**
 * Normalize ethers receipt objects into journal-safe JSON snapshots.
 */

import type { ReceiptSnapshot } from '@/types/transactionJournal';

export interface EthersLikeReceipt {
  status?: number | null;
  blockNumber?: number | null;
  gasUsed?: bigint | number | null;
  gasPrice?: bigint | number | null;
  effectiveGasPrice?: bigint | number | null;
}

function bigIntToString(value: bigint | number | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  return typeof value === 'bigint' ? value.toString() : String(value);
}

export function normalizeReceipt(receipt: EthersLikeReceipt): ReceiptSnapshot | null {
  if (receipt.status !== 0 && receipt.status !== 1) return null;
  if (receipt.blockNumber == null || typeof receipt.blockNumber !== 'number') return null;

  const effectiveGasPrice =
    bigIntToString(receipt.effectiveGasPrice) ?? bigIntToString(receipt.gasPrice);

  return {
    status: receipt.status,
    blockNumber: receipt.blockNumber,
    gasUsed: bigIntToString(receipt.gasUsed),
    effectiveGasPrice,
    confirmedAt: new Date().toISOString(),
  };
}

export function normalizeReceiptOrThrow(receipt: EthersLikeReceipt): ReceiptSnapshot {
  const normalized = normalizeReceipt(receipt);
  if (!normalized) {
    throw new Error('Unable to normalize receipt — missing status or block number');
  }
  return normalized;
}
