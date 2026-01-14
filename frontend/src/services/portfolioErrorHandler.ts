/**
 * Portfolio Error Handling
 *
 * PHASE 13: Comprehensive error handling for portfolio operations.
 * Includes retry logic, error categorization, and clear error messages.
 */

import { logPortfolioLifecycle, logTxHistoryLifecycle } from './portfolioTypes';

/**
 * Error categories for portfolio operations
 */
export type PortfolioErrorCategory =
  | 'network'           // Network timeout, connection refused
  | 'rpc'               // RPC-specific errors
  | 'rate_limit'        // API rate limiting
  | 'invalid_address'   // Invalid wallet address
  | 'unsupported_chain' // Chain not supported
  | 'no_wallet'         // Wallet not connected
  | 'parse_error'       // Failed to parse response
  | 'unknown';          // Uncategorized errors

/**
 * Structured portfolio error
 */
export interface PortfolioError {
  category: PortfolioErrorCategory;
  message: string;
  details?: string;
  retryable: boolean;
  chain?: string;
}

/**
 * Supported chains for portfolio
 */
export const SUPPORTED_PORTFOLIO_CHAINS = ['ethereum', 'bsc', 'polygon', 'arbitrum', 'solana'] as const;

/**
 * Check if chain is supported
 */
export function isChainSupported(chain: string): boolean {
  return SUPPORTED_PORTFOLIO_CHAINS.includes(chain as typeof SUPPORTED_PORTFOLIO_CHAINS[number]);
}

/**
 * Categorize error and create structured error
 */
export function categorizeError(error: unknown, chain?: string): PortfolioError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStr = errorMessage.toLowerCase();

  // Network errors
  if (
    errorStr.includes('network') ||
    errorStr.includes('timeout') ||
    errorStr.includes('econnrefused') ||
    errorStr.includes('fetch failed') ||
    errorStr.includes('failed to fetch')
  ) {
    return {
      category: 'network',
      message: 'Network connection failed. Please check your internet connection.',
      details: errorMessage,
      retryable: true,
      chain,
    };
  }

  // Rate limiting
  if (
    errorStr.includes('rate limit') ||
    errorStr.includes('429') ||
    errorStr.includes('too many requests')
  ) {
    return {
      category: 'rate_limit',
      message: 'API rate limit reached. Please wait a moment and try again.',
      details: errorMessage,
      retryable: true,
      chain,
    };
  }

  // RPC errors
  if (
    errorStr.includes('rpc') ||
    errorStr.includes('jsonrpc') ||
    errorStr.includes('provider') ||
    errorStr.includes('execution reverted')
  ) {
    return {
      category: 'rpc',
      message: `RPC error on ${chain || 'chain'}. The node may be temporarily unavailable.`,
      details: errorMessage,
      retryable: true,
      chain,
    };
  }

  // Invalid address
  if (
    errorStr.includes('invalid address') ||
    errorStr.includes('invalid public key') ||
    errorStr.includes('invalid wallet')
  ) {
    return {
      category: 'invalid_address',
      message: 'Invalid wallet address format.',
      details: errorMessage,
      retryable: false,
      chain,
    };
  }

  // Unsupported chain
  if (
    errorStr.includes('unsupported chain') ||
    errorStr.includes('chain not supported') ||
    errorStr.includes('unknown chain')
  ) {
    return {
      category: 'unsupported_chain',
      message: `Chain "${chain || 'unknown'}" is not supported.`,
      details: errorMessage,
      retryable: false,
      chain,
    };
  }

  // Parse errors
  if (
    errorStr.includes('parse') ||
    errorStr.includes('json') ||
    errorStr.includes('unexpected token')
  ) {
    return {
      category: 'parse_error',
      message: 'Failed to parse response data.',
      details: errorMessage,
      retryable: true,
      chain,
    };
  }

  // Unknown error
  return {
    category: 'unknown',
    message: errorMessage || 'An unexpected error occurred.',
    details: errorMessage,
    retryable: true,
    chain,
  };
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Calculate delay for retry attempt
 */
function calculateRetryDelay(attempt: number, config: RetryConfig): number {
  const delay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
  return Math.min(delay, config.maxDelayMs);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  context: { operation: string; chain?: string } = { operation: 'unknown' }
): Promise<T> {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: PortfolioError | null = null;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = categorizeError(error, context.chain);

      // Log retry attempt
      logPortfolioLifecycle('Retry attempt', {
        operation: context.operation,
        chain: context.chain,
        attempt: attempt + 1,
        maxRetries: retryConfig.maxRetries,
        error: lastError.message,
        category: lastError.category,
      });

      // Don't retry non-retryable errors
      if (!lastError.retryable) {
        break;
      }

      // Don't retry on last attempt
      if (attempt < retryConfig.maxRetries) {
        const delay = calculateRetryDelay(attempt, retryConfig);
        logPortfolioLifecycle('Waiting before retry', { delayMs: delay });
        await sleep(delay);
      }
    }
  }

  // Throw the last error
  throw lastError || new Error('Unknown error');
}

/**
 * Validate wallet address
 */
export function validateWalletAddress(
  address: string | null | undefined,
  source: 'portfolio' | 'txHistory'
): PortfolioError | null {
  if (!address) {
    const error: PortfolioError = {
      category: 'no_wallet',
      message: 'Please connect your wallet first.',
      retryable: false,
    };

    if (source === 'portfolio') {
      logPortfolioLifecycle('Validation failed', { error: error.message });
    } else {
      logTxHistoryLifecycle('Validation failed', { error: error.message });
    }

    return error;
  }

  if (address.length < 10) {
    const error: PortfolioError = {
      category: 'invalid_address',
      message: 'Invalid wallet address format.',
      retryable: false,
    };

    if (source === 'portfolio') {
      logPortfolioLifecycle('Validation failed', { error: error.message, address: address.slice(0, 10) });
    } else {
      logTxHistoryLifecycle('Validation failed', { error: error.message, address: address.slice(0, 10) });
    }

    return error;
  }

  return null;
}

/**
 * Validate chain is supported
 */
export function validateChain(
  chain: string,
  source: 'portfolio' | 'txHistory'
): PortfolioError | null {
  if (!isChainSupported(chain)) {
    const error: PortfolioError = {
      category: 'unsupported_chain',
      message: `Chain "${chain}" is not supported. Supported chains: ${SUPPORTED_PORTFOLIO_CHAINS.join(', ')}`,
      retryable: false,
      chain,
    };

    if (source === 'portfolio') {
      logPortfolioLifecycle('Unsupported chain', { chain, supported: [...SUPPORTED_PORTFOLIO_CHAINS] });
    } else {
      logTxHistoryLifecycle('Unsupported chain', { chain, supported: [...SUPPORTED_PORTFOLIO_CHAINS] });
    }

    return error;
  }

  return null;
}

/**
 * Format error for user display
 */
export function formatErrorForDisplay(error: PortfolioError): string {
  switch (error.category) {
    case 'network':
      return 'Connection failed. Check your internet and try again.';
    case 'rate_limit':
      return 'Too many requests. Please wait a moment.';
    case 'rpc':
      return `${error.chain || 'Chain'} node is temporarily unavailable.`;
    case 'invalid_address':
      return 'Invalid wallet address.';
    case 'unsupported_chain':
      return error.message;
    case 'no_wallet':
      return 'Connect your wallet to view portfolio.';
    case 'parse_error':
      return 'Failed to load data. Please try again.';
    default:
      return error.message || 'Something went wrong.';
  }
}

export default {
  categorizeError,
  withRetry,
  validateWalletAddress,
  validateChain,
  isChainSupported,
  formatErrorForDisplay,
};
