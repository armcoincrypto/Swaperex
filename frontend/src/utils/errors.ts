/**
 * Error Handling Utilities
 *
 * Centralized error categorization and user-friendly messages.
 * Used across wallet, swap, and withdrawal flows.
 *
 * PHASE 7 - SAFETY CHECKS:
 * - Catch RPC errors
 * - Catch user rejection
 * - NO silent failures
 */

import type { ErrorClassificationContext, NormalizedSwaperexError } from '@/types/swaperexErrors';
import { toLegacyErrorCategory } from '@/types/swaperexErrors';
import {
  normalizeSwaperexError,
} from '@/utils/swaperexErrorClassification';
import { getErrorPresentation } from '@/utils/swaperexErrorPresentation';

export {
  normalizeSwaperexError,
  normalizeSwaperexErrorFromMessage,
  normalizeJournalUncertainty,
} from '@/utils/swaperexErrorClassification';
export {
  getErrorPresentation,
  getErrorPresentationFromMessage,
  getJournalStatusPresentation,
  getPermittedErrorActions,
  isActionPermitted,
  presentErrorCategoryLabel,
} from '@/utils/swaperexErrorPresentation';
export type {
  ErrorClassificationContext,
  ErrorPresentation,
  ErrorRecommendedAction,
  NormalizedSwaperexError,
  SwaperexErrorCategory,
  SwaperexErrorStage,
} from '@/types/swaperexErrors';

function normalizedToParsed(
  normalized: NormalizedSwaperexError,
  extras?: Partial<ParsedError>,
): ParsedError {
  const presentation = getErrorPresentation(normalized);
  return {
    category: toLegacyErrorCategory(normalized.category),
    message: normalized.userMessage,
    isRecoverable: normalized.retryability !== 'not_recommended',
    shouldShowRetry: presentation.canResubmit || presentation.canRetryQuote,
    technicalReason: normalized.technicalSummary,
    ...extras,
  };
}

// Error categories
export type ErrorCategory =
  | 'user_rejected'
  | 'insufficient_balance'
  | 'invalid_input'
  | 'network_error'
  | 'rpc_error'
  | 'quote_error'
  | 'transaction_error'
  | 'wallet_error'
  | 'wallet_sign_pending'
  | 'contract_error'
  | 'unknown';

/** Trust Wallet / injected providers when a second sign request is sent while one is still open (JSON-RPC -32002). */
export const WALLET_SIGN_REQUEST_PENDING_MESSAGE =
  'A wallet confirmation is already open in Trust Wallet. Complete or cancel it there, then try again.';

/**
 * True when the wallet rejected a new signing request because one is already in-flight (e.g. Trust Wallet
 * `PUBLIC_signTransaction already pending`, JSON-RPC code -32002).
 */
export function isWalletSignRequestPending(error: unknown): boolean {
  if (!error) return false;
  const err = error as { code?: number | string; message?: string; reason?: string };
  if (err.code === -32002 || err.code === '-32002') return true;
  const combined = `${err.message || ''} ${err.reason || ''}`.toLowerCase();
  return (
    combined.includes('already pending') ||
    combined.includes('public_signtransaction') ||
    combined.includes('signtransaction already pending')
  );
}

/** Machine-readable codes for quote classification (P4.1-A+ telemetry / UI). */
export type QuoteFailureReasonCode =
  | 'unsupported_commission_route'
  | 'commission_eth_native_v2_required'
  | 'commission_bsc_native_disabled'
  | 'commission_native_unsupported_chain'
  | 'commission_chain_no_wrapper'
  | 'commission_route_mode_required';

export interface ParsedError {
  category: ErrorCategory;
  message: string;
  isRecoverable: boolean;
  shouldShowRetry: boolean;
  /** Stable code for monitoring and conditional UI (optional). */
  reasonCode?: QuoteFailureReasonCode | string;
  /** Short operator/user hint (optional). */
  userAction?: string;
  /** Original or upstream message for diagnostics (optional; not for end-user display). */
  technicalReason?: string;
}

/** Attach structured commission-route failure for `parseQuoteError` (read by `swapErrorReasonCode`). */
export type CommissionRouteFailureCode = Exclude<
  QuoteFailureReasonCode,
  'commission_route_mode_required'
>;

/** Optional telemetry: which wrapper path was attempted when commission routing fails. */
export type CommissionQuoteAttemptMeta = {
  attemptedProvider: string;
  chainId: number;
  fromSymbol: string;
  toSymbol: string;
  fromAmount: string;
  fromTokenAddress?: string | null;
  toTokenAddress?: string | null;
  /** Raw revert / library message from the wrapper quote call (truncated by callers if huge). */
  rawWrapperMessage?: string;
};

export function attachCommissionRouteFailure(
  code: CommissionRouteFailureCode,
  technicalReason?: string,
  meta?: CommissionQuoteAttemptMeta,
): Error {
  const baseMessage =
    code === 'commission_eth_native_v2_required'
      ? 'ETH native swaps require Uniswap wrapper V2.'
      : 'Commission route unavailable for this pair.';
  const err = new Error(baseMessage);
  const ext = err as Error & {
    swapErrorReasonCode?: CommissionRouteFailureCode;
    technicalReason?: string;
    commissionQuoteAttempt?: CommissionQuoteAttemptMeta;
  };
  ext.swapErrorReasonCode = code;
  if (technicalReason) ext.technicalReason = technicalReason;
  if (meta) ext.commissionQuoteAttempt = meta;
  return err;
}

/**
 * Check if error is a user rejection (wallet cancel)
 */
export function isUserRejection(error: unknown): boolean {
  if (!error) return false;

  const err = error as { code?: number | string; message?: string };

  // EIP-1193 / MetaMask: user rejected request
  if (err.code === 4001) return true;
  if (err.code === 'ACTION_REJECTED') return true;

  // Do NOT treat -32603 (internal JSON-RPC error) as user rejection — it is often RPC/wallet noise.

  const message = err.message?.toLowerCase() || '';
  return (
    message.includes('user rejected') ||
    message.includes('user denied') ||
    message.includes('user cancelled') ||
    message.includes('rejected by user') ||
    message.includes('transaction was rejected')
  );
}

/**
 * Parse wallet connection errors
 */
export function parseWalletError(error: unknown): ParsedError {
  if (isUserRejection(error)) {
    return {
      category: 'user_rejected',
      message: 'Connection cancelled',
      isRecoverable: true,
      shouldShowRetry: true,
    };
  }

  const err = error as { code?: number; message?: string };
  const message = err.message?.toLowerCase() || '';

  // No wallet installed
  if (message.includes('no wallet') || message.includes('not installed') || message.includes('no ethereum')) {
    return {
      category: 'wallet_error',
      message: 'No wallet detected. Please install MetaMask.',
      isRecoverable: false,
      shouldShowRetry: false,
    };
  }

  // Network error
  if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
    return {
      category: 'network_error',
      message: 'Failed to connect to wallet provider. Check your internet connection and try again.',
      isRecoverable: true,
      shouldShowRetry: true,
    };
  }

  // Chain not added
  if (err.code === 4902) {
    return {
      category: 'wallet_error',
      message: 'Please add this network to your wallet first.',
      isRecoverable: true,
      shouldShowRetry: true,
    };
  }

  return {
    category: 'unknown',
    message: err.message || 'Wallet connection failed. Please unlock your wallet and try again.',
    isRecoverable: true,
    shouldShowRetry: true,
  };
}

/**
 * Parse transaction errors (swap, approval, withdrawal)
 */
export function parseTransactionError(
  error: unknown,
  context?: ErrorClassificationContext,
): ParsedError {
  return normalizedToParsed(
    normalizeSwaperexError(error, {
      stage: context?.stage ?? 'swap-submit',
      broadcastKnown: context?.broadcastKnown ?? Boolean(context?.transactionHash),
      ...context,
    }),
  );
}

/**
 * Parse quote/API errors
 *
 * Maps low-level failures to short, actionable copy (logic upstream unchanged).
 */
export function parseQuoteError(
  error: unknown,
  context?: ErrorClassificationContext,
): ParsedError {
  const err = error as {
    message?: string;
    response?: { data?: { error?: string } };
    swapErrorReasonCode?: QuoteFailureReasonCode | string;
    technicalReason?: string;
  };
  const raw = (err.message || err.response?.data?.error || '').trim();
  const normalized = normalizeSwaperexError(error, {
    stage: 'quote',
    quoteExpired: raw === 'QUOTE_EXPIRED' || raw.toLowerCase().includes('quote expired'),
    ...context,
  });

  const commissionActions: Partial<Record<string, string>> = {
    unsupported_commission_route:
      'Swaperex only enables pairs that can route through its commission wrapper. Try ETH ⇄ USDC, ETH ⇄ USDT, WETH ⇄ USDC, or WETH ⇄ USDT.',
    commission_eth_native_v2_required:
      'Use WETH instead of ETH, or ask the operator to enable wrapper V2 native quote settings.',
    commission_bsc_native_disabled:
      'Use WBNB or an ERC‑20 pair, or ask the operator to enable Pancake wrapper V2 native settings.',
    commission_native_unsupported_chain:
      'Switch to Ethereum or BNB Chain, or use wrapped native tokens.',
    commission_chain_no_wrapper: 'Switch to Ethereum (chain 1) or BNB Chain (chain 56).',
  };

  const sr = err.swapErrorReasonCode;
  return normalizedToParsed(normalized, {
    reasonCode: sr,
    userAction: sr ? commissionActions[sr] : undefined,
    technicalReason: err.technicalReason || raw || normalized.technicalSummary,
    shouldShowRetry:
      sr === 'unsupported_commission_route'
        ? false
        : getErrorPresentation(normalized).canRetryQuote,
  });
}

/**
 * Format insufficient balance error
 */
export function formatBalanceError(
  asset: string,
  required: string,
  available: string
): string {
  return `Insufficient ${asset}. Need ${required}, have ${available}.`;
}

/**
 * Format address validation error
 */
export function formatAddressError(error: 'invalid' | 'same_address' | 'empty'): string {
  switch (error) {
    case 'invalid':
      return 'Invalid address format (must start with 0x)';
    case 'same_address':
      return 'Cannot send to your own address';
    case 'empty':
      return 'Please enter a destination address';
    default:
      return 'Invalid address';
  }
}

/**
 * Get user-friendly message for rejection
 */
export function getRejectionMessage(action: 'connect' | 'approve' | 'swap' | 'withdraw'): string {
  switch (action) {
    case 'connect':
      return 'Connection cancelled';
    case 'approve':
      return 'Approval cancelled in your wallet. No funds were moved.';
    case 'swap':
      return 'Transaction cancelled in your wallet. No funds were moved.';
    case 'withdraw':
      return 'Withdrawal cancelled in your wallet. No funds were moved.';
    default:
      return 'Transaction cancelled in your wallet. No funds were moved.';
  }
}

/**
 * Parse RPC/Provider errors
 * Common errors from ethers.js and JSON-RPC
 */
export function parseRpcError(
  error: unknown,
  context?: ErrorClassificationContext,
): ParsedError {
  const err = error as { code?: number | string; message?: string };
  const normalized = normalizeSwaperexError(error, {
    stage: context?.stage ?? 'reconciliation',
    broadcastKnown: context?.broadcastKnown ?? Boolean(context?.transactionHash),
    ...context,
  });

  if (
    normalized.category === 'rpc_unavailable' ||
    normalized.category === 'rpc_timeout' ||
    normalized.category === 'unknown_error'
  ) {
    console.error('[RPC Error]', {
      code: err.code,
      category: normalized.category,
      message: err.message?.slice(0, 120),
    });
  }

  return normalizedToParsed(normalized);
}

/**
 * Parse errors during swap execution (1inch /swap build, approval, wallet sign, broadcast).
 *
 * Order matters: 1inch API + fetch wrapper errors must not lose context to generic RPC "failed to fetch"
 * messages. `executeSwap` previously preferred `parseRpcError` whenever it was not `unknown`, which
 * replaced e.g. `1inch: Network error: Failed to fetch` with a generic cannot-connect string.
 */
export function parseSwapExecutionError(
  error: unknown,
  context?: ErrorClassificationContext,
): ParsedError {
  const stage = context?.stage ?? 'swap-submit';
  const broadcastKnown = context?.broadcastKnown ?? Boolean(context?.transactionHash);

  if (isUserRejection(error)) {
    return parseTransactionError(error, { ...context, stage, broadcastKnown });
  }

  if (isWalletSignRequestPending(error)) {
    return parseTransactionError(error, { ...context, stage, broadcastKnown });
  }

  const raw = (getErrorMessage(error, '') || '').trim();
  if (raw.toLowerCase().includes('1inch:')) {
    return parseQuoteError(error, context);
  }

  const rpcParsed = parseRpcError(error, { ...context, stage, broadcastKnown });
  if (rpcParsed.category !== 'unknown') {
    return rpcParsed;
  }
  return parseTransactionError(error, { ...context, stage, broadcastKnown });
}

/**
 * Log error with full context (NO silent failures)
 */
export function logError(context: string, error: unknown): void {
  const err = error as { code?: number; message?: string; stack?: string; reason?: string };
  console.error(`[${context}] Error:`, {
    message: err.message,
    code: err.code,
    reason: err.reason,
    stack: err.stack,
    raw: error,
  });
}

/**
 * Check if error is recoverable (user can retry)
 */
export function isRecoverableError(error: unknown): boolean {
  if (isUserRejection(error)) return true;

  const parsed = parseTransactionError(error);
  return parsed.isRecoverable;
}

/**
 * Get error for display (never empty string)
 */
export function getErrorMessage(error: unknown, fallback = 'An error occurred'): string {
  if (!error) return fallback;

  const err = error as { message?: string; reason?: string };
  return err.message || err.reason || fallback;
}

export default {
  isUserRejection,
  isWalletSignRequestPending,
  WALLET_SIGN_REQUEST_PENDING_MESSAGE,
  parseWalletError,
  parseTransactionError,
  parseQuoteError,
  parseRpcError,
  parseSwapExecutionError,
  formatBalanceError,
  formatAddressError,
  getRejectionMessage,
  logError,
  isRecoverableError,
  getErrorMessage,
};
