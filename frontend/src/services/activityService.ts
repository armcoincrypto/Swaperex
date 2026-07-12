/**
 * Activity Service — canonical wallet-scoped activity aggregation (P17.4).
 *
 * Merges journal records, legacy transfers, and explorer data into
 * UnifiedActivityItem presentation rows. Legacy ActivityItem helpers remain
 * for export compatibility and older tests.
 */

import type { SwapRecord } from '@/stores/swapHistoryStore';
import type { TransactionJournalRecord } from '@/types/transactionJournal';
import type {
  UnifiedActivityItem,
  UnifiedActivityResult,
} from '@/types/unifiedActivity';
import {
  getMultiChainTransactions,
  type Transaction,
  formatTimeAgo as txFormatTimeAgo,
} from '@/services/transactionHistory';
import {
  explorerTransactionToUnifiedItem,
  journalRecordToUnifiedItem,
  legacyTransferToUnifiedItem,
} from '@/utils/unifiedActivityAdapters';
import { dedupeUnifiedActivityItems } from '@/utils/unifiedActivityDedupe';
import {
  filterUnifiedActivityGroups,
  groupUnifiedActivityItems,
} from '@/utils/unifiedActivityFlowGrouping';

// ─── Types ─────────────────────────────────────────────────────────

export type ActivityType = 'swap' | 'approval' | 'transfer';
export type ActivityStatus = 'success' | 'pending' | 'failed' | 'uncertain';

export interface ActivityItem {
  id: string;
  chainId: number;
  type: ActivityType;
  status: ActivityStatus;
  ts: number;
  txHash?: string;
  title: string;
  detail: string;
  tokenIn?: { symbol: string; amount: string };
  tokenOut?: { symbol: string; amount: string };
  provider?: string;
  explorerUrl?: string;
  canRepeat: boolean;
  /** Original local record for repeat functionality */
  localRecord?: SwapRecord;
}

// ─── Chain mapping ─────────────────────────────────────────────────

const CHAIN_LABELS: Record<number, string> = {
  1: 'ETH',
  56: 'BSC',
  137: 'Polygon',
  42161: 'Arbitrum',
};

// ─── Normalization ─────────────────────────────────────────────────

/** Normalize a local SwapRecord to ActivityItem */
export function normalizeLocalRecord(record: SwapRecord): ActivityItem {
  const isTransfer = record.provider === 'transfer';

  if (isTransfer) {
    const shortAddr = record.toAddress
      ? `${record.toAddress.slice(0, 6)}...${record.toAddress.slice(-4)}`
      : '';
    return {
      id: `local:${record.txHash || record.id}`,
      chainId: record.chainId,
      type: 'transfer',
      status: record.status,
      ts: record.timestamp,
      txHash: record.txHash,
      title: `Send ${record.fromAsset.symbol}`,
      detail: `${record.fromAmount} ${record.fromAsset.symbol}${shortAddr ? ` → ${shortAddr}` : ''}`,
      tokenIn: { symbol: record.fromAsset.symbol, amount: record.fromAmount },
      provider: record.provider,
      explorerUrl: record.explorerUrl,
      canRepeat: false,
      localRecord: record,
    };
  }

  const quoteOut = `~${parseFloat(record.toAmount).toFixed(4)} ${record.toAsset.symbol}`;
  const minPart =
    record.status === 'success' && record.minimumToAmount
      ? ` · min ${record.minimumToAmount}`
      : '';

  return {
    id: `local:${record.txHash || record.id}`,
    chainId: record.chainId,
    type: 'swap',
    status: record.status,
    ts: record.timestamp,
    txHash: record.txHash,
    title: `${record.fromAsset.symbol} → ${record.toAsset.symbol}`,
    detail: `${record.fromAmount} ${record.fromAsset.symbol} → ${quoteOut}${minPart}`,
    tokenIn: { symbol: record.fromAsset.symbol, amount: record.fromAmount },
    tokenOut: { symbol: record.toAsset.symbol, amount: parseFloat(record.toAmount).toFixed(4) },
    provider: record.provider,
    explorerUrl: record.explorerUrl,
    canRepeat: record.status === 'success',
    localRecord: record,
  };
}

/** Known approval method signatures */
const APPROVAL_METHODS = ['0x095ea7b3', '0x39509351', '0xa22cb465'];

/** Classify transaction type from method ID and context */
function classifyTransaction(tx: Transaction): { type: ActivityType; title: string } {
  if (tx.isSwap) {
    return { type: 'swap', title: tx.swapRouter || 'Swap' };
  }

  const methodId = tx.methodId?.toLowerCase();
  if (methodId && APPROVAL_METHODS.includes(methodId)) {
    return { type: 'approval', title: 'Token Approval' };
  }

  // Received tokens (value > 0 sent to this address)
  if (tx.value !== '0' && tx.valueFormatted !== '0') {
    return { type: 'transfer', title: 'Transfer' };
  }

  // Contract interaction (has input data but no value)
  return { type: 'transfer', title: 'Contract Interaction' };
}

/** Normalize a blockchain Transaction to ActivityItem */
export function normalizeTransaction(tx: Transaction): ActivityItem {
  const { type, title } = classifyTransaction(tx);

  return {
    id: `chain:${tx.hash}`,
    chainId: tx.chainId,
    type,
    status: tx.status === 'success' ? 'success' : 'failed',
    ts: tx.timestamp,
    txHash: tx.hash,
    title,
    detail: tx.valueFormatted !== '0' ? tx.valueFormatted : `on ${CHAIN_LABELS[tx.chainId] || 'Chain'}`,
    provider: tx.swapRouter,
    explorerUrl: tx.explorerUrl,
    canRepeat: false,
  };
}

// ─── Merge & Dedup ─────────────────────────────────────────────────

/**
 * Merge local records and explorer transactions.
 * Dedup by txHash — local records take priority (they have token details).
 * Sort by timestamp descending.
 */
export function mergeLocalAndExplorer(
  localRecords: SwapRecord[],
  explorerTxs: Transaction[]
): ActivityItem[] {
  const seen = new Set<string>();
  const merged: ActivityItem[] = [];

  // Local records first (have full token details + repeat ability)
  for (const record of localRecords) {
    const item = normalizeLocalRecord(record);
    if (record.txHash) {
      seen.add(record.txHash.toLowerCase());
    }
    merged.push(item);
  }

  // Explorer transactions (skip duplicates)
  for (const tx of explorerTxs) {
    if (seen.has(tx.hash.toLowerCase())) continue;
    seen.add(tx.hash.toLowerCase());
    merged.push(normalizeTransaction(tx));
  }

  // Sort by timestamp descending
  return merged.sort((a, b) => b.ts - a.ts);
}

// ─── Fetch & Merge ─────────────────────────────────────────────────

/**
 * Fetch explorer history and merge with local records.
 * Returns unified ActivityItem[] sorted by time.
 */
export async function fetchMergedActivity(
  address: string,
  chainIds: number[],
  localRecords: SwapRecord[],
  limitPerChain: number = 10
): Promise<ActivityItem[]> {
  const explorerTxs = await getMultiChainTransactions(address, chainIds, limitPerChain);
  return mergeLocalAndExplorer(localRecords, explorerTxs);
}

// ─── P17.4 Unified aggregation ───────────────────────────────────────

/** Explorer-supported chain IDs for portfolio activity. */
export const ACTIVITY_CHAIN_IDS = [1, 56, 137];

const MAX_JOURNAL_ACTIVITY = 200;

function journalItemsForWallet(
  walletAddress: string,
  journalRecords: TransactionJournalRecord[],
): UnifiedActivityItem[] {
  const wallet = walletAddress.toLowerCase();
  const items: UnifiedActivityItem[] = [];
  for (const record of journalRecords.slice(0, MAX_JOURNAL_ACTIVITY)) {
    if (record.walletAddress !== wallet) continue;
    const item = journalRecordToUnifiedItem(record);
    if (item) items.push(item);
  }
  return items;
}

function transferItemsForWallet(
  walletAddress: string,
  transferRecords: SwapRecord[],
): UnifiedActivityItem[] {
  return transferRecords.map((record) => legacyTransferToUnifiedItem(record, walletAddress));
}

/**
 * Build unified wallet activity from in-memory sources (no network).
 */
export function buildUnifiedWalletActivity(params: {
  walletAddress: string;
  journalRecords: TransactionJournalRecord[];
  transferRecords: SwapRecord[];
  explorerTxs?: Transaction[];
  explorerStatus?: UnifiedActivityResult['sources']['explorer']['status'];
  explorerMessage?: string;
}): UnifiedActivityResult {
  const {
    walletAddress,
    journalRecords,
    transferRecords,
    explorerTxs = [],
    explorerStatus = explorerTxs.length > 0 ? 'ok' : 'skipped',
    explorerMessage,
  } = params;

  const journalItems = journalItemsForWallet(walletAddress, journalRecords);
  const transferItems = transferItemsForWallet(walletAddress, transferRecords);
  const explorerItems = explorerTxs.map((tx) =>
    explorerTransactionToUnifiedItem(tx, walletAddress),
  );

  const items = dedupeUnifiedActivityItems([
    ...journalItems,
    ...explorerItems,
    ...transferItems,
  ]);

  const groups = groupUnifiedActivityItems(items);
  const attentionItems = items.filter((item) => item.needsAttention);

  return {
    items,
    groups,
    attentionItems,
    sources: {
      journal: { status: 'ok', count: journalItems.length },
      explorer: {
        status: explorerStatus,
        message: explorerMessage,
        count: explorerItems.length,
      },
      transfers: { status: 'ok', count: transferItems.length },
    },
  };
}

/**
 * Fetch explorer activity and merge with journal + legacy transfers.
 */
export async function fetchUnifiedWalletActivity(
  walletAddress: string,
  journalRecords: TransactionJournalRecord[],
  transferRecords: SwapRecord[],
  chainIds: number[] = ACTIVITY_CHAIN_IDS,
  limitPerChain: number = 10,
): Promise<UnifiedActivityResult> {
  try {
    const explorerTxs = await getMultiChainTransactions(walletAddress, chainIds, limitPerChain);
    return buildUnifiedWalletActivity({
      walletAddress,
      journalRecords,
      transferRecords,
      explorerTxs,
      explorerStatus: 'ok',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Explorer unavailable';
    return buildUnifiedWalletActivity({
      walletAddress,
      journalRecords,
      transferRecords,
      explorerTxs: [],
      explorerStatus: 'error',
      explorerMessage: message,
    });
  }
}

/** Compact recent journal flows for swap-page strip (excludes active recovery flow). */
export function getCompactJournalActivity(
  walletAddress: string,
  chainId: number,
  journalRecords: TransactionJournalRecord[],
  maxItems: number,
  excludeFlowId?: string | null,
): UnifiedActivityItem[] {
  const wallet = walletAddress.toLowerCase();
  const items = journalRecords
    .filter(
      (r) =>
        r.walletAddress === wallet &&
        r.chainId === chainId &&
        r.flowId !== excludeFlowId,
    )
    .map((r) => journalRecordToUnifiedItem(r))
    .filter((item): item is UnifiedActivityItem => item !== null);

  const attention = items.filter((item) => item.needsAttention);
  const resolved = items.filter((item) => !item.needsAttention);
  attention.sort((a, b) => b.ts - a.ts);
  resolved.sort((a, b) => b.ts - a.ts);

  const seenFlow = new Set<string>();
  const compact: UnifiedActivityItem[] = [];

  const pushUnique = (item: UnifiedActivityItem) => {
    const key = item.flowId ? `flow:${item.flowId}` : item.id;
    if (seenFlow.has(key)) return;
    seenFlow.add(key);
    compact.push(item);
  };

  for (const item of attention) {
    if (compact.length >= maxItems) break;
    pushUnique(item);
  }
  for (const item of resolved) {
    if (compact.length >= maxItems) break;
    pushUnique(item);
  }

  return compact;
}

export function unifiedActivityItemToLegacy(item: UnifiedActivityItem): ActivityItem {
  const legacyStatus: ActivityStatus =
    item.status === 'confirmed'
      ? 'success'
      : item.status === 'reverted'
        ? 'failed'
        : item.status === 'unknown' || item.status === 'stale'
          ? 'uncertain'
          : 'pending';

  return {
    id: item.id,
    chainId: item.chainId,
    type:
      item.kind === 'approval'
        ? 'approval'
        : item.kind === 'transfer'
          ? 'transfer'
          : 'swap',
    status: legacyStatus,
    ts: item.ts,
    txHash: item.transactionHash,
    title: item.title,
    detail: item.subtitle ?? item.title,
    tokenIn: item.fromAsset
      ? { symbol: item.fromAsset.symbol, amount: item.fromAsset.amount ?? '' }
      : undefined,
    tokenOut: item.toAsset
      ? { symbol: item.toAsset.symbol, amount: item.toAsset.amount ?? '' }
      : undefined,
    provider: item.provider,
    explorerUrl: item.explorerUrl,
    canRepeat: item.canRepeat ?? false,
    localRecord: item.localRecord,
  };
}

export { filterUnifiedActivityGroups, groupUnifiedActivityItems };

// ─── Export ────────────────────────────────────────────────────────

/** Export activity as CSV string */
export function exportActivityCsv(items: ActivityItem[] | UnifiedActivityItem[]): string {
  const rows = items.map((item) =>
    'source' in item ? unifiedActivityItemToLegacy(item) : item,
  );
  return exportLegacyActivityCsv(rows);
}

function exportLegacyActivityCsv(items: ActivityItem[]): string {
  const header = 'Time,Type,Status,Chain,Title,Detail,TxHash,Explorer URL';
  const csvRows = items.map((item) => {
    const time = new Date(item.ts).toISOString();
    const chain = CHAIN_LABELS[item.chainId] || String(item.chainId);
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    return [
      time,
      item.type,
      item.status,
      chain,
      esc(item.title),
      esc(item.detail),
      item.txHash || '',
      item.explorerUrl || '',
    ].join(',');
  });
  return [header, ...csvRows].join('\n');
}

/** Export activity as JSON string */
export function exportActivityJson(items: ActivityItem[] | UnifiedActivityItem[]): string {
  const rows = items.map((item) =>
    'source' in item ? unifiedActivityItemToLegacy(item) : item,
  );
  return JSON.stringify(
    rows.map(({ localRecord, ...rest }) => rest),
    null,
    2,
  );
}

/** Format relative time for display */
export function formatActivityTime(ts: number): string {
  return txFormatTimeAgo(ts);
}
