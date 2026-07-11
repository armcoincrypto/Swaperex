/**
 * Safe one-time migration from legacy pending swap and swap history stores.
 */

import type { SwapRecord } from '@/stores/swapHistoryStore';
import type {
  LegacyQuarantineRecord,
  SwapJournalContext,
  SwapJournalRecord,
  TransactionJournalEnvelope,
  TransactionJournalRecord,
} from '@/types/transactionJournal';
import {
  JOURNAL_ENVELOPE_SCHEMA_VERSION,
  JOURNAL_RECORD_SCHEMA_VERSION,
} from '@/types/transactionJournal';
import { createJournalRecordId, createFlowId } from '@/utils/transactionJournalIdentity';
import {
  isSupportedJournalChain,
  isTransactionHash,
  isWalletAddress,
  normalizeWalletAddress,
} from '@/utils/transactionJournalValidation';
export const LEGACY_SWAP_HISTORY_KEY = 'swaperex-swap-history';
const LEGACY_PENDING_SWAP_KEY = 'swaperex-pending-swap-v1';

type PendingSwapV1 = {
  v: 1;
  chainId: number;
  fromAddress: string;
  txHash: string;
  explorerUrl: string;
  submittedAt: number;
  fromSymbol: string;
  toSymbol: string;
  fromAmount: string;
  toAmount: string;
  outcomeUncertain?: boolean;
};

export interface MigrationInput {
  existingEnvelope: TransactionJournalEnvelope | null;
  pendingRaw: string | null;
  historyRaw: string | null;
}

export interface MigrationResult {
  envelope: TransactionJournalEnvelope;
  diagnostics: string[];
  migratedCount: number;
  quarantinedCount: number;
}

function parsePendingV1(raw: string | null): PendingSwapV1 | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<PendingSwapV1>;
    if (o.v !== 1) return null;
    if (
      typeof o.chainId !== 'number' ||
      typeof o.fromAddress !== 'string' ||
      typeof o.txHash !== 'string' ||
      typeof o.submittedAt !== 'number'
    ) {
      return null;
    }
    return o as PendingSwapV1;
  } catch {
    return null;
  }
}

interface LegacyHistoryPersisted {
  state?: { records?: SwapRecord[] };
  records?: SwapRecord[];
}

function parseLegacyHistory(raw: string | null): SwapRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as LegacyHistoryPersisted;
    const records = parsed.state?.records ?? parsed.records;
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function legacyHistoryStatusToJournal(
  status: SwapRecord['status'],
): SwapJournalRecord['status'] {
  switch (status) {
    case 'success':
      return 'confirmed';
    case 'failed':
      return 'reverted';
    case 'uncertain':
      return 'unknown';
    case 'pending':
    default:
      return 'submitted';
  }
}

function buildSwapContextFromLegacy(record: SwapRecord): SwapJournalContext | null {
  const fromAddr = record.fromAsset.contract_address ?? 'native';
  const toAddr = record.toAsset.contract_address ?? 'native';
  if (fromAddr !== 'native' && !isWalletAddress(fromAddr)) return null;
  if (toAddr !== 'native' && !isWalletAddress(toAddr)) return null;

  return {
    fromTokenAddress: fromAddr === 'native' ? 'native' : fromAddr.toLowerCase(),
    fromTokenSymbol: record.fromAsset.symbol,
    fromTokenDecimals: record.fromAsset.decimals,
    toTokenAddress: toAddr === 'native' ? 'native' : toAddr.toLowerCase(),
    toTokenSymbol: record.toAsset.symbol,
    toTokenDecimals: record.toAsset.decimals,
    inputAmountRaw: record.fromAmount,
    inputAmountDisplay: record.fromAmount,
    expectedOutputDisplay: record.toAmount,
    minimumOutputDisplay: record.minimumToAmount,
    slippageBps: Math.round(record.slippage * 100),
    provider: record.provider,
    recipient: record.toAddress?.toLowerCase(),
  };
}

function buildSwapContextFromPending(p: PendingSwapV1): SwapJournalContext {
  return {
    fromTokenAddress: 'native',
    fromTokenSymbol: p.fromSymbol,
    fromTokenDecimals: 18,
    toTokenAddress: 'native',
    toTokenSymbol: p.toSymbol,
    toTokenDecimals: 18,
    inputAmountRaw: p.fromAmount,
    inputAmountDisplay: p.fromAmount,
    expectedOutputDisplay: p.toAmount,
    slippageBps: 50,
    provider: 'legacy-pending',
  };
}

function mergeRecords(
  existing: TransactionJournalRecord,
  incoming: TransactionJournalRecord,
): TransactionJournalRecord {
  const terminal = new Set(['confirmed', 'reverted']);
  if (terminal.has(existing.status) && !terminal.has(incoming.status)) {
    return existing;
  }
  if (!terminal.has(existing.status) && terminal.has(incoming.status)) {
    return { ...incoming, relatedRecordIds: [...new Set([...existing.relatedRecordIds, ...incoming.relatedRecordIds])] };
  }

  const existingRichness = JSON.stringify(existing.context).length;
  const incomingRichness = JSON.stringify(incoming.context).length;
  const richer = incomingRichness >= existingRichness ? incoming : existing;
  const other = richer === incoming ? existing : incoming;
  return {
    ...richer,
    relatedRecordIds: [...new Set([...richer.relatedRecordIds, ...other.relatedRecordIds])],
    updatedAt: richer.updatedAt > other.updatedAt ? richer.updatedAt : other.updatedAt,
  };
}

function swapRecordFromPending(p: PendingSwapV1): SwapJournalRecord | null {
  if (!isSupportedJournalChain(p.chainId)) return null;
  if (!isTransactionHash(p.txHash)) return null;
  const wallet = normalizeWalletAddress(p.fromAddress);
  if (!wallet) return null;
  const id = createJournalRecordId(p.chainId, 'swap', p.txHash);
  if (!id) return null;

  const submittedAt = new Date(p.submittedAt).toISOString();
  const status: SwapJournalRecord['status'] = p.outcomeUncertain ? 'unknown' : 'submitted';

  return {
    schemaVersion: JOURNAL_RECORD_SCHEMA_VERSION,
    id,
    flowId: createFlowId(),
    kind: 'swap',
    source: 'legacy-migrated',
    walletAddress: wallet,
    chainId: p.chainId,
    transactionHash: p.txHash.toLowerCase(),
    status,
    submittedAt,
    updatedAt: submittedAt,
    relatedRecordIds: [],
    explorerUrl: p.explorerUrl,
    context: buildSwapContextFromPending(p),
  };
}

function swapRecordFromHistory(
  record: SwapRecord,
  walletAddress: string | null,
): { record: SwapJournalRecord | null; quarantine: LegacyQuarantineRecord | null } {
  if (!isSupportedJournalChain(record.chainId)) {
    return {
      record: null,
      quarantine: {
        legacySource: 'swaperex-swap-history',
        legacyId: record.id,
        transactionHash: isTransactionHash(record.txHash) ? record.txHash.toLowerCase() : undefined,
        chainId: record.chainId,
        reason: 'unsupported_chain',
        rawSummary: `${record.fromAsset.symbol}->${record.toAsset.symbol}`,
      },
    };
  }
  if (!isTransactionHash(record.txHash)) {
    return {
      record: null,
      quarantine: {
        legacySource: 'swaperex-swap-history',
        legacyId: record.id,
        reason: 'invalid_hash',
        rawSummary: String(record.txHash).slice(0, 20),
      },
    };
  }

  if (!walletAddress) {
    return {
      record: null,
      quarantine: {
        legacySource: 'swaperex-swap-history',
        legacyId: record.id,
        transactionHash: record.txHash.toLowerCase(),
        chainId: record.chainId,
        tokenPair: `${record.fromAsset.symbol}/${record.toAsset.symbol}`,
        timestamp: new Date(record.timestamp).toISOString(),
        reason: 'missing_wallet',
        rawSummary: `${record.fromAsset.symbol}->${record.toAsset.symbol}`,
      },
    };
  }

  const context = buildSwapContextFromLegacy(record);
  if (!context) {
    return {
      record: null,
      quarantine: {
        legacySource: 'swaperex-swap-history',
        legacyId: record.id,
        transactionHash: record.txHash.toLowerCase(),
        chainId: record.chainId,
        reason: 'schema_invalid',
      },
    };
  }

  const id = createJournalRecordId(record.chainId, 'swap', record.txHash);
  if (!id) {
    return {
      record: null,
      quarantine: {
        legacySource: 'swaperex-swap-history',
        legacyId: record.id,
        reason: 'invalid_hash',
      },
    };
  }

  const submittedAt = new Date(record.timestamp).toISOString();
  const journalStatus = legacyHistoryStatusToJournal(record.status);

  return {
    record: {
      schemaVersion: JOURNAL_RECORD_SCHEMA_VERSION,
      id,
      flowId: createFlowId(),
      kind: 'swap',
      source: 'legacy-migrated',
      walletAddress,
      chainId: record.chainId,
      transactionHash: record.txHash.toLowerCase(),
      status: journalStatus,
      submittedAt,
      updatedAt: submittedAt,
      relatedRecordIds: [],
      explorerUrl: record.explorerUrl,
      context,
    },
    quarantine: null,
  };
}

export function migrateLegacyTransactionStorage(input: MigrationInput): MigrationResult {
  const diagnostics: string[] = [];
  const byId = new Map<string, TransactionJournalRecord>();
  const quarantine: LegacyQuarantineRecord[] = [
    ...(input.existingEnvelope?.legacyQuarantine ?? []),
  ];

  for (const record of input.existingEnvelope?.records ?? []) {
    byId.set(record.id, record);
  }

  if (input.existingEnvelope?.migratedAt) {
    diagnostics.push('migration_already_applied');
    return {
      envelope: input.existingEnvelope,
      diagnostics,
      migratedCount: 0,
      quarantinedCount: 0,
    };
  }

  const pending = parsePendingV1(input.pendingRaw);
  if (pending) {
    const migrated = swapRecordFromPending(pending);
    if (migrated) {
      const prev = byId.get(migrated.id);
      byId.set(migrated.id, prev ? mergeRecords(prev, migrated) : migrated);
      diagnostics.push(`migrated_pending:${migrated.id}`);
    } else {
      quarantine.push({
        legacySource: 'swaperex-pending-swap-v1',
        legacyId: pending.txHash,
        transactionHash: pending.txHash,
        chainId: pending.chainId,
        reason: 'schema_invalid',
      });
    }
  }

  const historyRecords = parseLegacyHistory(input.historyRaw);
  for (const legacy of historyRecords) {
    const walletFromRecord =
      typeof (legacy as SwapRecord & { walletAddress?: string }).walletAddress === 'string'
        ? normalizeWalletAddress((legacy as SwapRecord & { walletAddress?: string }).walletAddress!)
        : null;

    const { record, quarantine: q } = swapRecordFromHistory(legacy, walletFromRecord);
    if (q) quarantine.push(q);
    if (!record) continue;

    const prev = byId.get(record.id);
    if (prev) {
      byId.set(record.id, mergeRecords(prev, record));
      diagnostics.push(`deduped_history:${record.id}`);
    } else {
      byId.set(record.id, record);
      diagnostics.push(`migrated_history:${record.id}`);
    }
  }

  const migratedAt = new Date().toISOString();
  const envelope: TransactionJournalEnvelope = {
    schemaVersion: JOURNAL_ENVELOPE_SCHEMA_VERSION,
    recordSchemaVersion: JOURNAL_RECORD_SCHEMA_VERSION,
    migratedAt,
    records: [...byId.values()],
    legacyQuarantine: quarantine.length > 0 ? quarantine : undefined,
  };

  return {
    envelope,
    diagnostics,
    migratedCount: diagnostics.filter((d) => d.startsWith('migrated_')).length,
    quarantinedCount: quarantine.length,
  };
}

export function readLegacyStorageRaw(): { pendingRaw: string | null; historyRaw: string | null } {
  try {
    return {
      pendingRaw: localStorage.getItem(LEGACY_PENDING_SWAP_KEY),
      historyRaw: localStorage.getItem(LEGACY_SWAP_HISTORY_KEY),
    };
  } catch {
    return { pendingRaw: null, historyRaw: null };
  }
}
