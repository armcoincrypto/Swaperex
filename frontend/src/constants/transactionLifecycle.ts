/**
 * P16.5 — Canonical transaction lifecycle model for swap flows.
 *
 * Maps internal pipeline states to user-facing titles, actions, and telemetry.
 */

import type { SwapStatus } from '@/hooks/useSwap';

export type TransactionLifecycleId =
  | 'idle'
  | 'quote_loading'
  | 'quote_ready'
  | 'quote_expired'
  | 'approval_required'
  | 'approval_pending'
  | 'approval_rejected'
  | 'approval_confirmed'
  | 'swap_pending'
  | 'swap_confirmed'
  | 'swap_failed'
  | 'unknown';

export interface TransactionLifecycleSpec {
  id: TransactionLifecycleId;
  title: string;
  description: string;
  userAction: string;
  explorerLink: 'hidden' | 'when_hash_available' | 'always_when_hash';
  telemetryEvent: string;
}

export const TRANSACTION_LIFECYCLE: Record<TransactionLifecycleId, TransactionLifecycleSpec> = {
  idle: {
    id: 'idle',
    title: 'Ready to swap',
    description: 'Connect your wallet and enter an amount to request a quote.',
    userAction: 'Connect wallet or enter amount',
    explorerLink: 'hidden',
    telemetryEvent: 'swap_lifecycle_idle',
  },
  quote_loading: {
    id: 'quote_loading',
    title: 'Fetching quote',
    description: 'Checking live liquidity and route costs for your pair.',
    userAction: 'Wait for quote',
    explorerLink: 'hidden',
    telemetryEvent: 'swap_lifecycle_quote_loading',
  },
  quote_ready: {
    id: 'quote_ready',
    title: 'Quote ready',
    description: 'Review the receive amount and network fee, then preview the swap.',
    userAction: 'Preview swap',
    explorerLink: 'hidden',
    telemetryEvent: 'swap_lifecycle_quote_ready',
  },
  quote_expired: {
    id: 'quote_expired',
    title: 'Quote expired',
    description: 'Market prices moved. Refresh to get a current quote before signing.',
    userAction: 'Refresh quote',
    explorerLink: 'hidden',
    telemetryEvent: 'swap_lifecycle_quote_expired',
  },
  approval_required: {
    id: 'approval_required',
    title: 'Approval required',
    description: 'Allow the swap router to spend this token once before you can swap.',
    userAction: 'Approve token in wallet',
    explorerLink: 'hidden',
    telemetryEvent: 'swap_lifecycle_approval_required',
  },
  approval_pending: {
    id: 'approval_pending',
    title: 'Approval pending',
    description: 'Confirm the approval transaction in your wallet.',
    userAction: 'Confirm in wallet',
    explorerLink: 'when_hash_available',
    telemetryEvent: 'swap_lifecycle_approval_pending',
  },
  approval_rejected: {
    id: 'approval_rejected',
    title: 'Approval rejected',
    description: 'You declined the approval. Swap remains blocked until approved.',
    userAction: 'Retry approval or change token',
    explorerLink: 'hidden',
    telemetryEvent: 'swap_lifecycle_approval_rejected',
  },
  approval_confirmed: {
    id: 'approval_confirmed',
    title: 'Approval confirmed',
    description: 'Token allowance is set. You can now preview and sign the swap.',
    userAction: 'Preview swap',
    explorerLink: 'when_hash_available',
    telemetryEvent: 'swap_lifecycle_approval_confirmed',
  },
  swap_pending: {
    id: 'swap_pending',
    title: 'Swap pending',
    description: 'Your swap transaction was submitted and is awaiting confirmation.',
    userAction: 'Wait for confirmation',
    explorerLink: 'when_hash_available',
    telemetryEvent: 'swap_lifecycle_swap_pending',
  },
  swap_confirmed: {
    id: 'swap_confirmed',
    title: 'Swap confirmed',
    description: 'Your swap settled on-chain. Balances update after the next refresh.',
    userAction: 'View in explorer or swap again',
    explorerLink: 'always_when_hash',
    telemetryEvent: 'swap_lifecycle_swap_confirmed',
  },
  swap_failed: {
    id: 'swap_failed',
    title: 'Swap failed',
    description: 'The transaction did not complete. No funds were moved unless a tx was broadcast.',
    userAction: 'Review error and retry',
    explorerLink: 'when_hash_available',
    telemetryEvent: 'swap_lifecycle_swap_failed',
  },
  unknown: {
    id: 'unknown',
    title: 'Status unknown',
    description: 'Could not determine the current swap state. Refresh or reconnect your wallet.',
    userAction: 'Refresh page',
    explorerLink: 'hidden',
    telemetryEvent: 'swap_lifecycle_unknown',
  },
};

export function resolveSwapLifecycle(params: {
  status: SwapStatus;
  hasQuote: boolean;
  isQuoteExpired: boolean;
  needsApproval?: boolean;
  userRejected?: boolean;
}): TransactionLifecycleSpec {
  const { status, hasQuote, isQuoteExpired, needsApproval, userRejected } = params;

  if (status === 'success') return TRANSACTION_LIFECYCLE.swap_confirmed;
  if (status === 'error') {
    if (userRejected && needsApproval) return TRANSACTION_LIFECYCLE.approval_rejected;
    return TRANSACTION_LIFECYCLE.swap_failed;
  }
  if (status === 'confirming') return TRANSACTION_LIFECYCLE.swap_pending;
  if (status === 'swapping') return TRANSACTION_LIFECYCLE.swap_pending;
  if (status === 'approving') return TRANSACTION_LIFECYCLE.approval_pending;
  if (status === 'fetching_quote' || status === 'checking_allowance') {
    return TRANSACTION_LIFECYCLE.quote_loading;
  }
  if (isQuoteExpired && hasQuote) return TRANSACTION_LIFECYCLE.quote_expired;
  if (hasQuote && needsApproval) return TRANSACTION_LIFECYCLE.approval_required;
  if (hasQuote && status === 'previewing') return TRANSACTION_LIFECYCLE.quote_ready;
  if (status === 'idle') return TRANSACTION_LIFECYCLE.idle;
  return TRANSACTION_LIFECYCLE.unknown;
}

/** Returns lifecycle id for swap UI state machine. */
export function mapSwapStatusToLifecycle(params: {
  status: SwapStatus;
  hasQuote: boolean;
  isQuoteExpired: boolean;
  needsApproval?: boolean;
  error?: unknown;
}): TransactionLifecycleId {
  const userRejected =
    params.error != null &&
    typeof params.error === 'object' &&
    'userRejected' in params.error &&
    Boolean((params.error as { userRejected?: boolean }).userRejected);

  return resolveSwapLifecycle({
    status: params.status,
    hasQuote: params.hasQuote,
    isQuoteExpired: params.isQuoteExpired,
    needsApproval: params.needsApproval,
    userRejected,
  }).id;
}

export function getTransactionLifecycleSpec(id: TransactionLifecycleId): TransactionLifecycleSpec {
  return TRANSACTION_LIFECYCLE[id];
}
