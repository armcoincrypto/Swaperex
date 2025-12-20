/**
 * Error Handling Utilities
 *
 * Centralized error categorization and user-friendly messages.
 * Used across wallet, swap, and withdrawal flows.
 */

// Error categories
export type ErrorCategory =
  | 'user_rejected'
  | 'insufficient_balance'
  | 'invalid_input'
  | 'network_error'
  | 'quote_error'
  | 'transaction_error'
  | 'wallet_error'
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
      message: 'Network error. Please check your connection.',
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
    message: err.message || 'Connection failed. Please try again.',
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
      message: 'Insufficient balance for this transaction.',
      isRecoverable: false,
      shouldShowRetry: false,
    };
  }

  // Gas estimation failed
  if (message.includes('gas') && (message.includes('failed') || message.includes('required'))) {
    return {
      category: 'transaction_error',
      message: 'Insufficient gas. Please add more ETH for fees.',
      isRecoverable: false,
      shouldShowRetry: false,
    };
  }

  // Slippage too high
  if (message.includes('slippage') || message.includes('price movement')) {
    return {
      category: 'transaction_error',
      message: 'Price changed too much. Try increasing slippage.',
      isRecoverable: true,
      shouldShowRetry: true,
    };
  }

  // Transaction reverted
  if (message.includes('reverted') || message.includes('revert')) {
    return {
      category: 'transaction_error',
      message: 'Transaction failed. The contract rejected it.',
      isRecoverable: true,
      shouldShowRetry: true,
    };
  }

  // Nonce error
  if (message.includes('nonce')) {
    return {
      category: 'transaction_error',
      message: 'Transaction conflict. Please try again.',
      isRecoverable: true,
      shouldShowRetry: true,
    };
  }

  // Network error
  if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
    return {
      category: 'network_error',
      message: 'Network error. Please check your connection.',
      isRecoverable: true,
      shouldShowRetry: true,
    };
  }

  return {
    category: 'unknown',
    message: err.message || 'Transaction failed. Please try again.',
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
      message: 'Quote expired. Please refresh.',
      isRecoverable: true,
      shouldShowRetry: true,
    };
  }

  // No route found
  if (message.includes('no route') || message.includes('no liquidity')) {
    return {
      category: 'quote_error',
      message: 'No swap route found for this pair.',
      isRecoverable: false,
      shouldShowRetry: false,
    };
  }

  // Amount too low
  if (message.includes('minimum') || message.includes('too small')) {
    return {
      category: 'quote_error',
      message: 'Amount too small for this swap.',
      isRecoverable: false,
      shouldShowRetry: false,
    };
  }

  // Network error
  if (message.includes('network') || message.includes('fetch')) {
    return {
      category: 'network_error',
      message: 'Failed to fetch quote. Please try again.',
      isRecoverable: true,
      shouldShowRetry: true,
    };
  }

  return {
    category: 'quote_error',
    message: 'Failed to get quote. Please try again.',
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

export default {
  isUserRejection,
  parseWalletError,
  parseTransactionError,
  parseQuoteError,
  formatBalanceError,
  formatAddressError,
  getRejectionMessage,
};
