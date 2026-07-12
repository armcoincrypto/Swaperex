/**
 * P17.2 — Canonical device-local known-transaction journal types.
 * Design authority: SWAPEREX_P17_1_TRANSACTION_JOURNAL_AND_RECONCILIATION_DESIGN.md
 */

import type { ErrorCategory } from '@/utils/errors';

export const JOURNAL_STORAGE_KEY = 'swaperex-transaction-journal-v2';
export const JOURNAL_ENVELOPE_SCHEMA_VERSION = 2;
export const JOURNAL_RECORD_SCHEMA_VERSION = 2;
export const MAX_JOURNAL_RECORDS = 200;
export const JOURNAL_STALE_AFTER_MS = 48 * 60 * 60 * 1000;
export const MAX_RECORD_JSON_BYTES = 4096;
export const MAX_ENVELOPE_JSON_BYTES = 819_200;

export type JournalTransactionStatus =
  | 'submitted'
  | 'pending'
  | 'confirmed'
  | 'reverted'
  | 'unknown'
  | 'stale';

export type JournalRecordKind = 'approval' | 'swap';

export type JournalRecordSource = 'swaperex-client' | 'legacy-migrated';

export type ApprovalMode = 'exact' | 'unlimited' | 'reset-to-zero';

export type JournalErrorStage =
  | 'approval-submit'
  | 'approval-confirm'
  | 'swap-submit'
  | 'swap-confirm'
  | 'reconciliation'
  | 'migration'
  | 'storage';

export interface ReceiptSnapshot {
  status: number;
  blockNumber: number;
  gasUsed?: string;
  effectiveGasPrice?: string;
  confirmedAt: string;
}

export interface ReconciliationMetadata {
  attempts: number;
  lastAttemptAt?: string;
  nextAttemptAt?: string;
  lastProviderError?: string;
  lastProviderErrorCategory?: string;
  source?: 'in-session-wait' | 'refresh-recovery' | 'manual-refresh';
  replacementHash?: string;
  replacementReason?: string;
  replacedAt?: string;
}

export interface JournalError {
  category: ErrorCategory;
  code?: string;
  userMessage?: string;
  technicalSummary?: string;
  occurredAt: string;
  stage: JournalErrorStage;
  broadcastKnown: boolean;
  retryable: boolean;
}

export interface ApprovalJournalContext {
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  spenderAddress: string;
  approvalMode: ApprovalMode;
  approvedAmountRaw?: string;
  approvedAmountDisplay?: string;
  provider: string;
}

export interface SwapJournalContext {
  fromTokenAddress: string;
  fromTokenSymbol: string;
  fromTokenDecimals: number;
  toTokenAddress: string;
  toTokenSymbol: string;
  toTokenDecimals: number;
  inputAmountRaw: string;
  inputAmountDisplay: string;
  expectedOutputRaw?: string;
  expectedOutputDisplay: string;
  minimumOutputRaw?: string;
  minimumOutputDisplay?: string;
  slippageBps: number;
  provider: string;
  routerAddress?: string;
  recipient?: string;
  quoteFingerprint?: string;
  approvalRecordId?: string;
}

interface TransactionJournalRecordBase {
  schemaVersion: number;
  id: string;
  flowId: string;
  kind: JournalRecordKind;
  source: JournalRecordSource;
  walletAddress: string;
  chainId: number;
  transactionHash: string;
  status: JournalTransactionStatus;
  submittedAt: string;
  updatedAt: string;
  relatedRecordIds: string[];
  lastCheckedAt?: string;
  confirmedAt?: string;
  blockNumber?: number;
  confirmations?: number;
  explorerUrl?: string;
  receipt?: ReceiptSnapshot;
  error?: JournalError;
  reconciliation?: ReconciliationMetadata;
}

export interface ApprovalJournalRecord extends TransactionJournalRecordBase {
  kind: 'approval';
  context: ApprovalJournalContext;
}

export interface SwapJournalRecord extends TransactionJournalRecordBase {
  kind: 'swap';
  context: SwapJournalContext;
}

export type TransactionJournalRecord = ApprovalJournalRecord | SwapJournalRecord;

export type LegacyQuarantineReason =
  | 'missing_wallet'
  | 'invalid_hash'
  | 'unsupported_chain'
  | 'schema_invalid'
  | 'ownership_ambiguous'
  | 'duplicate_weaker_record';

export interface LegacyQuarantineRecord {
  legacySource: 'swaperex-swap-history' | 'swaperex-pending-swap-v1';
  legacyId: string;
  transactionHash?: string;
  chainId?: number;
  tokenPair?: string;
  timestamp?: string;
  reason: LegacyQuarantineReason;
  rawSummary?: string;
}

export interface TransactionJournalEnvelope {
  schemaVersion: number;
  recordSchemaVersion: number;
  migratedAt?: string;
  records: TransactionJournalRecord[];
  legacyQuarantine?: LegacyQuarantineRecord[];
}

export type JournalTransitionEvent =
  | 'TRANSACTION_SUBMITTED'
  | 'TRANSACTION_PENDING'
  | 'RECEIPT_CONFIRMED'
  | 'RECEIPT_REVERTED'
  | 'RECONCILIATION_UNKNOWN'
  | 'TRANSACTION_STALE'
  | 'MANUAL_RECHECK_STARTED';

export type JournalStoreResult<T = TransactionJournalRecord> =
  | { ok: true; record: T }
  | { ok: false; reason: string; recoverable: boolean };

export type ReconcileTransactionResult =
  | { kind: 'confirmed'; receipt: ReceiptSnapshot }
  | { kind: 'reverted'; receipt: ReceiptSnapshot }
  | { kind: 'pending'; transactionSeen: boolean }
  | { kind: 'not_found' }
  | { kind: 'provider_error'; error: { category: string; message: string } }
  | { kind: 'unsupported_chain' }
  | { kind: 'invalid_record' };
