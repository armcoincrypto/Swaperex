/**
 * Portfolio Types
 *
 * PHASE 13: Type definitions for portfolio tracking.
 * Supports multi-chain balances (EVM + Solana).
 */

/**
 * Supported portfolio chains
 */
export type PortfolioChain =
  | 'ethereum'
  | 'bsc'
  | 'polygon'
  | 'arbitrum'
  | 'solana';

/**
 * Chain ID mapping
 */
export const PORTFOLIO_CHAIN_IDS: Record<PortfolioChain, number | string> = {
  ethereum: 1,
  bsc: 56,
  polygon: 137,
  arbitrum: 42161,
  solana: 'solana', // Non-EVM
};

/**
 * Individual token balance
 */
export interface TokenBalance {
  symbol: string;
  name: string;
  address: string;             // Contract address (EVM) or mint (Solana)
  decimals: number;
  balance: string;             // Raw balance (wei/lamports)
  balanceFormatted: string;    // Human readable
  usdValue: string | null;     // USD value (may be null if price unavailable)
  usdPrice: string | null;     // Price per token
  logoUrl?: string;
  isNative: boolean;
  chain: PortfolioChain;
}

/**
 * Chain balance summary
 */
export interface ChainBalance {
  chain: PortfolioChain;
  chainId: number | string;
  nativeBalance: TokenBalance;
  tokenBalances: TokenBalance[];
  totalUsdValue: string;
  lastUpdated: number;
  error?: string;
}

/**
 * Full portfolio state
 */
export interface Portfolio {
  address: string;
  addressType: 'evm' | 'solana';
  chains: Record<PortfolioChain, ChainBalance | null>;
  totalUsdValue: string;
  lastUpdated: number;
}

/**
 * Portfolio fetch status
 */
export type PortfolioStatus =
  | 'idle'
  | 'fetching'
  | 'success'
  | 'error';

/**
 * Portfolio state for hook
 */
export interface PortfolioState {
  status: PortfolioStatus;
  portfolio: Portfolio | null;
  error: string | null;
}

/**
 * Transaction record for history
 */
export interface TransactionRecord {
  hash: string;                // Tx hash (EVM) or signature (Solana)
  chain: PortfolioChain;
  type: 'swap' | 'transfer' | 'approval' | 'unknown';
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: number;
  from: string;
  to: string;
  value: string;
  valueFormatted: string;
  tokenSymbol?: string;
  usdValue?: string;
  gasUsed?: string;
  gasCost?: string;
  explorerUrl: string;
}

/**
 * Transaction history state
 */
export interface TxHistoryState {
  status: 'idle' | 'fetching' | 'success' | 'error';
  transactions: TransactionRecord[];
  error: string | null;
  errorDetails?: {
    category: string;
    message: string;
    retryable: boolean;
    chain?: string;
  } | null;
  hasMore: boolean;
  cursor?: string;
}

/**
 * Price data
 */
export interface TokenPrice {
  symbol: string;
  usdPrice: string;
  change24h?: string;
  lastUpdated: number;
}

/**
 * Log portfolio lifecycle
 */
export function logPortfolioLifecycle(
  action: string,
  details?: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString();
  console.log(`[Portfolio] ${timestamp} | ${action}`, details || '');
}

/**
 * Log tx history lifecycle
 */
export function logTxHistoryLifecycle(
  action: string,
  details?: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString();
  console.log(`[TxHistory] ${timestamp} | ${action}`, details || '');
}

/**
 * Format balance for display
 */
export function formatBalance(
  balance: string | bigint,
  decimals: number,
  maxDecimals: number = 6
): string {
  const value = typeof balance === 'string' ? BigInt(balance) : balance;
  const divisor = BigInt(10 ** decimals);
  const whole = value / divisor;
  const fraction = value % divisor;

  const fractionStr = fraction.toString().padStart(decimals, '0');
  const trimmed = fractionStr.slice(0, maxDecimals).replace(/0+$/, '') || '0';

  if (trimmed === '0' && whole === 0n) {
    return '0';
  }

  return `${whole}.${trimmed}`;
}

/**
 * Format USD value
 */
export function formatUsdValue(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '$0.00';

  if (num >= 1000000) {
    return `$${(num / 1000000).toFixed(2)}M`;
  }
  if (num >= 1000) {
    return `$${(num / 1000).toFixed(2)}K`;
  }
  return `$${num.toFixed(2)}`;
}

export default Portfolio;
