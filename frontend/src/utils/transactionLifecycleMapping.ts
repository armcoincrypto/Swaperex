/**
 * Authoritative mapping between runtime, presentation, and journal layers.
 */

import type { SwapStatus } from '@/hooks/useSwap';
import type { TransactionLifecycleId } from '@/constants/transactionLifecycle';
import type { JournalTransactionStatus } from '@/types/transactionJournal';

export function journalStatusFromReceiptStatus(
  receiptStatus: number | null | undefined,
): 'confirmed' | 'reverted' | null {
  if (receiptStatus === 1) return 'confirmed';
  if (receiptStatus === 0) return 'reverted';
  return null;
}

/** Whether a runtime swap event should create or mutate a journal record. */
export function shouldJournalRuntimeEvent(params: {
  hasTransactionHash: boolean;
  stage: 'approval-broadcast' | 'swap-broadcast' | 'receipt' | 'pre-broadcast';
}): boolean {
  if (params.stage === 'pre-broadcast') return false;
  return params.hasTransactionHash;
}

export function mapJournalStatusToLegacySwapHistoryStatus(
  status: JournalTransactionStatus,
): 'success' | 'failed' | 'pending' | 'uncertain' {
  switch (status) {
    case 'confirmed':
      return 'success';
    case 'reverted':
      return 'failed';
    case 'unknown':
    case 'stale':
      return 'uncertain';
    case 'submitted':
    case 'pending':
    default:
      return 'pending';
  }
}

export function presentationLifecycleFromRuntimeAndJournal(params: {
  runtimeStatus: SwapStatus;
  journalStatus?: JournalTransactionStatus;
  hasQuote: boolean;
  isQuoteExpired: boolean;
  needsApproval?: boolean;
  kind?: 'approval' | 'swap';
}): TransactionLifecycleId {
  const { runtimeStatus, journalStatus, hasQuote, isQuoteExpired, needsApproval, kind } = params;

  if (journalStatus === 'confirmed' && kind === 'swap') return 'swap_confirmed';
  if (journalStatus === 'reverted' && kind === 'swap') return 'swap_failed';
  if (journalStatus === 'confirmed' && kind === 'approval') return 'approval_confirmed';
  if (journalStatus === 'submitted' || journalStatus === 'pending') {
    return kind === 'approval' ? 'approval_pending' : 'swap_pending';
  }
  if (journalStatus === 'unknown' || journalStatus === 'stale') return 'unknown';

  if (runtimeStatus === 'success') return 'swap_confirmed';
  if (runtimeStatus === 'error') return 'swap_failed';
  if (runtimeStatus === 'confirming' || runtimeStatus === 'swapping') return 'swap_pending';
  if (runtimeStatus === 'approving') return 'approval_pending';
  if (runtimeStatus === 'fetching_quote' || runtimeStatus === 'checking_allowance') {
    return 'quote_loading';
  }
  if (isQuoteExpired && hasQuote) return 'quote_expired';
  if (hasQuote && needsApproval) return 'approval_required';
  if (hasQuote && runtimeStatus === 'previewing') return 'quote_ready';
  if (runtimeStatus === 'idle') return 'idle';
  return 'unknown';
}

export function runtimeStatusImpliesJournalPending(runtimeStatus: SwapStatus): boolean {
  return runtimeStatus === 'confirming' || runtimeStatus === 'approving';
}
