/**
 * Runtime validation for untrusted journal localStorage payloads.
 * Manual type guards — no external validation dependency.
 */

import type {
  ApprovalJournalContext,
  JournalRecordKind,
  JournalTransactionStatus,
  LegacyQuarantineRecord,
  ReceiptSnapshot,
  SwapJournalContext,
  TransactionJournalEnvelope,
  TransactionJournalRecord,
} from '@/types/transactionJournal';
import {
  JOURNAL_ENVELOPE_SCHEMA_VERSION,
  JOURNAL_RECORD_SCHEMA_VERSION,
  MAX_ENVELOPE_JSON_BYTES,
  MAX_RECORD_JSON_BYTES,
} from '@/types/transactionJournal';

const TX_HASH_RE = /^0x[0-9a-f]{64}$/i;
const WALLET_ADDRESS_RE = /^0x[0-9a-f]{40}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** Chains Swaperex may journal (swap + common migrated chains). */
export const JOURNAL_SUPPORTED_CHAIN_IDS = new Set([
  1, 56, 137, 42161, 10, 43114, 100, 250, 8453,
]);

const JOURNAL_STATUSES = new Set<JournalTransactionStatus>([
  'submitted',
  'pending',
  'confirmed',
  'reverted',
  'unknown',
  'stale',
]);

const JOURNAL_KINDS = new Set<JournalRecordKind>(['approval', 'swap']);

const APPROVAL_MODES = new Set(['exact', 'unlimited', 'reset-to-zero']);

const ERROR_CATEGORIES = new Set([
  'user_rejected',
  'wallet_sign_pending',
  'insufficient_funds',
  'network_error',
  'rpc_error',
  'allowance_failed',
  'quote_failed',
  'validation_error',
  'transaction_failed',
  'unknown',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasPrototypePollutionKeys(o: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(o, '__proto__') ||
    Object.prototype.hasOwnProperty.call(o, 'constructor') ||
    Object.prototype.hasOwnProperty.call(o, 'prototype')
  );
}

function isBoundedString(value: unknown, maxLen: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLen;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE_RE.test(value);
}

export function isTransactionHash(value: unknown): value is string {
  return typeof value === 'string' && TX_HASH_RE.test(value);
}

export function normalizeTransactionHash(value: string): string | null {
  if (!isTransactionHash(value)) return null;
  return value.toLowerCase();
}

export function isWalletAddress(value: unknown): value is string {
  return typeof value === 'string' && WALLET_ADDRESS_RE.test(value);
}

export function normalizeWalletAddress(value: string): string | null {
  if (!isWalletAddress(value)) return null;
  return value.toLowerCase();
}

export function isSupportedJournalChain(chainId: unknown): chainId is number {
  return typeof chainId === 'number' && Number.isInteger(chainId) && JOURNAL_SUPPORTED_CHAIN_IDS.has(chainId);
}

export function isJournalStatus(value: unknown): value is JournalTransactionStatus {
  return typeof value === 'string' && JOURNAL_STATUSES.has(value as JournalTransactionStatus);
}

export function isJournalKind(value: unknown): value is JournalRecordKind {
  return typeof value === 'string' && JOURNAL_KINDS.has(value as JournalRecordKind);
}

export function isReceiptSnapshot(value: unknown): value is ReceiptSnapshot {
  if (!isPlainObject(value) || hasPrototypePollutionKeys(value)) return false;
  if (typeof value.status !== 'number') return false;
  if (typeof value.blockNumber !== 'number') return false;
  if (!isIsoTimestamp(value.confirmedAt)) return false;
  if (value.gasUsed !== undefined && typeof value.gasUsed !== 'string') return false;
  if (value.effectiveGasPrice !== undefined && typeof value.effectiveGasPrice !== 'string') return false;
  return true;
}

export function isApprovalJournalContext(value: unknown): value is ApprovalJournalContext {
  if (!isPlainObject(value) || hasPrototypePollutionKeys(value)) return false;
  if (!isWalletAddress(value.tokenAddress)) return false;
  if (!isBoundedString(value.tokenSymbol, 32)) return false;
  if (typeof value.tokenDecimals !== 'number' || value.tokenDecimals < 0 || value.tokenDecimals > 36) {
    return false;
  }
  if (!isWalletAddress(value.spenderAddress)) return false;
  if (!APPROVAL_MODES.has(String(value.approvalMode))) return false;
  if (!isBoundedString(value.provider, 64)) return false;
  if (value.approvedAmountRaw !== undefined && typeof value.approvedAmountRaw !== 'string') return false;
  if (value.approvedAmountDisplay !== undefined && typeof value.approvedAmountDisplay !== 'string') return false;
  return true;
}

export function isSwapJournalContext(value: unknown): value is SwapJournalContext {
  if (!isPlainObject(value) || hasPrototypePollutionKeys(value)) return false;
  if (!isWalletAddress(value.fromTokenAddress) && value.fromTokenAddress !== 'native') return false;
  if (!isBoundedString(value.fromTokenSymbol, 32)) return false;
  if (typeof value.fromTokenDecimals !== 'number' || value.fromTokenDecimals < 0 || value.fromTokenDecimals > 36) {
    return false;
  }
  if (!isWalletAddress(value.toTokenAddress) && value.toTokenAddress !== 'native') return false;
  if (!isBoundedString(value.toTokenSymbol, 32)) return false;
  if (typeof value.toTokenDecimals !== 'number' || value.toTokenDecimals < 0 || value.toTokenDecimals > 36) {
    return false;
  }
  if (typeof value.inputAmountRaw !== 'string' || value.inputAmountRaw.length > 128) return false;
  if (!isBoundedString(value.inputAmountDisplay, 64)) return false;
  if (!isBoundedString(value.expectedOutputDisplay, 64)) return false;
  if (typeof value.slippageBps !== 'number' || value.slippageBps < 0 || value.slippageBps > 10_000) {
    return false;
  }
  if (!isBoundedString(value.provider, 64)) return false;
  if (value.expectedOutputRaw !== undefined && typeof value.expectedOutputRaw !== 'string') return false;
  if (value.minimumOutputRaw !== undefined && typeof value.minimumOutputRaw !== 'string') return false;
  if (value.minimumOutputDisplay !== undefined && typeof value.minimumOutputDisplay !== 'string') return false;
  if (value.routerAddress !== undefined && !isWalletAddress(value.routerAddress)) return false;
  if (value.recipient !== undefined && !isWalletAddress(value.recipient)) return false;
  if (value.quoteFingerprint !== undefined && typeof value.quoteFingerprint !== 'string') return false;
  if (value.approvalRecordId !== undefined && typeof value.approvalRecordId !== 'string') return false;
  return true;
}

function isJournalError(value: unknown): boolean {
  if (!isPlainObject(value) || hasPrototypePollutionKeys(value)) return false;
  if (!ERROR_CATEGORIES.has(String(value.category))) return false;
  if (!isIsoTimestamp(value.occurredAt)) return false;
  if (typeof value.broadcastKnown !== 'boolean') return false;
  if (typeof value.retryable !== 'boolean') return false;
  return true;
}

function isReconciliationMetadata(value: unknown): boolean {
  if (!isPlainObject(value) || hasPrototypePollutionKeys(value)) return false;
  if (typeof value.attempts !== 'number' || value.attempts < 0) return false;
  return true;
}

export function isTransactionJournalRecord(value: unknown): value is TransactionJournalRecord {
  if (!isPlainObject(value) || hasPrototypePollutionKeys(value)) return false;
  if (value.schemaVersion !== JOURNAL_RECORD_SCHEMA_VERSION) return false;
  if (typeof value.id !== 'string' || value.id.length > 128) return false;
  if (typeof value.flowId !== 'string' || value.flowId.length > 64) return false;
  if (!isJournalKind(value.kind)) return false;
  if (value.source !== 'swaperex-client' && value.source !== 'legacy-migrated') return false;
  if (!isWalletAddress(value.walletAddress)) return false;
  if (!isSupportedJournalChain(value.chainId)) return false;
  if (!isTransactionHash(value.transactionHash)) return false;
  if (!isJournalStatus(value.status)) return false;
  if (!isIsoTimestamp(value.submittedAt)) return false;
  if (!isIsoTimestamp(value.updatedAt)) return false;
  if (!Array.isArray(value.relatedRecordIds)) return false;
  if (value.relatedRecordIds.some((id) => typeof id !== 'string')) return false;

  const expectedId = `${value.chainId}:${value.kind}:${String(value.transactionHash).toLowerCase()}`;
  if (value.id !== expectedId) return false;

  if (value.lastCheckedAt !== undefined && !isIsoTimestamp(value.lastCheckedAt)) return false;
  if (value.confirmedAt !== undefined && !isIsoTimestamp(value.confirmedAt)) return false;
  if (value.blockNumber !== undefined && typeof value.blockNumber !== 'number') return false;
  if (value.receipt !== undefined && !isReceiptSnapshot(value.receipt)) return false;
  if (value.error !== undefined && !isJournalError(value.error)) return false;
  if (value.reconciliation !== undefined && !isReconciliationMetadata(value.reconciliation)) return false;

  try {
    if (JSON.stringify(value).length > MAX_RECORD_JSON_BYTES) return false;
  } catch {
    return false;
  }

  if (value.kind === 'approval') {
    return isApprovalJournalContext(value.context);
  }
  return isSwapJournalContext(value.context);
}

export function isLegacyQuarantineRecord(value: unknown): value is LegacyQuarantineRecord {
  if (!isPlainObject(value) || hasPrototypePollutionKeys(value)) return false;
  if (value.legacySource !== 'swaperex-swap-history' && value.legacySource !== 'swaperex-pending-swap-v1') {
    return false;
  }
  if (typeof value.legacyId !== 'string') return false;
  if (typeof value.reason !== 'string') return false;
  if (value.transactionHash !== undefined && !isTransactionHash(value.transactionHash)) return false;
  if (value.chainId !== undefined && !isSupportedJournalChain(value.chainId)) return false;
  if (value.rawSummary !== undefined && typeof value.rawSummary !== 'string') return false;
  return true;
}

export function isTransactionJournalEnvelope(value: unknown): value is TransactionJournalEnvelope {
  if (!isPlainObject(value) || hasPrototypePollutionKeys(value)) return false;
  if (value.schemaVersion !== JOURNAL_ENVELOPE_SCHEMA_VERSION) return false;
  if (value.recordSchemaVersion !== JOURNAL_RECORD_SCHEMA_VERSION) return false;
  if (!Array.isArray(value.records)) return false;
  if (value.migratedAt !== undefined && !isIsoTimestamp(value.migratedAt)) return false;
  if (value.legacyQuarantine !== undefined) {
    if (!Array.isArray(value.legacyQuarantine)) return false;
    if (!value.legacyQuarantine.every(isLegacyQuarantineRecord)) return false;
  }
  try {
    if (JSON.stringify(value).length > MAX_ENVELOPE_JSON_BYTES) return false;
  } catch {
    return false;
  }
  return value.records.every(isTransactionJournalRecord);
}

export function parseTransactionJournalEnvelope(raw: string | null): TransactionJournalEnvelope | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isTransactionJournalEnvelope(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function sanitizeEnvelopeRecords(
  records: unknown[],
): { valid: TransactionJournalRecord[]; skipped: number } {
  const valid: TransactionJournalRecord[] = [];
  let skipped = 0;
  for (const item of records) {
    if (isTransactionJournalRecord(item)) {
      valid.push(item);
    } else {
      skipped += 1;
    }
  }
  return { valid, skipped };
}
