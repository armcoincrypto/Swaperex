/**
 * Journal-backed recovered swap/approval trace for refresh recovery UX.
 */

import type {
  ApprovalJournalRecord,
  JournalTransactionStatus,
  SwapJournalRecord,
  TransactionJournalRecord,
} from '@/types/transactionJournal';
import { getExplorerTxUrl } from '@/config';

export type RecoveredRecoveryPhase =
  | 'recovering'
  | 'approval_pending'
  | 'approval_confirmed'
  | 'swap_submitted'
  | 'swap_pending'
  | 'swap_confirmed'
  | 'swap_reverted'
  | 'status_unavailable'
  | 'stale';

/** Session recovery when quote is no longer in memory but a tx was already sent. */
export interface RecoveredSwapTrace {
  flowId: string;
  phase: RecoveredRecoveryPhase;
  kind: 'approval' | 'swap';
  activeRecordId: string;
  chainId: number;
  walletAddress: string;
  status: JournalTransactionStatus;
  fromSymbol: string;
  toSymbol: string;
  fromAmount: string;
  toAmount: string;
  submittedAt: string;
  lastCheckedAt?: string;
  explorerUrl?: string;
  transactionHash: string;
  outcomeUncertain?: boolean;
  approvalRecordId?: string;
  swapRecordId?: string;
  errorCategory?: string;
  isReconciling?: boolean;
}

const UNRESOLVED = new Set<JournalTransactionStatus>([
  'submitted',
  'pending',
  'unknown',
  'stale',
]);

function recordSubmittedMs(record: TransactionJournalRecord): number {
  const ms = Date.parse(record.submittedAt);
  return Number.isNaN(ms) ? 0 : ms;
}

function phaseFromStatus(
  kind: 'approval' | 'swap',
  status: JournalTransactionStatus,
  hasSwap: boolean,
): RecoveredRecoveryPhase {
  if (status === 'stale') return 'stale';
  if (status === 'unknown') return 'status_unavailable';
  if (kind === 'approval') {
    if (status === 'confirmed') return hasSwap ? 'approval_confirmed' : 'approval_confirmed';
    return 'approval_pending';
  }
  if (status === 'confirmed') return 'swap_confirmed';
  if (status === 'reverted') return 'swap_reverted';
  if (status === 'submitted') return 'swap_submitted';
  return 'swap_pending';
}

function buildTraceFromFlow(params: {
  flowId: string;
  approval?: ApprovalJournalRecord;
  swap?: SwapJournalRecord;
  isReconciling?: boolean;
}): RecoveredSwapTrace | null {
  const { flowId, approval, swap, isReconciling } = params;

  if (swap && UNRESOLVED.has(swap.status)) {
    const ctx = swap.context;
    return {
      flowId,
      phase: phaseFromStatus('swap', swap.status, true),
      kind: 'swap',
      activeRecordId: swap.id,
      chainId: swap.chainId,
      walletAddress: swap.walletAddress,
      status: swap.status,
      fromSymbol: ctx.fromTokenSymbol,
      toSymbol: ctx.toTokenSymbol,
      fromAmount: ctx.inputAmountDisplay,
      toAmount: ctx.expectedOutputDisplay,
      submittedAt: swap.submittedAt,
      lastCheckedAt: swap.lastCheckedAt,
      explorerUrl: swap.explorerUrl ?? getExplorerTxUrl(swap.chainId, swap.transactionHash),
      transactionHash: swap.transactionHash,
      outcomeUncertain: swap.status === 'unknown' || swap.status === 'stale',
      approvalRecordId: approval?.id,
      swapRecordId: swap.id,
      errorCategory: swap.error?.category,
      isReconciling,
    };
  }

  if (approval && UNRESOLVED.has(approval.status)) {
    const ctx = approval.context;
    return {
      flowId,
      phase: phaseFromStatus('approval', approval.status, Boolean(swap)),
      kind: 'approval',
      activeRecordId: approval.id,
      chainId: approval.chainId,
      walletAddress: approval.walletAddress,
      status: approval.status,
      fromSymbol: ctx.tokenSymbol,
      toSymbol: ctx.tokenSymbol,
      fromAmount: ctx.approvedAmountDisplay ?? '—',
      toAmount: '—',
      submittedAt: approval.submittedAt,
      lastCheckedAt: approval.lastCheckedAt,
      explorerUrl: approval.explorerUrl ?? getExplorerTxUrl(approval.chainId, approval.transactionHash),
      transactionHash: approval.transactionHash,
      outcomeUncertain: approval.status === 'unknown' || approval.status === 'stale',
      approvalRecordId: approval.id,
      swapRecordId: swap?.id,
      errorCategory: approval.error?.category,
      isReconciling,
    };
  }

  if (approval?.status === 'confirmed' && !swap) {
    const ctx = approval.context;
    return {
      flowId,
      phase: 'approval_confirmed',
      kind: 'approval',
      activeRecordId: approval.id,
      chainId: approval.chainId,
      walletAddress: approval.walletAddress,
      status: approval.status,
      fromSymbol: ctx.tokenSymbol,
      toSymbol: ctx.tokenSymbol,
      fromAmount: ctx.approvedAmountDisplay ?? '—',
      toAmount: '—',
      submittedAt: approval.submittedAt,
      lastCheckedAt: approval.lastCheckedAt,
      explorerUrl: approval.explorerUrl ?? getExplorerTxUrl(approval.chainId, approval.transactionHash),
      transactionHash: approval.transactionHash,
      approvalRecordId: approval.id,
      isReconciling,
    };
  }

  return null;
}

export function selectRecoveredSwapTrace(
  records: TransactionJournalRecord[],
  flowId: string,
  isReconciling = false,
): RecoveredSwapTrace | null {
  const flowRecords = records.filter((r) => r.flowId === flowId);
  if (flowRecords.length === 0) return null;

  const approval = flowRecords.find((r): r is ApprovalJournalRecord => r.kind === 'approval');
  const swap = flowRecords.find((r): r is SwapJournalRecord => r.kind === 'swap');
  return buildTraceFromFlow({ flowId, approval, swap, isReconciling });
}

export function getRecoveredTraceForWallet(
  records: TransactionJournalRecord[],
  walletAddress: string | null | undefined,
  reconcilingRecordIds: ReadonlySet<string> = new Set(),
): RecoveredSwapTrace | null {
  if (!walletAddress) return null;
  const wallet = walletAddress.toLowerCase();

  const walletRecords = records.filter((r) => r.walletAddress === wallet);
  const flowIds = [...new Set(walletRecords.map((r) => r.flowId))];
  if (flowIds.length === 0) return null;

  const sortedFlowIds = flowIds.sort((a, b) => {
    const aMax = Math.max(
      ...walletRecords.filter((r) => r.flowId === a).map(recordSubmittedMs),
    );
    const bMax = Math.max(
      ...walletRecords.filter((r) => r.flowId === b).map(recordSubmittedMs),
    );
    return bMax - aMax;
  });

  for (const flowId of sortedFlowIds) {
    const approval = walletRecords.find((r): r is ApprovalJournalRecord => r.flowId === flowId && r.kind === 'approval');
    const swap = walletRecords.find((r): r is SwapJournalRecord => r.flowId === flowId && r.kind === 'swap');
    const activeId = swap?.id ?? approval?.id;
    const trace = buildTraceFromFlow({
      flowId,
      approval,
      swap,
      isReconciling: activeId ? reconcilingRecordIds.has(activeId) : false,
    });
    if (trace) return trace;
  }

  return null;
}

export function getRecoveryStatusCopy(phase: RecoveredRecoveryPhase): { title: string; description: string } {
  switch (phase) {
    case 'approval_pending':
      return {
        title: 'Approval pending',
        description: 'Transaction pending. Confirmation may take a little longer than usual.',
      };
    case 'approval_confirmed':
      return {
        title: 'Token approval confirmed',
        description: 'The swap transaction has not been submitted yet.',
      };
    case 'swap_submitted':
      return {
        title: 'Transaction submitted',
        description: 'Waiting for the network to include it.',
      };
    case 'swap_pending':
      return {
        title: 'Swap pending',
        description: 'Transaction pending. Confirmation may take a little longer than usual.',
      };
    case 'swap_confirmed':
      return {
        title: 'Swap confirmed',
        description: 'The transaction was confirmed on-chain.',
      };
    case 'swap_reverted':
      return {
        title: 'Transaction reverted',
        description: 'The network confirmed the transaction did not complete successfully.',
      };
    case 'status_unavailable':
      return {
        title: 'Status temporarily unavailable',
        description:
          'Swaperex could not verify the latest on-chain status. Check again or view the transaction in the explorer.',
      };
    case 'stale':
      return {
        title: 'Transaction status unresolved',
        description:
          'Swaperex has not found a final receipt for this transaction. This does not necessarily mean it failed.',
      };
    case 'recovering':
    default:
      return {
        title: 'Checking transaction status',
        description: 'Recovering the latest on-chain status for this transaction.',
      };
  }
}
