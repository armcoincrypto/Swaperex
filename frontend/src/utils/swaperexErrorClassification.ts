/**
 * P17.6 — Canonical Swaperex error classifier (single owner for raw errors).
 */

import type {
  ErrorClassificationContext,
  ErrorFinality,
  ErrorRecommendedAction,
  ErrorRetryability,
  NormalizedSwaperexError,
  SwaperexErrorCategory,
  SwaperexErrorStage,
} from '@/types/swaperexErrors';
import { isUserRejection, isWalletSignRequestPending } from '@/utils/errors';

const MAX_TECHNICAL = 300;

function boundTechnical(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_TECHNICAL ? `${trimmed.slice(0, MAX_TECHNICAL)}…` : trimmed;
}

function hasHash(context: ErrorClassificationContext): boolean {
  return Boolean(context.transactionHash || context.broadcastKnown);
}

function defaultStage(context: ErrorClassificationContext): SwaperexErrorStage {
  return context.stage ?? 'swap-submit';
}

function buildNormalized(params: {
  category: SwaperexErrorCategory;
  stage: SwaperexErrorStage;
  finality: ErrorFinality;
  broadcastKnown: boolean;
  retryability: ErrorRetryability;
  recommendedAction: ErrorRecommendedAction;
  userTitle: string;
  userMessage: string;
  technicalSummary?: string;
  code?: string;
  occurredAt?: string;
}): NormalizedSwaperexError {
  return {
    category: params.category,
    stage: params.stage,
    finality: params.finality,
    broadcastKnown: params.broadcastKnown,
    retryability: params.retryability,
    recommendedAction: params.recommendedAction,
    userTitle: params.userTitle,
    userMessage: params.userMessage,
    technicalSummary: boundTechnical(params.technicalSummary),
    code: params.code,
    occurredAt: params.occurredAt ?? new Date().toISOString(),
  };
}

export function normalizeJournalUncertainty(
  status: 'unknown' | 'stale' | 'reverted' | 'pending' | 'submitted',
  context: Pick<ErrorClassificationContext, 'transactionHash' | 'stage'> = {},
): NormalizedSwaperexError {
  const stage = context.stage ?? 'reconciliation';
  const broadcastKnown = Boolean(context.transactionHash);

  if (status === 'unknown') {
    return buildNormalized({
      category: 'transaction_unknown',
      stage,
      finality: broadcastKnown ? 'post_broadcast_nonfinal' : 'pre_broadcast',
      broadcastKnown,
      retryability: 'check_status_first',
      recommendedAction: 'check_status',
      userTitle: 'Status temporarily unavailable',
      userMessage:
        'Kobbex could not verify the latest on-chain status. Check again or view the transaction in the explorer.',
    });
  }

  if (status === 'stale') {
    return buildNormalized({
      category: 'transaction_stale',
      stage,
      finality: 'post_broadcast_nonfinal',
      broadcastKnown: true,
      retryability: 'check_status_first',
      recommendedAction: 'check_status',
      userTitle: 'Transaction status unresolved',
      userMessage:
        'No final receipt has been found after the resolution window. This does not prove that the transaction failed.',
    });
  }

  if (status === 'reverted') {
    const isApproval = stage.startsWith('approval');
    return buildNormalized({
      category: isApproval ? 'approval_reverted' : 'swap_reverted',
      stage,
      finality: 'post_broadcast_final',
      broadcastKnown: true,
      retryability: 'safe_after_user_action',
      recommendedAction: 'view_explorer',
      userTitle: 'Transaction reverted on-chain',
      userMessage: 'The network confirmed the transaction did not complete successfully.',
    });
  }

  return buildNormalized({
    category: 'transaction_unknown',
    stage,
    finality: broadcastKnown ? 'post_broadcast_nonfinal' : 'pre_broadcast',
    broadcastKnown,
    retryability: 'check_status_first',
    recommendedAction: 'wait',
    userTitle: status === 'submitted' ? 'Transaction submitted' : 'Transaction pending',
    userMessage:
      status === 'submitted'
        ? 'The transaction hash was received, but no final receipt has been found yet.'
        : 'The transaction is still awaiting a final on-chain receipt.',
  });
}

export function normalizeSwaperexError(
  error: unknown,
  context: ErrorClassificationContext = {},
): NormalizedSwaperexError {
  const stage = defaultStage(context);
  const broadcastKnown = hasHash(context);
  const err = error as {
    code?: number | string;
    message?: string;
    reason?: string;
    swapErrorReasonCode?: string;
  };
  const raw = (err?.message || err?.reason || (typeof error === 'string' ? error : '')).trim();
  const message = raw.toLowerCase();
  const code = err?.code;

  // 1. Receipt-backed truth
  if (context.receiptStatus === 0) {
    const isApproval = stage.startsWith('approval');
    return buildNormalized({
      category: isApproval ? 'approval_reverted' : 'swap_reverted',
      stage,
      finality: 'post_broadcast_final',
      broadcastKnown: true,
      retryability: 'safe_after_user_action',
      recommendedAction: 'retry_quote',
      userTitle: 'Transaction reverted on-chain',
      userMessage: 'The network returned an unsuccessful transaction receipt.',
      technicalSummary: raw,
    });
  }

  // 2. Journal terminal / uncertain states
  if (context.journalStatus === 'reverted') {
    return normalizeJournalUncertainty('reverted', context);
  }
  if (context.journalStatus === 'unknown') {
    return normalizeJournalUncertainty('unknown', context);
  }
  if (context.journalStatus === 'stale') {
    return normalizeJournalUncertainty('stale', context);
  }

  // 3. Structured wallet codes
  if (code === 4001 || code === 'ACTION_REJECTED' || isUserRejection(error)) {
    return buildNormalized({
      category: 'user_rejected',
      stage,
      finality: broadcastKnown ? 'post_broadcast_nonfinal' : 'pre_broadcast',
      broadcastKnown,
      retryability: broadcastKnown ? 'check_status_first' : 'safe_now',
      recommendedAction: broadcastKnown ? 'view_explorer' : 'return_to_swap',
      userTitle: 'Request cancelled',
      userMessage: broadcastKnown
        ? 'A wallet request was cancelled. This does not prove the submitted transaction failed — check the explorer.'
        : 'No transaction was submitted.',
      code: String(code ?? '4001'),
    });
  }

  if (isWalletSignRequestPending(error) || code === -32002 || code === '-32002') {
    return buildNormalized({
      category: 'wallet_request_pending',
      stage,
      finality: 'pre_broadcast',
      broadcastKnown: false,
      retryability: 'safe_after_user_action',
      recommendedAction: 'none',
      userTitle: 'Check your wallet',
      userMessage: 'A wallet confirmation is already waiting for your response.',
      code: '-32002',
    });
  }

  if (code === 4902 || message.includes('wrong chain') || message.includes('wrong network')) {
    return buildNormalized({
      category: 'wrong_network',
      stage,
      finality: 'pre_broadcast',
      broadcastKnown: false,
      retryability: 'safe_after_user_action',
      recommendedAction: 'switch_network',
      userTitle: 'Wrong network',
      userMessage: 'Switch your wallet to the network shown in Kobbex and try again.',
    });
  }

  if (context.quoteExpired || message.includes('quote expired') || raw === 'QUOTE_EXPIRED') {
    return buildNormalized({
      category: 'quote_expired',
      stage: 'quote',
      finality: 'not_transaction_related',
      broadcastKnown: false,
      retryability: 'safe_now',
      recommendedAction: 'retry_quote',
      userTitle: 'Quote expired',
      userMessage: 'Refresh the quote and review the new rate before continuing.',
    });
  }

  if (code === -32000 || code === 'INSUFFICIENT_FUNDS') {
    return buildNormalized({
      category: 'insufficient_native_gas',
      stage,
      finality: broadcastKnown ? 'post_broadcast_nonfinal' : 'pre_broadcast',
      broadcastKnown,
      retryability: 'safe_after_user_action',
      recommendedAction: 'add_native_gas',
      userTitle: 'Not enough network token for gas',
      userMessage: 'Add the native network token to cover network fees, then try again.',
      technicalSummary: raw,
      code: String(code),
    });
  }

  // Gas vs token balance
  if (
    message.includes('intrinsic gas') ||
    message.includes('gas required exceeds') ||
    (message.includes('insufficient funds') && message.includes('gas')) ||
    (message.includes('gas') && (message.includes('failed') || message.includes('required')))
  ) {
    return buildNormalized({
      category: 'insufficient_native_gas',
      stage,
      finality: broadcastKnown ? 'post_broadcast_nonfinal' : 'pre_broadcast',
      broadcastKnown,
      retryability: 'safe_after_user_action',
      recommendedAction: 'add_native_gas',
      userTitle: 'Not enough network token for gas',
      userMessage: 'Add the native network token to cover network fees, then try again.',
      technicalSummary: raw,
    });
  }

  if (
    message.includes('insufficient balance') ||
    message.includes('insufficient token') ||
    message.includes('transfer amount exceeds balance') ||
    (message.includes('insufficient') && !message.includes('gas'))
  ) {
    return buildNormalized({
      category: 'insufficient_token_balance',
      stage,
      finality: 'pre_broadcast',
      broadcastKnown: false,
      retryability: 'safe_after_user_action',
      recommendedAction: 'reduce_amount',
      userTitle: 'Insufficient token balance',
      userMessage: 'Reduce the amount or add more of the selected token.',
      technicalSummary: raw,
    });
  }

  if (message.includes('allowance') || message.includes('approve first')) {
    return buildNormalized({
      category: 'allowance_insufficient',
      stage: 'allowance-check',
      finality: 'pre_broadcast',
      broadcastKnown: false,
      retryability: 'safe_now',
      recommendedAction: 'return_to_swap',
      userTitle: 'Token allowance required',
      userMessage: 'Approve the token in your wallet before swapping.',
      technicalSummary: raw,
    });
  }

  if (
    message.includes('slippage') ||
    message.includes('price moved') ||
    message.includes('too little received') ||
    message.includes('minimum received')
  ) {
    const finality: ErrorFinality = broadcastKnown && context.receiptStatus === 0
      ? 'post_broadcast_final'
      : broadcastKnown
        ? 'post_broadcast_nonfinal'
        : 'pre_broadcast';
    return buildNormalized({
      category: 'slippage_exceeded',
      stage,
      finality,
      broadcastKnown,
      retryability: finality === 'post_broadcast_final' ? 'safe_after_user_action' : 'safe_now',
      recommendedAction: finality === 'post_broadcast_final' ? 'view_explorer' : 'retry_quote',
      userTitle: 'Price moved beyond your limit',
      userMessage:
        finality === 'post_broadcast_final'
          ? 'The transaction reverted because execution conditions were not met.'
          : 'Refresh the quote and review the new rate before trying again.',
      technicalSummary: raw,
    });
  }

  if (
    (message.includes('revert') || message.includes('execution reverted')) &&
    !broadcastKnown
  ) {
    return buildNormalized({
      category: stage.startsWith('approval') ? 'approval_submission_failed' : 'swap_submission_failed',
      stage,
      finality: 'pre_broadcast',
      broadcastKnown: false,
      retryability: 'safe_now',
      recommendedAction: 'retry_quote',
      userTitle: 'Transaction could not be submitted',
      userMessage: 'No transaction hash was received.',
      technicalSummary: raw,
    });
  }

  if (message.includes('revert') && broadcastKnown && context.receiptStatus !== 1) {
    return buildNormalized({
      category: stage.startsWith('approval') ? 'approval_reverted' : 'swap_reverted',
      stage,
      finality: 'post_broadcast_final',
      broadcastKnown: true,
      retryability: 'safe_after_user_action',
      recommendedAction: 'view_explorer',
      userTitle: 'Transaction reverted on-chain',
      userMessage: 'The network confirmed the transaction did not complete successfully.',
      technicalSummary: raw,
    });
  }

  if (message.includes('timeout') || message.includes('timed out')) {
    return buildNormalized({
      category: 'rpc_timeout',
      stage,
      finality: broadcastKnown ? 'post_broadcast_nonfinal' : 'not_transaction_related',
      broadcastKnown,
      retryability: broadcastKnown ? 'check_status_first' : 'safe_now',
      recommendedAction: broadcastKnown ? 'check_status' : 'retry_quote',
      userTitle: 'Network request timed out',
      userMessage: broadcastKnown
        ? 'The transaction was submitted, but Kobbex could not determine its latest status. Check the explorer before attempting another transaction.'
        : 'The request timed out before a transaction hash was received.',
      technicalSummary: raw,
    });
  }

  if (
    message.includes('failed to fetch') ||
    message.includes('network error') ||
    message.includes('econnrefused') ||
    message.includes('json-rpc') ||
    code === -32603
  ) {
    return buildNormalized({
      category: 'rpc_unavailable',
      stage,
      finality: broadcastKnown ? 'post_broadcast_nonfinal' : 'not_transaction_related',
      broadcastKnown,
      retryability: broadcastKnown ? 'check_status_first' : 'safe_now',
      recommendedAction: broadcastKnown ? 'view_explorer' : 'retry_quote',
      userTitle: 'Network temporarily unavailable',
      userMessage: broadcastKnown
        ? 'Kobbex could not reach the network to verify status. Your saved transaction record is still shown.'
        : 'Kobbex could not complete the request. Wait a moment and try again.',
      technicalSummary: raw,
    });
  }

  if (err?.swapErrorReasonCode || stage === 'quote' || message.includes('quote') || message.includes('1inch:')) {
    return buildNormalized({
      category: context.quoteExpired ? 'quote_expired' : 'quote_unavailable',
      stage: 'quote',
      finality: 'not_transaction_related',
      broadcastKnown: false,
      retryability: 'safe_now',
      recommendedAction: 'retry_quote',
      userTitle: "Couldn't get a price",
      userMessage: 'Refresh the quote before trying again.',
      technicalSummary: raw,
      code: err?.swapErrorReasonCode,
    });
  }

  if (message.includes('unsupported chain')) {
    return buildNormalized({
      category: 'unsupported_chain',
      stage,
      finality: 'not_transaction_related',
      broadcastKnown: false,
      retryability: 'not_recommended',
      recommendedAction: 'return_to_swap',
      userTitle: 'Network not supported',
      userMessage: 'Kobbex does not support activity on this network.',
    });
  }

  if (message.includes('quota') || message.includes('storage')) {
    return buildNormalized({
      category: 'storage_unavailable',
      stage: 'storage',
      finality: broadcastKnown ? 'post_broadcast_nonfinal' : 'pre_broadcast',
      broadcastKnown,
      retryability: broadcastKnown ? 'check_status_first' : 'not_recommended',
      recommendedAction: broadcastKnown ? 'view_explorer' : 'contact_support',
      userTitle: 'Could not save on this device',
      userMessage: broadcastKnown
        ? 'Transaction submitted, but Kobbex could not save the local recovery record. Keep the transaction hash and check the explorer.'
        : 'Kobbex could not save local data on this device.',
      technicalSummary: raw,
    });
  }

  // Unknown fallback
  return buildNormalized({
    category: 'unknown_error',
    stage,
    finality: broadcastKnown ? 'post_broadcast_nonfinal' : 'pre_broadcast',
    broadcastKnown,
    retryability: broadcastKnown ? 'check_status_first' : 'unknown',
    recommendedAction: broadcastKnown ? 'view_explorer' : 'return_to_swap',
    userTitle: broadcastKnown ? 'Status not yet verified' : 'Request could not be completed',
    userMessage: broadcastKnown
      ? 'The transaction was submitted, but Kobbex could not determine its latest status. Check the explorer before attempting another transaction.'
      : 'No transaction hash was received.',
    technicalSummary: raw,
  });
}

export function normalizeSwaperexErrorFromMessage(
  message: string | null | undefined,
  context: ErrorClassificationContext = {},
): NormalizedSwaperexError {
  return normalizeSwaperexError(message ? new Error(message) : new Error(''), context);
}
