/**
 * P17.6 — Error presentation and action-safety matrix.
 */

import type {
  ErrorPresentation,
  ErrorRecommendedAction,
  NormalizedSwaperexError,
  SwaperexErrorCategory,
} from '@/types/swaperexErrors';
import type { JournalTransactionStatus } from '@/types/transactionJournal';
import {
  normalizeJournalUncertainty,
  normalizeSwaperexErrorFromMessage,
} from '@/utils/swaperexErrorClassification';
import type { ErrorClassificationContext } from '@/types/swaperexErrors';

function severityFor(category: SwaperexErrorCategory, finality: NormalizedSwaperexError['finality']): ErrorPresentation['severity'] {
  if (category === 'user_rejected' || category === 'wallet_request_pending') return 'info';
  if (category === 'transaction_unknown' || category === 'transaction_stale' || finality === 'post_broadcast_nonfinal') {
    return 'warning';
  }
  if (category === 'quote_expired' || category === 'quote_unavailable' || category === 'wrong_network') {
    return 'warning';
  }
  return 'error';
}

function suggestionFor(error: NormalizedSwaperexError): string | undefined {
  switch (error.recommendedAction) {
    case 'retry_quote':
      return 'Refresh the quote and review the new rate before continuing.';
    case 'switch_network':
      return 'Switch your wallet to the network shown in Swaperex.';
    case 'add_native_gas':
      return 'Add native network token (ETH or BNB) to cover fees.';
    case 'reduce_amount':
      return 'Reduce the swap amount or add more of the selected token.';
    case 'check_status':
      return 'Use Check status again or open the explorer before trying another transaction.';
    case 'view_explorer':
      return 'Open the block explorer to verify the on-chain result.';
    case 'contact_support':
      return 'Copy support details from transaction details if you need help.';
    case 'return_to_swap':
      return 'Return to the swap screen when you are ready.';
    case 'wait':
      return 'Wait for the network to confirm the transaction.';
    default:
      return undefined;
  }
}

const ACTION_MATRIX: Record<
  SwaperexErrorCategory,
  Pick<ErrorPresentation, 'canRetryQuote' | 'canResubmit' | 'canCheckStatus' | 'showExplorer' | 'showSupport'>
> = {
  user_rejected: { canRetryQuote: false, canResubmit: true, canCheckStatus: false, showExplorer: false, showSupport: false },
  wallet_request_pending: { canRetryQuote: false, canResubmit: false, canCheckStatus: false, showExplorer: false, showSupport: false },
  wallet_unavailable: { canRetryQuote: false, canResubmit: false, canCheckStatus: false, showExplorer: false, showSupport: true },
  wrong_network: { canRetryQuote: false, canResubmit: false, canCheckStatus: false, showExplorer: false, showSupport: false },
  unsupported_chain: { canRetryQuote: false, canResubmit: false, canCheckStatus: false, showExplorer: false, showSupport: true },
  insufficient_native_gas: { canRetryQuote: false, canResubmit: true, canCheckStatus: false, showExplorer: false, showSupport: false },
  insufficient_token_balance: { canRetryQuote: false, canResubmit: false, canCheckStatus: false, showExplorer: false, showSupport: false },
  allowance_insufficient: { canRetryQuote: false, canResubmit: true, canCheckStatus: false, showExplorer: false, showSupport: false },
  approval_submission_failed: { canRetryQuote: true, canResubmit: true, canCheckStatus: false, showExplorer: false, showSupport: false },
  approval_reverted: { canRetryQuote: true, canResubmit: false, canCheckStatus: false, showExplorer: true, showSupport: true },
  quote_unavailable: { canRetryQuote: true, canResubmit: false, canCheckStatus: false, showExplorer: false, showSupport: false },
  quote_expired: { canRetryQuote: true, canResubmit: false, canCheckStatus: false, showExplorer: false, showSupport: false },
  quote_changed: { canRetryQuote: true, canResubmit: false, canCheckStatus: false, showExplorer: false, showSupport: false },
  slippage_exceeded: { canRetryQuote: true, canResubmit: false, canCheckStatus: false, showExplorer: true, showSupport: false },
  provider_route_unavailable: { canRetryQuote: true, canResubmit: false, canCheckStatus: false, showExplorer: false, showSupport: false },
  swap_submission_failed: { canRetryQuote: true, canResubmit: true, canCheckStatus: false, showExplorer: false, showSupport: false },
  swap_reverted: { canRetryQuote: true, canResubmit: false, canCheckStatus: false, showExplorer: true, showSupport: true },
  contract_revert: { canRetryQuote: true, canResubmit: false, canCheckStatus: false, showExplorer: true, showSupport: true },
  rpc_timeout: { canRetryQuote: false, canResubmit: false, canCheckStatus: true, showExplorer: true, showSupport: false },
  rpc_unavailable: { canRetryQuote: false, canResubmit: false, canCheckStatus: true, showExplorer: true, showSupport: false },
  receipt_unavailable: { canRetryQuote: false, canResubmit: false, canCheckStatus: true, showExplorer: true, showSupport: false },
  transaction_not_found: { canRetryQuote: false, canResubmit: false, canCheckStatus: true, showExplorer: true, showSupport: true },
  transaction_unknown: { canRetryQuote: false, canResubmit: false, canCheckStatus: true, showExplorer: true, showSupport: true },
  transaction_stale: { canRetryQuote: false, canResubmit: false, canCheckStatus: true, showExplorer: true, showSupport: true },
  storage_unavailable: { canRetryQuote: false, canResubmit: false, canCheckStatus: true, showExplorer: true, showSupport: true },
  storage_corrupt: { canRetryQuote: false, canResubmit: false, canCheckStatus: false, showExplorer: false, showSupport: true },
  explorer_unavailable: { canRetryQuote: false, canResubmit: false, canCheckStatus: false, showExplorer: false, showSupport: false },
  configuration_error: { canRetryQuote: false, canResubmit: false, canCheckStatus: false, showExplorer: false, showSupport: true },
  validation_error: { canRetryQuote: false, canResubmit: false, canCheckStatus: false, showExplorer: false, showSupport: true },
  unknown_error: { canRetryQuote: false, canResubmit: false, canCheckStatus: true, showExplorer: true, showSupport: true },
};

export function getPermittedErrorActions(error: NormalizedSwaperexError): ErrorRecommendedAction[] {
  const actions: ErrorRecommendedAction[] = [];
  const matrix = ACTION_MATRIX[error.category];

  if (matrix.canRetryQuote) actions.push('retry_quote');
  if (matrix.canCheckStatus) actions.push('check_status');
  if (matrix.showExplorer) actions.push('view_explorer');
  if (matrix.showSupport) actions.push('contact_support');
  if (matrix.canResubmit && error.finality === 'pre_broadcast') actions.push('return_to_swap');
  if (error.recommendedAction !== 'none' && !actions.includes(error.recommendedAction)) {
    actions.unshift(error.recommendedAction);
  }
  return actions;
}

export function isActionPermitted(
  error: NormalizedSwaperexError,
  action: ErrorRecommendedAction,
): boolean {
  return getPermittedErrorActions(error).includes(action);
}

export function getErrorPresentation(error: NormalizedSwaperexError): ErrorPresentation {
  const matrix = ACTION_MATRIX[error.category];
  const canResubmit = matrix.canResubmit && error.finality === 'pre_broadcast';

  return {
    title: error.userTitle,
    message: error.userMessage,
    suggestion: suggestionFor(error),
    severity: severityFor(error.category, error.finality),
    primaryAction: error.recommendedAction,
    secondaryAction: matrix.showExplorer ? 'view_explorer' : undefined,
    showExplorer: matrix.showExplorer && error.broadcastKnown,
    showSupport: matrix.showSupport,
    canRetryQuote: matrix.canRetryQuote,
    canResubmit,
    canCheckStatus: matrix.canCheckStatus && error.broadcastKnown,
  };
}

export function getErrorPresentationFromMessage(
  message: string | null | undefined,
  context: ErrorClassificationContext = {},
): ErrorPresentation {
  return getErrorPresentation(normalizeSwaperexErrorFromMessage(message, context));
}

export function getJournalStatusPresentation(
  status: JournalTransactionStatus,
  context: Pick<ErrorClassificationContext, 'transactionHash' | 'stage'> = {},
): { title: string; description: string } {
  if (status === 'confirmed') {
    return {
      title: 'Confirmed',
      description: 'A successful on-chain receipt was found.',
    };
  }
  if (status === 'pending' || status === 'submitted') {
    const normalized = normalizeJournalUncertainty(status, context);
    return { title: normalized.userTitle, description: normalized.userMessage };
  }
  if (status === 'reverted' || status === 'unknown' || status === 'stale') {
    const normalized = normalizeJournalUncertainty(status, context);
    return { title: normalized.userTitle, description: normalized.userMessage };
  }
  return {
    title: 'Activity',
    description: 'Transaction status information is limited.',
  };
}

export function presentErrorCategoryLabel(category: SwaperexErrorCategory): string {
  return category.replace(/_/g, ' ');
}
