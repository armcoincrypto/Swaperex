/**
 * Adapters: journal, explorer, and legacy transfer → UnifiedActivityItem.
 */

import type { SwapRecord } from '@/stores/swapHistoryStore';
import type { Transaction } from '@/services/transactionHistory';
import type {
  ApprovalJournalRecord,
  SwapJournalRecord,
  TransactionJournalRecord,
} from '@/types/transactionJournal';
import type {
  UnifiedActivityItem,
  UnifiedActivityKind,
  UnifiedActivityStatus,
} from '@/types/unifiedActivity';
import { journalSwapRecordToSwapRecord } from '@/utils/journalToSwapHistoryAdapter';
import { activityNeedsAttention } from '@/utils/activityPresentation';

const APPROVAL_METHODS = ['0x095ea7b3', '0x39509351', '0xa22cb465'];

function baseItem(
  partial: Omit<UnifiedActivityItem, 'needsAttention'> & { status: UnifiedActivityStatus },
): UnifiedActivityItem {
  return {
    ...partial,
    needsAttention: activityNeedsAttention(partial.status),
  };
}

export function journalRecordToUnifiedItem(
  record: TransactionJournalRecord,
): UnifiedActivityItem | null {
  const ts = Date.parse(record.submittedAt) || Date.now();

  if (record.kind === 'approval') {
    return approvalRecordToUnified(record, ts);
  }
  if (record.kind === 'swap') {
    return swapRecordToUnified(record, ts);
  }
  return null;
}

function approvalRecordToUnified(
  record: ApprovalJournalRecord,
  ts: number,
): UnifiedActivityItem {
  const ctx = record.context;
  const amount = ctx.approvedAmountDisplay ?? '—';
  return baseItem({
    id: `journal:${record.id}`,
    source: 'journal',
    kind: 'approval',
    walletAddress: record.walletAddress,
    chainId: record.chainId,
    transactionHash: record.transactionHash,
    status: record.status,
    timestamp: record.submittedAt,
    ts,
    title: `Approve ${ctx.tokenSymbol}`,
    subtitle: `${amount} ${ctx.tokenSymbol}`,
    fromAsset: { symbol: ctx.tokenSymbol, amount },
    explorerUrl: record.explorerUrl,
    flowId: record.flowId,
    relatedItemIds: record.relatedRecordIds,
    confidence: 'journal-context',
    provider: ctx.provider,
    canRepeat: false,
  });
}

function swapRecordToUnified(record: SwapJournalRecord, ts: number): UnifiedActivityItem {
  const ctx = record.context;
  const localRecord = journalSwapRecordToSwapRecord(record);
  return baseItem({
    id: `journal:${record.id}`,
    source: 'journal',
    kind: 'swap',
    walletAddress: record.walletAddress,
    chainId: record.chainId,
    transactionHash: record.transactionHash,
    status: record.status,
    timestamp: record.submittedAt,
    ts,
    title: `${ctx.fromTokenSymbol} → ${ctx.toTokenSymbol}`,
    subtitle: `${ctx.inputAmountDisplay} ${ctx.fromTokenSymbol} → ${ctx.expectedOutputDisplay} ${ctx.toTokenSymbol}`,
    fromAsset: { symbol: ctx.fromTokenSymbol, amount: ctx.inputAmountDisplay },
    toAsset: { symbol: ctx.toTokenSymbol, amount: ctx.expectedOutputDisplay },
    amountIn: ctx.inputAmountDisplay,
    amountOut: ctx.expectedOutputDisplay,
    explorerUrl: record.explorerUrl,
    flowId: record.flowId,
    relatedItemIds: record.relatedRecordIds,
    confidence: 'journal-context',
    provider: ctx.provider,
    canRepeat: record.status === 'confirmed',
    localRecord,
  });
}

function classifyExplorerKind(tx: Transaction): UnifiedActivityKind {
  if (tx.isSwap) return 'swap';
  const methodId = tx.methodId?.toLowerCase();
  if (methodId && APPROVAL_METHODS.includes(methodId)) return 'approval';
  if (tx.value !== '0' && tx.valueFormatted !== '0') return 'transfer';
  if (tx.methodId && tx.methodId !== '0x') return 'contract-interaction';
  return 'unknown';
}

function explorerStatus(tx: Transaction): UnifiedActivityStatus {
  if (tx.status === 'pending') return 'pending';
  if (tx.status === 'failed') return 'reverted';
  return 'confirmed';
}

export function explorerTransactionToUnifiedItem(
  tx: Transaction,
  walletAddress: string,
): UnifiedActivityItem {
  const kind = classifyExplorerKind(tx);
  const status = explorerStatus(tx);
  const title =
    kind === 'swap'
      ? tx.swapRouter || 'Swap'
      : kind === 'approval'
        ? 'Token approval'
        : kind === 'transfer'
          ? 'Transfer'
          : kind === 'contract-interaction'
            ? 'Contract interaction'
            : 'Transaction';

  return baseItem({
    id: `explorer:${tx.chainId}:${kind}:${tx.hash.toLowerCase()}`,
    source: 'explorer',
    kind,
    walletAddress: walletAddress.toLowerCase(),
    chainId: tx.chainId,
    transactionHash: tx.hash,
    status,
    timestamp: new Date(tx.timestamp).toISOString(),
    ts: tx.timestamp,
    title,
    subtitle: tx.valueFormatted !== '0' ? tx.valueFormatted : undefined,
    explorerUrl: tx.explorerUrl,
    confidence: 'chain-observed',
    provider: tx.swapRouter,
    canRepeat: false,
  });
}

export function legacyTransferToUnifiedItem(
  record: SwapRecord,
  walletAddress?: string,
): UnifiedActivityItem {
  const shortAddr = record.toAddress
    ? `${record.toAddress.slice(0, 6)}...${record.toAddress.slice(-4)}`
    : '';
  return baseItem({
    id: `legacy-transfer:${record.txHash || record.id}`,
    source: 'legacy-transfer',
    kind: 'transfer',
    walletAddress: walletAddress?.toLowerCase() ?? '',
    chainId: record.chainId,
    transactionHash: record.txHash,
    status: record.status === 'success' ? 'confirmed' : record.status === 'failed' ? 'reverted' : record.status === 'uncertain' ? 'unknown' : 'pending',
    timestamp: new Date(record.timestamp).toISOString(),
    ts: record.timestamp,
    title: `Send ${record.fromAsset.symbol}`,
    subtitle: `${record.fromAmount} ${record.fromAsset.symbol}${shortAddr ? ` → ${shortAddr}` : ''}`,
    fromAsset: { symbol: record.fromAsset.symbol, amount: record.fromAmount },
    explorerUrl: record.explorerUrl,
    confidence: 'legacy-local',
    provider: record.provider,
    canRepeat: false,
    localRecord: record,
  });
}
