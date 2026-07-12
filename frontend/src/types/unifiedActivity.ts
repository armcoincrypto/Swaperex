/**
 * P17.4 — Presentation-only unified activity model (not persisted).
 */

import type { SwapRecord } from '@/stores/swapHistoryStore';

export type UnifiedActivitySource = 'journal' | 'explorer' | 'legacy-transfer';

export type UnifiedActivityKind =
  | 'approval'
  | 'swap'
  | 'transfer'
  | 'contract-interaction'
  | 'unknown';

export type UnifiedActivityStatus =
  | 'submitted'
  | 'pending'
  | 'confirmed'
  | 'reverted'
  | 'unknown'
  | 'stale';

export type UnifiedActivityConfidence =
  | 'journal-context'
  | 'chain-observed'
  | 'legacy-local';

export interface ActivityAsset {
  symbol: string;
  amount?: string;
  address?: string;
}

export interface UnifiedActivityItem {
  id: string;
  source: UnifiedActivitySource;
  kind: UnifiedActivityKind;
  walletAddress: string;
  chainId: number;
  transactionHash: string;
  status: UnifiedActivityStatus;
  /** ISO timestamp */
  timestamp: string;
  /** Epoch ms for sorting */
  ts: number;
  title: string;
  subtitle?: string;
  fromAsset?: ActivityAsset;
  toAsset?: ActivityAsset;
  amountIn?: string;
  amountOut?: string;
  explorerUrl?: string;
  flowId?: string;
  relatedItemIds?: string[];
  confidence: UnifiedActivityConfidence;
  provider?: string;
  canRepeat?: boolean;
  /** Repeat-swap compatibility */
  localRecord?: SwapRecord;
  needsAttention?: boolean;
}

export interface UnifiedActivityGroup {
  key: string;
  flowId?: string;
  items: UnifiedActivityItem[];
  isFlow: boolean;
}

export type UnifiedActivitySourceStatus = 'ok' | 'error' | 'skipped';

export interface UnifiedActivityResult {
  items: UnifiedActivityItem[];
  groups: UnifiedActivityGroup[];
  attentionItems: UnifiedActivityItem[];
  sources: {
    journal: { status: UnifiedActivitySourceStatus; count: number };
    explorer: { status: UnifiedActivitySourceStatus; message?: string; count: number };
    transfers: { status: UnifiedActivitySourceStatus; count: number };
  };
}

export const ACTIVITY_HISTORY_DISCLAIMER =
  'Swaperex activity is stored on this device and may not include every transaction made by this wallet. Explorer activity is shown when available.';

export const CHAIN_ACTIVITY_LABELS: Record<number, string> = {
  1: 'ETH',
  56: 'BSC',
  137: 'Polygon',
  42161: 'Arbitrum',
};
