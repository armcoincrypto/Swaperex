/**
 * Observability Logger Service
 *
 * PHASE 14: Standardized logging for production readiness.
 *
 * Features:
 * - Consistent prefix for each module
 * - Timestamp on every log
 * - ChainId, provider, lifecycle state where applicable
 * - Console logs for DevTools debugging
 *
 * Prefixes:
 * - [Swap] - Swap execution flow
 * - [Aggregator] - Quote aggregation
 * - [Portfolio] - Portfolio fetching
 * - [TxHistory] - Transaction history
 * - [Wallet] - Wallet connection events
 * - [Error] - Error handling
 */

export type LogModule =
  | 'Swap'
  | 'Aggregator'
  | 'Portfolio'
  | 'TxHistory'
  | 'Wallet'
  | 'Error'
  | 'Network'
  | 'Balance';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogContext {
  chainId?: number | string;
  provider?: string;
  lifecycle?: string;
  address?: string;
  txHash?: string;
  [key: string]: unknown;
}

/**
 * Format timestamp for logs
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Format context for display
 */
function formatContext(context?: LogContext): string {
  if (!context || Object.keys(context).length === 0) {
    return '';
  }

  const parts: string[] = [];

  // Priority fields first
  if (context.lifecycle) parts.push(`state=${context.lifecycle}`);
  if (context.chainId) parts.push(`chain=${context.chainId}`);
  if (context.provider) parts.push(`provider=${context.provider}`);
  if (context.address) parts.push(`addr=${String(context.address).slice(0, 10)}...`);
  if (context.txHash) parts.push(`tx=${String(context.txHash).slice(0, 10)}...`);

  // Other fields
  Object.entries(context).forEach(([key, value]) => {
    if (['lifecycle', 'chainId', 'provider', 'address', 'txHash'].includes(key)) return;
    if (value === undefined || value === null) return;

    const formatted = typeof value === 'object' ? JSON.stringify(value) : String(value);
    parts.push(`${key}=${formatted}`);
  });

  return parts.length > 0 ? ` | ${parts.join(' | ')}` : '';
}

/**
 * Core logging function
 */
function log(
  level: LogLevel,
  module: LogModule,
  message: string,
  context?: LogContext
): void {
  const timestamp = getTimestamp();
  const prefix = `[${module}]`;
  const contextStr = formatContext(context);
  const fullMessage = `${prefix} ${timestamp} | ${message}${contextStr}`;

  switch (level) {
    case 'error':
      console.error(fullMessage, context?.error || '');
      break;
    case 'warn':
      console.warn(fullMessage);
      break;
    case 'debug':
      console.debug(fullMessage);
      break;
    default:
      console.log(fullMessage);
  }
}

/**
 * Module-specific loggers
 */
export const logger = {
  // Swap module
  swap: {
    info: (message: string, context?: LogContext) => log('info', 'Swap', message, context),
    warn: (message: string, context?: LogContext) => log('warn', 'Swap', message, context),
    error: (message: string, context?: LogContext) => log('error', 'Swap', message, context),
    debug: (message: string, context?: LogContext) => log('debug', 'Swap', message, context),
    lifecycle: (from: string | null, to: string, context?: LogContext) => {
      const transition = from ? `${from} → ${to}` : `→ ${to}`;
      log('info', 'Swap', `Lifecycle: ${transition}`, { ...context, lifecycle: to });
    },
  },

  // Aggregator module
  aggregator: {
    info: (message: string, context?: LogContext) => log('info', 'Aggregator', message, context),
    warn: (message: string, context?: LogContext) => log('warn', 'Aggregator', message, context),
    error: (message: string, context?: LogContext) => log('error', 'Aggregator', message, context),
    quote: (provider: string, amount: string, context?: LogContext) => {
      log('info', 'Aggregator', `Quote from ${provider}: ${amount}`, { ...context, provider });
    },
  },

  // Portfolio module
  portfolio: {
    info: (message: string, context?: LogContext) => log('info', 'Portfolio', message, context),
    warn: (message: string, context?: LogContext) => log('warn', 'Portfolio', message, context),
    error: (message: string, context?: LogContext) => log('error', 'Portfolio', message, context),
    lifecycle: (action: string, context?: LogContext) => {
      log('info', 'Portfolio', action, context);
    },
  },

  // Transaction History module
  txHistory: {
    info: (message: string, context?: LogContext) => log('info', 'TxHistory', message, context),
    warn: (message: string, context?: LogContext) => log('warn', 'TxHistory', message, context),
    error: (message: string, context?: LogContext) => log('error', 'TxHistory', message, context),
    lifecycle: (action: string, context?: LogContext) => {
      log('info', 'TxHistory', action, context);
    },
  },

  // Wallet module
  wallet: {
    info: (message: string, context?: LogContext) => log('info', 'Wallet', message, context),
    warn: (message: string, context?: LogContext) => log('warn', 'Wallet', message, context),
    error: (message: string, context?: LogContext) => log('error', 'Wallet', message, context),
    event: (eventType: string, context?: LogContext) => {
      log('info', 'Wallet', `Event: ${eventType}`, context);
    },
    connect: (address: string, chainId: number, context?: LogContext) => {
      log('info', 'Wallet', 'Connected', { ...context, address, chainId });
    },
    disconnect: (context?: LogContext) => {
      log('info', 'Wallet', 'Disconnected', context);
    },
  },

  // Error module
  error: {
    log: (source: string, error: unknown, context?: LogContext) => {
      const message = error instanceof Error ? error.message : String(error);
      log('error', 'Error', `[${source}] ${message}`, {
        ...context,
        error: error instanceof Error ? error.stack : undefined,
      });
    },
    validation: (source: string, errors: string[], context?: LogContext) => {
      log('warn', 'Error', `[${source}] Validation failed: ${errors.join(', ')}`, context);
    },
  },

  // Network module
  network: {
    info: (message: string, context?: LogContext) => log('info', 'Network', message, context),
    warn: (message: string, context?: LogContext) => log('warn', 'Network', message, context),
    error: (message: string, context?: LogContext) => log('error', 'Network', message, context),
    rpc: (action: string, chainId: number, context?: LogContext) => {
      log('info', 'Network', `RPC: ${action}`, { ...context, chainId });
    },
  },

  // Balance module
  balance: {
    info: (message: string, context?: LogContext) => log('info', 'Balance', message, context),
    warn: (message: string, context?: LogContext) => log('warn', 'Balance', message, context),
    error: (message: string, context?: LogContext) => log('error', 'Balance', message, context),
    fetch: (chain: string, context?: LogContext) => {
      log('info', 'Balance', `Fetching ${chain} balances`, context);
    },
  },
};

export default logger;
