/**
 * P17.5 — Read-only transaction detail builder.
 */

import { getExplorerTxUrl } from '@/config';
import type { SwapRecord } from '@/stores/swapHistoryStore';
import type {
  ApprovalJournalRecord,
  SwapJournalRecord,
  TransactionJournalRecord,
} from '@/types/transactionJournal';
import type {
  ApprovalDetailSection,
  DetailField,
  ErrorDetailSection,
  ReceiptDetailSection,
  ReconciliationDetailSection,
  RelatedTransactionSummary,
  SwapDetailSection,
  TransactionDetailModel,
  TransferDetailSection,
} from '@/types/transactionDetails';
import type { UnifiedActivityItem } from '@/types/unifiedActivity';
import {
  presentActivityKind,
  presentActivitySource,
  presentActivityStatus,
} from '@/utils/activityPresentation';
import { swapAggregatorProviderLabel } from '@/utils/format';
import { normalizeWalletAddress } from '@/utils/transactionJournalValidation';
import {
  boundString,
  formatApprovalMode,
  formatReceiptStatus,
  maskWalletAddress,
  presentStatusExplanation,
  resolveChainName,
} from '@/utils/transactionDetailFormatting';
import { getErrorPresentation, normalizeSwaperexErrorFromMessage } from '@/utils/errors';
import type { SwaperexErrorStage } from '@/types/swaperexErrors';

function field(
  label: string,
  value: string | undefined,
  accuracy?: DetailField['accuracy'],
  hint?: string,
  mono = false,
): DetailField | null {
  if (!value) return null;
  return { label, value, accuracy, hint, mono };
}

function collectFields(...items: Array<DetailField | null>): DetailField[] {
  return items.filter((item): item is DetailField => item !== null);
}

export function canAccessJournalDetail(
  record: TransactionJournalRecord,
  activeWallet: string | null | undefined,
): boolean {
  if (!activeWallet) return false;
  return record.walletAddress === normalizeWalletAddress(activeWallet);
}

function explorerUrl(chainId: number, hash: string, existing?: string): string | undefined {
  if (existing) return existing;
  try {
    return getExplorerTxUrl(chainId, hash) || undefined;
  } catch {
    return undefined;
  }
}

function buildReceiptSection(record: TransactionJournalRecord): ReceiptDetailSection | undefined {
  const receipt = record.receipt;
  if (!receipt) return undefined;
  return {
    result: formatReceiptStatus(receipt.status),
    blockNumber: receipt.blockNumber ? String(receipt.blockNumber) : undefined,
    gasUsed: receipt.gasUsed,
    effectiveGasPrice: receipt.effectiveGasPrice,
    confirmedAt: receipt.confirmedAt,
    fields: collectFields(
      field('Receipt result', formatReceiptStatus(receipt.status), 'authoritative'),
      field('Block', receipt.blockNumber ? String(receipt.blockNumber) : undefined, 'authoritative'),
      field('Gas used', receipt.gasUsed, 'authoritative'),
      field('Effective gas price', receipt.effectiveGasPrice, 'authoritative'),
      field('Confirmed', receipt.confirmedAt ? new Date(receipt.confirmedAt).toLocaleString() : undefined, 'authoritative'),
    ),
  };
}

function buildReconciliationSection(
  record: TransactionJournalRecord,
): ReconciliationDetailSection | undefined {
  const rec = record.reconciliation;
  if (!rec && !record.lastCheckedAt && !['unknown', 'stale', 'pending', 'submitted'].includes(record.status)) {
    return undefined;
  }
  const explanation =
    record.status === 'unknown'
      ? presentStatusExplanation('unknown')
      : record.status === 'stale'
        ? presentStatusExplanation('stale')
        : undefined;

  return {
    lastCheckedAt: record.lastCheckedAt,
    attempts: rec?.attempts,
    lastResult: rec?.lastProviderErrorCategory ?? rec?.lastProviderError,
    providerErrorCategory: rec?.lastProviderErrorCategory,
    explanation,
    fields: collectFields(
      field('Last checked', record.lastCheckedAt ? new Date(record.lastCheckedAt).toLocaleString() : undefined, 'derived'),
      field('Attempts', rec?.attempts !== undefined ? String(rec.attempts) : undefined, 'derived'),
      field('Last result', boundString(rec?.lastProviderErrorCategory ?? rec?.lastProviderError, 120), 'derived'),
    ),
  };
}

function buildErrorSection(record: TransactionJournalRecord): ErrorDetailSection | undefined {
  const err = record.error;
  if (!err) return undefined;

  const normalized = normalizeSwaperexErrorFromMessage(err.technicalSummary ?? err.userMessage, {
    journalStatus: record.status,
    transactionHash: record.transactionHash,
    broadcastKnown: err.broadcastKnown,
    stage: err.stage as SwaperexErrorStage,
  });
  const presentation = getErrorPresentation(normalized);

  return {
    category: err.category,
    stage: err.stage,
    userMessage: err.userMessage ?? presentation.message,
    technicalSummary: boundString(err.technicalSummary, 300),
    broadcastKnown: err.broadcastKnown,
    retryable: err.retryable,
    fields: collectFields(
      field('Category', err.category, 'derived'),
      field('Stage', err.stage, 'derived'),
      field('User message', err.userMessage ?? presentation.message, 'local-context'),
      field('Technical summary', boundString(err.technicalSummary, 300), 'derived'),
      field('Broadcast known', String(err.broadcastKnown), 'derived'),
      field('Retryable', String(err.retryable), 'derived'),
    ),
  };
}

function buildApprovalSection(record: ApprovalJournalRecord): ApprovalDetailSection {
  const ctx = record.context;
  return {
    token: ctx.tokenSymbol,
    spender: ctx.spenderAddress,
    mode: formatApprovalMode(ctx.approvalMode),
    amount: ctx.approvedAmountDisplay,
    fields: collectFields(
      field('Token', ctx.tokenSymbol, 'local-context'),
      field('Spender', ctx.spenderAddress, 'local-context', undefined, true),
      field('Approval mode', formatApprovalMode(ctx.approvalMode), 'local-context'),
      field('Amount', ctx.approvedAmountDisplay, 'local-context'),
      field(
        'Purpose',
        'Token approval allows the swap contract or router to spend the approved token amount.',
        'local-context',
      ),
    ),
  };
}

function buildSwapSection(record: SwapJournalRecord): SwapDetailSection {
  const ctx = record.context;
  const slippage = `${(ctx.slippageBps / 100).toFixed(2)}%`;
  return {
    fromToken: ctx.fromTokenSymbol,
    toToken: ctx.toTokenSymbol,
    inputAmount: ctx.inputAmountDisplay,
    expectedOutput: ctx.expectedOutputDisplay,
    minimumOutput: ctx.minimumOutputDisplay,
    slippage,
    provider: ctx.provider ? swapAggregatorProviderLabel(ctx.provider) : undefined,
    recipient: ctx.recipient,
    router: ctx.routerAddress,
    fields: collectFields(
      field('From token', ctx.fromTokenSymbol, 'local-context'),
      field('Input amount', ctx.inputAmountDisplay, 'local-context'),
      field('To token', ctx.toTokenSymbol, 'local-context'),
      field(
        'Expected output',
        ctx.expectedOutputDisplay,
        'local-context',
        'Expected output is quote context, not guaranteed final received amount.',
      ),
      field('Minimum output', ctx.minimumOutputDisplay, 'local-context'),
      field('Slippage', slippage, 'local-context'),
      field('Provider', ctx.provider ? swapAggregatorProviderLabel(ctx.provider) : undefined, 'local-context'),
      field('Recipient', ctx.recipient, 'local-context', undefined, true),
      field('Router', ctx.routerAddress, 'local-context', undefined, true),
    ),
  };
}

function buildTransferSection(record: SwapRecord): TransferDetailSection {
  return {
    token: record.fromAsset.symbol,
    amount: record.fromAmount,
    toAddress: record.toAddress,
    fields: collectFields(
      field('Token', record.fromAsset.symbol, 'local-context'),
      field('Amount', record.fromAmount, 'local-context'),
      field('To address', record.toAddress, 'local-context', undefined, true),
    ),
  };
}

function relatedSummaries(
  flowRecords: TransactionJournalRecord[],
  primaryId: string,
): RelatedTransactionSummary[] {
  return flowRecords
    .filter((r) => r.id !== primaryId)
    .map((r) => ({
      kind: r.kind,
      status: r.status,
      transactionHash: r.transactionHash,
      explorerUrl: explorerUrl(r.chainId, r.transactionHash, r.explorerUrl),
      recordId: r.id,
      label: presentActivityKind(r.kind),
    }));
}

function baseLimitations(source: TransactionDetailModel['source']): string[] {
  const limitations = ['Stored on this device'];
  if (source === 'explorer') {
    limitations.push('Explorer-observed only — Kobbex execution context may be unavailable');
  }
  if (source === 'legacy-transfer') {
    limitations.push('Legacy transfer record — wallet ownership not proven in the stored record');
  }
  limitations.push('Not complete wallet history');
  limitations.push('Cross-device history unavailable');
  return limitations;
}

export function buildDetailFromJournalRecord(
  record: TransactionJournalRecord,
  flowRecords: TransactionJournalRecord[],
  activeWallet?: string | null,
): TransactionDetailModel | null {
  if (activeWallet && !canAccessJournalDetail(record, activeWallet)) {
    return null;
  }

  const flowPeers = flowRecords.filter((r) => r.flowId === record.flowId);
  const hasSwapPeer = flowPeers.some((r) => r.kind === 'swap');
  const approvalOnlyFlow = record.kind === 'approval' && !hasSwapPeer;

  const limitations = baseLimitations('journal');
  if (!record.receipt) limitations.push('Receipt unavailable');
  if (approvalOnlyFlow) {
    limitations.push('Swap transaction was not submitted in this flow');
  }

  const model: TransactionDetailModel = {
    id: record.id,
    source: 'journal',
    kind: record.kind,
    status: record.status,
    confidence: 'journal-context',
    statusExplanation: presentStatusExplanation(record.status),
    walletAddress: record.walletAddress,
    walletAddressMasked: maskWalletAddress(record.walletAddress),
    chainId: record.chainId,
    chainName: resolveChainName(record.chainId),
    transactionHash: record.transactionHash,
    explorerUrl: explorerUrl(record.chainId, record.transactionHash, record.explorerUrl),
    submittedAt: record.submittedAt,
    updatedAt: record.updatedAt,
    lastCheckedAt: record.lastCheckedAt,
    confirmedAt: record.confirmedAt ?? record.receipt?.confirmedAt,
    blockNumber: record.blockNumber ?? record.receipt?.blockNumber,
    flowId: record.flowId,
    relatedTransactions: relatedSummaries(flowPeers, record.id),
    approvalOnlyFlow,
    journalRecordId: record.id,
    summaryFields: collectFields(
      field('Kind', presentActivityKind(record.kind), 'authoritative'),
      field('Status', presentActivityStatus(record.status), 'authoritative'),
      field('Source', presentActivitySource('journal'), 'authoritative'),
      field('Chain', resolveChainName(record.chainId), 'authoritative'),
      field('Submitted', new Date(record.submittedAt).toLocaleString(), 'derived'),
    ),
    transactionFields: collectFields(
      field('Transaction hash', record.transactionHash, 'authoritative', undefined, true),
      field('Wallet', maskWalletAddress(record.walletAddress), 'authoritative', 'Masked for display', true),
      field(
        'Block',
        (record.blockNumber ?? record.receipt?.blockNumber)?.toString(),
        record.receipt ? 'authoritative' : 'unavailable',
      ),
    ),
    receipt: buildReceiptSection(record),
    reconciliation: buildReconciliationSection(record),
    error: buildErrorSection(record),
    limitations,
  };

  if (record.kind === 'approval') {
    model.approval = buildApprovalSection(record);
  }
  if (record.kind === 'swap') {
    model.swap = buildSwapSection(record);
  }

  return model;
}

export function buildDetailFromUnifiedActivity(
  item: UnifiedActivityItem,
  journalRecords: TransactionJournalRecord[],
  transferRecords: SwapRecord[],
  activeWallet?: string | null,
): TransactionDetailModel | null {
  if (item.source === 'journal') {
    const recordId = item.id.startsWith('journal:') ? item.id.slice('journal:'.length) : undefined;
    const record = recordId ? journalRecords.find((r) => r.id === recordId) : undefined;
    if (!record) return null;
    return buildDetailFromJournalRecord(record, journalRecords, activeWallet);
  }

  if (item.source === 'legacy-transfer') {
    const transfer =
      item.localRecord ??
      transferRecords.find((r) => r.txHash.toLowerCase() === item.transactionHash.toLowerCase());
    if (!transfer) return null;
    return buildDetailFromLegacyTransfer(transfer, item, activeWallet);
  }

  return buildDetailFromExplorerItem(item);
}

function buildDetailFromExplorerItem(item: UnifiedActivityItem): TransactionDetailModel {
  const limitations = baseLimitations('explorer');
  return {
    id: item.id,
    source: 'explorer',
    kind: item.kind,
    status: item.status,
    confidence: 'chain-observed',
    statusExplanation: presentStatusExplanation(item.status),
    walletAddress: item.walletAddress || undefined,
    walletAddressMasked: item.walletAddress ? maskWalletAddress(item.walletAddress) : undefined,
    chainId: item.chainId,
    chainName: resolveChainName(item.chainId),
    transactionHash: item.transactionHash,
    explorerUrl: item.explorerUrl ?? explorerUrl(item.chainId, item.transactionHash),
    submittedAt: item.timestamp,
    summaryFields: collectFields(
      field('Kind', presentActivityKind(item.kind), 'derived'),
      field('Status', presentActivityStatus(item.status), 'derived'),
      field('Source', presentActivitySource('explorer'), 'authoritative'),
      field('Chain', resolveChainName(item.chainId), 'authoritative'),
      field('Observed', new Date(item.ts).toLocaleString(), 'derived'),
    ),
    transactionFields: collectFields(
      field('Transaction hash', item.transactionHash, 'authoritative', undefined, true),
      field('Value', item.subtitle, 'derived'),
    ),
    limitations,
  };
}

function buildDetailFromLegacyTransfer(
  transfer: SwapRecord,
  item: UnifiedActivityItem,
  activeWallet?: string | null,
): TransactionDetailModel {
  void activeWallet;
  const limitations = baseLimitations('legacy-transfer');
  return {
    id: item.id,
    source: 'legacy-transfer',
    kind: 'transfer',
    status: item.status,
    confidence: 'legacy-local',
    statusExplanation: presentStatusExplanation(item.status),
    walletAddressMasked: item.walletAddress ? maskWalletAddress(item.walletAddress) : undefined,
    chainId: item.chainId,
    chainName: resolveChainName(item.chainId),
    transactionHash: item.transactionHash,
    explorerUrl: item.explorerUrl ?? explorerUrl(item.chainId, item.transactionHash),
    submittedAt: item.timestamp,
    summaryFields: collectFields(
      field('Kind', 'Transfer', 'local-context'),
      field('Status', presentActivityStatus(item.status), 'local-context'),
      field('Source', presentActivitySource('legacy-transfer'), 'authoritative'),
      field('Chain', resolveChainName(item.chainId), 'authoritative'),
      field('Saved', new Date(item.ts).toLocaleString(), 'local-context'),
    ),
    transactionFields: collectFields(
      field('Transaction hash', item.transactionHash, 'authoritative', undefined, true),
    ),
    transfer: buildTransferSection(transfer),
    limitations,
  };
}

export function buildDetailFromRecoveredTrace(
  activeRecordId: string,
  journalRecords: TransactionJournalRecord[],
  activeWallet?: string | null,
): TransactionDetailModel | null {
  const record = journalRecords.find((r) => r.id === activeRecordId);
  if (!record) return null;
  return buildDetailFromJournalRecord(record, journalRecords, activeWallet);
}

export function buildFlowDetailModels(
  flowId: string,
  journalRecords: TransactionJournalRecord[],
  activeWallet?: string | null,
): TransactionDetailModel[] {
  const flowRecords = journalRecords.filter((r) => r.flowId === flowId);
  return flowRecords
    .map((record) => buildDetailFromJournalRecord(record, flowRecords, activeWallet))
    .filter((model): model is TransactionDetailModel => model !== null)
    .sort((a, b) => {
      const order = { approval: 0, swap: 1 } as const;
      return (order[a.kind as keyof typeof order] ?? 2) - (order[b.kind as keyof typeof order] ?? 2);
    });
}
