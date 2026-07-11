/**
 * Projects journal swap records into legacy SwapRecord shape for existing UI consumers.
 */

import type { AssetInfo } from '@/types/api';
import type { SwapRecord } from '@/stores/swapHistoryStore';
import type { SwapJournalRecord, TransactionJournalRecord } from '@/types/transactionJournal';
import { mapJournalStatusToLegacySwapHistoryStatus } from '@/utils/transactionLifecycleMapping';
import { normalizeWalletAddress } from '@/utils/transactionJournalValidation';

function tokenFromContext(
  address: string,
  symbol: string,
  decimals: number,
  chainId: number,
): AssetInfo {
  const chain = chainId === 56 ? 'bsc' : chainId === 137 ? 'polygon' : 'ethereum';
  if (address === 'native') {
    return {
      symbol,
      name: symbol,
      chain,
      decimals,
      is_native: true,
    };
  }
  return {
    symbol,
    name: symbol,
    chain,
    decimals,
    is_native: false,
    contract_address: address,
  };
}

export function journalSwapRecordToSwapRecord(record: SwapJournalRecord): SwapRecord {
  const ctx = record.context;
  return {
    id: record.id,
    timestamp: Date.parse(record.submittedAt) || Date.now(),
    chainId: record.chainId,
    fromAsset: tokenFromContext(ctx.fromTokenAddress, ctx.fromTokenSymbol, ctx.fromTokenDecimals, record.chainId),
    toAsset: tokenFromContext(ctx.toTokenAddress, ctx.toTokenSymbol, ctx.toTokenDecimals, record.chainId),
    fromAmount: ctx.inputAmountDisplay,
    toAmount: ctx.expectedOutputDisplay,
    minimumToAmount: ctx.minimumOutputDisplay,
    txHash: record.transactionHash,
    explorerUrl: record.explorerUrl ?? '',
    status: mapJournalStatusToLegacySwapHistoryStatus(record.status),
    provider: ctx.provider,
    slippage: ctx.slippageBps / 100,
    toAddress: ctx.recipient,
  };
}

export function projectJournalToSwapRecords(
  records: TransactionJournalRecord[],
  walletAddress?: string | null,
): SwapRecord[] {
  const wallet = walletAddress ? normalizeWalletAddress(walletAddress) : null;
  return records
    .filter((r): r is SwapJournalRecord => r.kind === 'swap')
    .filter((r) => (wallet ? r.walletAddress === wallet : true))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .map(journalSwapRecordToSwapRecord);
}

export function getLatestPendingSwapJournalRecord(
  records: TransactionJournalRecord[],
  chainId: number,
  walletAddress: string,
): SwapJournalRecord | null {
  const wallet = normalizeWalletAddress(walletAddress);
  if (!wallet) return null;

  const pending = records
    .filter(
      (r): r is SwapJournalRecord =>
        r.kind === 'swap' &&
        r.walletAddress === wallet &&
        r.chainId === chainId &&
        ['submitted', 'pending', 'unknown', 'stale'].includes(r.status),
    )
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  return pending[0] ?? null;
}
