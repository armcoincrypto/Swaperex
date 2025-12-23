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
  | 'contract_error'
  | 'unknown';

export interface ParsedError {
  category: ErrorCategory;
  message: string;
  isRecoverable: boolean;
  shouldShowRetry: boolean;
}

/**
 * Check if error is a user rejection (wallet cancel)
 */
export function isUserRejection(error: unknown): boolean {
  if (!error) return false;

  const err = error as { code?: number; message?: string };

  // MetaMask rejection codes
  if (err.code === 4001) return true;
  if (err.code === -32603) return true;

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
export function parseTransactionError(error: unknown): ParsedError {
  if (isUserRejection(error)) {
    return {
      category: 'user_rejected',
      message: 'Transaction cancelled. No changes were made.',
      isRecoverable: true,
      shouldShowRetry: true,
    };
  }

  const err = error as { code?: number; message?: string; reason?: string };
  const message = (err.message || err.reason || '').toLowerCase();

  // Insufficient funds
  if (message.includes('insufficient funds') || message.includes('insufficient balance')) {
    return {
      category: 'insufficient_balance',
      message: 'Insufficient balance to complete this swap. Check your wallet balance and try a smaller amount.',
      isRecoverable: false,
      shouldShowRetry: false,
    };
  }

  // Gas estimation failed
  if (message.includes('gas') && (message.includes('failed') || message.includes('required'))) {
    return {
      category: 'transaction_error',
      message: 'Insufficient funds for transaction fees. Add more ETH/BNB to cover gas costs.',
      isRecoverable: false,
      shouldShowRetry: false,
    };
  }

  // Slippage too high
  if (message.includes('slippage') || message.includes('price movement')) {
    return {
      category: 'transaction_error',
      message: 'Swap failed: price moved beyond your slippage tolerance. Increase slippage in settings or try a smaller amount.',
      isRecoverable: true,
      shouldShowRetry: true,
    };
  }

  // Transaction reverted
  if (message.includes('reverted') || message.includes('revert')) {
    return {
      category: 'transaction_error',
      message: 'Transaction reverted by the smart contract. This often happens when price moves too fast. Try increasing slippage or reducing the swap amount.',
      isRecoverable: true,
      shouldShowRetry: true,
    };
  }

  // Nonce error
  if (message.includes('nonce')) {
    return {
      category: 'transaction_error',
      message: 'Transaction sequence conflict. You may have a pending transaction. Wait a moment and try again.',
      isRecoverable: true,
      shouldShowRetry: true,
    };
  }

  // Network error
  if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
    return {
      category: 'network_error',
      message: 'Network connection lost. Check your internet connection and try again.',
      isRecoverable: true,
      shouldShowRetry: true,
    };
  }

  return {
    category: 'unknown',
    message: err.message || 'Transaction could not be completed. Please try again or contact support if the issue persists.',
    isRecoverable: true,
    shouldShowRetry: true,
  };
}

/**
 * Parse quote/API errors
 */
export function parseQuoteError(error: unknown): ParsedError {
  const err = error as { message?: string; response?: { data?: { error?: string } } };
  const message = (err.message || err.response?.data?.error || '').toLowerCase();

  // Quote expired
  if (message.includes('expired') || message.includes('stale')) {
    return {
      category: 'quote_error',
      message: "Quote expired (over 30 seconds old). Click 'Refresh Quote' to get current price.",
      isRecoverable: true,
      shouldShowRetry: true,
    };
  }

  // No route found
  if (message.includes('no route') || message.includes('no liquidity')) {
    return {
      category: 'quote_error',
      message: 'No swap route available for this token pair. The token may have insufficient liquidity or is not supported.',
      isRecoverable: false,
      shouldShowRetry: false,
    };
  }

  // Amount too low
  if (message.includes('minimum') || message.includes('too small')) {
    return {
      category: 'quote_error',
      message: 'Swap amount too small. Please enter a larger amount to cover minimum trade requirements.',
      isRecoverable: false,
      shouldShowRetry: false,
    };
  }

  // Network error
  if (message.includes('network') || message.includes('fetch')) {
    return {
      category: 'network_error',
      message: 'Failed to fetch quote from the aggregator. Check your connection and try again.',
      isRecoverable: true,
      shouldShowRetry: true,
    };
  }

  return {
    category: 'quote_error',
    message: 'Quote request failed. The pricing service is temporarily unavailable. Please try again in a few seconds.',
    isRecoverable: true,
    shouldShowRetry: true,
  };
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
      return 'Approval cancelled. No changes were made.';
    case 'swap':
      return 'Swap cancelled. No changes were made.';
    case 'withdraw':
      return 'Withdrawal cancelled. No changes were made.';
    default:
      return 'Transaction cancelled. No changes were made.';
  }
}

/**
 * Parse RPC/Provider errors
 * Common errors from ethers.js and JSON-RPC
 */
export function parseRpcError(error: unknown): ParsedError {
  const err = error as { code?: number | string; message?: string; reason?: string; data?: unknown };
  const message = (err.message || err.reason || '').toLowerCase();
  const code = err.code;

  // Log all RPC errors for debugging (NO silent failures)
  console.error('[RPC Error]', {
    code,
    message: err.message,
    reason: err.reason,
    data: err.data,
  });

  // User rejection (code 4001 or ACTION_REJECTED)
  if (code === 4001 || code === 'ACTION_REJECTED' || isUserRejection(error)) {
    return {
      category: 'user_rejected',
      message: 'Transaction rejected in wallet. No funds were moved.',
      isRecoverable: true,
      shouldShowRetry: true,
    };
  }

  // Insufficient funds (code -32000 often)
  if (code === -32000 || message.includes('insufficient funds')) {
    return {
      category: 'insufficient_balance',
      message: 'Insufficient funds for transaction fees. Add more ETH/BNB to your wallet to cover gas costs.',
      isRecoverable: false,
      shouldShowRetry: false,
    };
  }

  // RPC rate limit
  if (code === 429 || message.includes('rate limit') || message.includes('too many requests')) {
    return {
      category: 'rpc_error',
      message: 'Too many requests. Please wait and try again.',
      isRecoverable: true,
      shouldShowRetry: true,
    };
  }

  // RPC timeout
  if (message.includes('timeout') || message.includes('timed out')) {
    return {
      category: 'rpc_error',
      message: 'Request timed out. Network may be congested.',
      isRecoverable: true,
      shouldShowRetry: true,
    };
  }

  // RPC connection error
  if (message.includes('failed to fetch') || message.includes('network error') || message.includes('econnrefused')) {
    return {
      category: 'rpc_error',
      message: 'Cannot connect to network. Check your connection.',
      isRecoverable: true,
      shouldShowRetry: true,
    };
  }

  // Contract execution reverted
  if (message.includes('execution reverted') || message.includes('revert')) {
    // Try to extract revert reason
    let revertReason = 'Transaction would fail on-chain. The token or pool may have restrictions.';
    if (message.includes('stf')) {
      revertReason = 'Swap failed: price moved beyond your slippage tolerance. Increase slippage or try a smaller amount.';
    } else if (message.includes('too little received') || message.includes('insufficient output')) {
      revertReason = 'Output amount too low due to price movement. Increase your slippage tolerance and try again.';
    } else if (message.includes('expired') || message.includes('deadline')) {
      revertReason = 'Transaction deadline passed. Please get a fresh quote and try again.';
    }

    return {
      category: 'contract_error',
      message: revertReason,
      isRecoverable: true,
      shouldShowRetry: true,
    };
  }

  // Generic RPC error
  if (code === -32603 || code === -32602 || code === -32601) {
    return {
      category: 'rpc_error',
      message: 'Blockchain node error. The network may be congested. Please wait a moment and try again.',
      isRecoverable: true,
      shouldShowRetry: true,
    };
  }

  return {
    category: 'unknown',
    message: err.message || 'An unexpected error occurred. Please try again or contact support if the issue persists.',
    isRecoverable: true,
    shouldShowRetry: true,
  };
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
  parseWalletError,
  parseTransactionError,
  parseQuoteError,
  parseRpcError,
  formatBalanceError,
  formatAddressError,
  getRejectionMessage,
  logError,
  isRecoverableError,
  getErrorMessage,
};
