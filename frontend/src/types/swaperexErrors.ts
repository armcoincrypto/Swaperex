/**
 * P17.6 — Canonical Swaperex error and uncertainty model.
 */

import type { JournalTransactionStatus } from '@/types/transactionJournal';
import type { ErrorCategory } from '@/utils/errors';

export type SwaperexErrorCategory =
  | 'user_rejected'
  | 'wallet_request_pending'
  | 'wallet_unavailable'
  | 'wrong_network'
  | 'unsupported_chain'
  | 'insufficient_native_gas'
  | 'insufficient_token_balance'
  | 'allowance_insufficient'
  | 'approval_submission_failed'
  | 'approval_reverted'
  | 'quote_unavailable'
  | 'quote_expired'
  | 'quote_changed'
  | 'slippage_exceeded'
  | 'provider_route_unavailable'
  | 'swap_submission_failed'
  | 'swap_reverted'
  | 'contract_revert'
  | 'rpc_timeout'
  | 'rpc_unavailable'
  | 'receipt_unavailable'
  | 'transaction_not_found'
  | 'transaction_unknown'
  | 'transaction_stale'
  | 'storage_unavailable'
  | 'storage_corrupt'
  | 'explorer_unavailable'
  | 'configuration_error'
  | 'validation_error'
  | 'unknown_error';

export type SwaperexErrorStage =
  | 'wallet-connect'
  | 'quote'
  | 'allowance-check'
  | 'approval-submit'
  | 'approval-confirm'
  | 'swap-submit'
  | 'swap-confirm'
  | 'reconciliation'
  | 'history'
  | 'details'
  | 'storage'
  | 'configuration';

export type ErrorFinality =
  | 'pre_broadcast'
  | 'post_broadcast_nonfinal'
  | 'post_broadcast_final'
  | 'not_transaction_related';

export type ErrorRetryability =
  | 'safe_now'
  | 'safe_after_user_action'
  | 'check_status_first'
  | 'not_recommended'
  | 'unknown';

export type ErrorRecommendedAction =
  | 'retry_quote'
  | 'reconnect_wallet'
  | 'switch_network'
  | 'add_native_gas'
  | 'reduce_amount'
  | 'check_balance'
  | 'check_status'
  | 'view_explorer'
  | 'wait'
  | 'contact_support'
  | 'return_to_swap'
  | 'none';

export type ErrorSource = 'wallet' | 'rpc' | 'quote' | 'application' | 'storage' | 'explorer' | 'reconciliation';

export interface ErrorClassificationContext {
  stage?: SwaperexErrorStage;
  transactionHash?: string;
  broadcastKnown?: boolean;
  receiptStatus?: number;
  journalStatus?: JournalTransactionStatus;
  chainId?: number;
  quoteExpired?: boolean;
}

export interface NormalizedSwaperexError {
  category: SwaperexErrorCategory;
  stage: SwaperexErrorStage;
  finality: ErrorFinality;
  broadcastKnown: boolean;
  retryability: ErrorRetryability;
  recommendedAction: ErrorRecommendedAction;
  userMessage: string;
  userTitle: string;
  technicalSummary?: string;
  code?: string;
  source?: ErrorSource;
  occurredAt: string;
}

export type ErrorSeverity = 'info' | 'warning' | 'error';

export interface ErrorPresentation {
  title: string;
  message: string;
  suggestion?: string;
  severity: ErrorSeverity;
  primaryAction?: ErrorRecommendedAction;
  secondaryAction?: ErrorRecommendedAction;
  showExplorer: boolean;
  showSupport: boolean;
  canRetryQuote: boolean;
  canResubmit: boolean;
  canCheckStatus: boolean;
}

export function toLegacyErrorCategory(category: SwaperexErrorCategory): ErrorCategory {
  switch (category) {
    case 'user_rejected':
      return 'user_rejected';
    case 'wallet_request_pending':
      return 'wallet_sign_pending';
    case 'wallet_unavailable':
      return 'wallet_error';
    case 'wrong_network':
    case 'unsupported_chain':
    case 'explorer_unavailable':
      return 'network_error';
    case 'insufficient_native_gas':
    case 'insufficient_token_balance':
    case 'allowance_insufficient':
      return 'insufficient_balance';
    case 'quote_unavailable':
    case 'quote_expired':
    case 'quote_changed':
    case 'provider_route_unavailable':
    case 'slippage_exceeded':
      return 'quote_error';
    case 'approval_submission_failed':
    case 'swap_submission_failed':
      return 'transaction_error';
    case 'approval_reverted':
    case 'swap_reverted':
    case 'contract_revert':
      return 'contract_error';
    case 'rpc_timeout':
    case 'rpc_unavailable':
    case 'receipt_unavailable':
      return 'rpc_error';
    case 'transaction_unknown':
    case 'transaction_stale':
    case 'transaction_not_found':
    case 'unknown_error':
      return 'unknown';
    case 'storage_unavailable':
    case 'storage_corrupt':
    case 'configuration_error':
    case 'validation_error':
      return 'unknown';
    default:
      return 'unknown';
  }
}
