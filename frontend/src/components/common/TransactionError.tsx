/**
 * Transaction Error Component
 *
 * Displays user-friendly error messages for transaction failures.
 */

import { Button } from './Button';
import { normalizeSwaperexError } from '@/utils/swaperexErrorClassification';

export type TransactionErrorType =
  | 'user_rejected'
  | 'insufficient_balance'
  | 'network_error'
  | 'quote_expired'
  | 'slippage_too_low'
  | 'chain_mismatch'
  | 'contract_error'
  | 'gas_too_low'
  | 'unknown';

interface TransactionErrorProps {
  type: TransactionErrorType;
  message?: string;
  onRetry?: () => void;
  onDismiss: () => void;
}

const errorConfig: Record<
  TransactionErrorType,
  { title: string; message: string; canRetry: boolean }
> = {
  user_rejected: {
    title: 'Transaction Cancelled',
    message: 'You cancelled the transaction in your wallet.',
    canRetry: true,
  },
  insufficient_balance: {
    title: 'Insufficient Balance',
    message: 'You don\'t have enough tokens to complete this transaction.',
    canRetry: false,
  },
  network_error: {
    title: 'Network Error',
    message: 'Unable to connect. Please check your internet connection.',
    canRetry: true,
  },
  quote_expired: {
    title: 'Quote Expired',
    message: 'The quote has expired. Please get a new quote.',
    canRetry: true,
  },
  slippage_too_low: {
    title: 'Slippage Too Low',
    message: 'Transaction may fail due to price movement. Try increasing slippage.',
    canRetry: true,
  },
  chain_mismatch: {
    title: 'Wrong Network',
    message: 'Please switch to the correct network in your wallet.',
    canRetry: true,
  },
  contract_error: {
    title: 'Transaction Would Fail',
    message: 'The transaction would fail if submitted. Please try again.',
    canRetry: true,
  },
  gas_too_low: {
    title: 'Gas Too Low',
    message: 'Transaction may fail due to insufficient gas. Please try again.',
    canRetry: true,
  },
  unknown: {
    title: 'Request could not be completed',
    message: 'An unexpected error occurred. Check your wallet and try again when ready.',
    canRetry: true,
  },
};

export function TransactionError({
  type,
  message,
  onRetry,
  onDismiss,
}: TransactionErrorProps) {
  const config = errorConfig[type] || errorConfig.unknown;
  const displayMessage = message || config.message;

  return (
    <div className="bg-red-900/20 border border-red-600 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <ErrorIcon />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-red-400">{config.title}</h4>
          <p className="mt-1 text-sm text-dark-300">{displayMessage}</p>
        </div>
        <button
          onClick={onDismiss}
          className="flex-shrink-0 p-1 text-dark-400 hover:text-white rounded transition-colors"
        >
          <CloseIcon />
        </button>
      </div>

      {config.canRetry && onRetry && (
        <div className="mt-3 flex gap-2">
          <Button variant="danger" size="sm" onClick={onRetry}>
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Parse error from wallet/network into legacy UI type (delegates to P17.6 classifier).
 */
export function parseTransactionError(error: unknown): TransactionErrorType {
  const normalized = normalizeSwaperexError(error, { stage: 'swap-submit' });

  switch (normalized.category) {
    case 'user_rejected':
      return 'user_rejected';
    case 'insufficient_native_gas':
      return 'gas_too_low';
    case 'insufficient_token_balance':
    case 'allowance_insufficient':
      return 'insufficient_balance';
    case 'quote_expired':
      return 'quote_expired';
    case 'slippage_exceeded':
      return 'slippage_too_low';
    case 'wrong_network':
    case 'unsupported_chain':
      return 'chain_mismatch';
    case 'approval_reverted':
    case 'swap_reverted':
    case 'contract_revert':
      return 'contract_error';
    case 'rpc_timeout':
    case 'rpc_unavailable':
    case 'wallet_unavailable':
      return 'network_error';
    default:
      return 'unknown';
  }
}

// Icons
function ErrorIcon() {
  return (
    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export default TransactionError;
