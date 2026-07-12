/**
 * P17.5 — Presentation-only transaction detail and support diagnostic types.
 * Derived at read time; never persisted.
 */

import type { UnifiedActivityConfidence, UnifiedActivityKind, UnifiedActivitySource, UnifiedActivityStatus } from '@/types/unifiedActivity';

export type FieldAccuracy = 'authoritative' | 'derived' | 'local-context' | 'unavailable';

export interface DetailField {
  label: string;
  value: string;
  accuracy?: FieldAccuracy;
  hint?: string;
  mono?: boolean;
}

export interface RelatedTransactionSummary {
  kind: UnifiedActivityKind;
  status: UnifiedActivityStatus;
  transactionHash: string;
  explorerUrl?: string;
  recordId?: string;
  label: string;
}

export interface ApprovalDetailSection {
  token: string;
  spender: string;
  mode: string;
  amount?: string;
  fields: DetailField[];
}

export interface SwapDetailSection {
  fromToken: string;
  toToken: string;
  inputAmount: string;
  expectedOutput?: string;
  minimumOutput?: string;
  slippage?: string;
  provider?: string;
  recipient?: string;
  router?: string;
  fields: DetailField[];
}

export interface TransferDetailSection {
  token: string;
  amount: string;
  toAddress?: string;
  fields: DetailField[];
}

export interface ReceiptDetailSection {
  result: string;
  blockNumber?: string;
  gasUsed?: string;
  effectiveGasPrice?: string;
  confirmedAt?: string;
  fields: DetailField[];
}

export interface ReconciliationDetailSection {
  lastCheckedAt?: string;
  attempts?: number;
  lastResult?: string;
  providerErrorCategory?: string;
  explanation?: string;
  fields: DetailField[];
}

export interface ErrorDetailSection {
  category: string;
  stage?: string;
  userMessage?: string;
  technicalSummary?: string;
  broadcastKnown?: boolean;
  retryable?: boolean;
  fields: DetailField[];
}

export interface TransactionDetailModel {
  id: string;
  source: UnifiedActivitySource;
  kind: UnifiedActivityKind;
  status: UnifiedActivityStatus;
  confidence: UnifiedActivityConfidence;
  statusExplanation: string;

  walletAddress?: string;
  walletAddressMasked?: string;
  chainId: number;
  chainName: string;
  transactionHash: string;
  explorerUrl?: string;

  submittedAt?: string;
  updatedAt?: string;
  lastCheckedAt?: string;
  confirmedAt?: string;
  blockNumber?: number;

  flowId?: string;
  relatedTransactions?: RelatedTransactionSummary[];
  approvalOnlyFlow?: boolean;

  summaryFields: DetailField[];
  transactionFields: DetailField[];
  approval?: ApprovalDetailSection;
  swap?: SwapDetailSection;
  transfer?: TransferDetailSection;
  receipt?: ReceiptDetailSection;
  reconciliation?: ReconciliationDetailSection;
  error?: ErrorDetailSection;
  limitations: string[];

  journalRecordId?: string;
}

export const SUPPORT_DIAGNOSTIC_SCHEMA_VERSION = 1 as const;

export interface SupportDiagnosticBundle {
  schemaVersion: typeof SUPPORT_DIAGNOSTIC_SCHEMA_VERSION;
  generatedAt: string;
  appVersion?: string;

  recordId?: string;
  flowId?: string;
  /** Canonical correlation id — same value as journal flowId and telemetry swap_lifecycle. */
  correlationId?: string;
  source: string;
  kind: string;
  status: string;
  /** Journal transaction status when source is journal-backed. */
  journalStatus?: string;

  walletAddressMasked?: string;
  chainId: number;
  chainName: string;
  transactionHash: string;
  approvalHash?: string;
  swapHash?: string;

  tokenPair?: string;
  inputAmount?: string;
  expectedOutput?: string;
  provider?: string;

  submittedAt?: string;
  lastCheckedAt?: string;
  confirmedAt?: string;
  receiptStatus?: number;
  blockNumber?: number;

  errorCategory?: string;
  errorStage?: string;
  broadcastKnown?: boolean;
  retryable?: boolean;

  reconciliationAttempts?: number;
  reconciliationLastResult?: string;
  reconciliationState?: string;

  browser?: string;
  walletProvider?: string;
  explorerUrl?: string;

  limitations: string[];
}

export const DIAGNOSTIC_PRIVACY_DISCLOSURE =
  'Support details include transaction and device information shown here. They do not include private keys or wallet credentials.';
