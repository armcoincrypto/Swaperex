/**
 * Activity Service
 *
 * Merges local swap history (localStorage) with blockchain explorer data.
 * Deduplicates by txHash, normalizes to a unified ActivityItem format.
 * Supports export as CSV/JSON.
 */

import type { SwapRecord } from '@/stores/swapHistoryStore';
import {
  getMultiChainTransactions,
  type Transaction,
  formatTimeAgo as txFormatTimeAgo,
} from '@/services/transactionHistory';

// ─── Types ─────────────────────────────────────────────────────────

export type ActivityType = 'swap' | 'approval' | 'transfer';
export type ActivityStatus = 'success' | 'pending' | 'failed';

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
  return {
    id: `local:${record.txHash || record.id}`,
    chainId: record.chainId,
    type: 'swap',
    status: record.status,
    ts: record.timestamp,
    txHash: record.txHash,
    title: `${record.fromAsset.symbol} → ${record.toAsset.symbol}`,
    detail: `${record.fromAmount} ${record.fromAsset.symbol} → ${parseFloat(record.toAmount).toFixed(4)} ${record.toAsset.symbol}`,
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

// ─── Export ────────────────────────────────────────────────────────

/** Export activity as CSV string */
export function exportActivityCsv(items: ActivityItem[]): string {
  const header = 'Time,Type,Status,Chain,Title,Detail,TxHash,Explorer URL';
  const rows = items.map((item) => {
    const time = new Date(item.ts).toISOString();
    const chain = CHAIN_LABELS[item.chainId] || String(item.chainId);
    // Escape commas in fields
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
  return [header, ...rows].join('\n');
}

/** Export activity as JSON string */
export function exportActivityJson(items: ActivityItem[]): string {
  return JSON.stringify(
    items.map(({ localRecord, ...rest }) => rest),
    null,
    2
  );
}

/** Format relative time for display */
export function formatActivityTime(ts: number): string {
  return txFormatTimeAgo(ts);
}
