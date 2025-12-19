/**
 * Formatting utilities
 */

/**
 * Shorten an Ethereum address
 */
export function shortenAddress(address: string, chars: number = 4): string {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Format a token balance
 */
export function formatBalance(
  balance: string | number,
  decimals: number = 4
): string {
  const num = typeof balance === 'string' ? parseFloat(balance) : balance;

  if (isNaN(num)) return '0';
  if (num === 0) return '0';
  if (num < 0.0001) return '<0.0001';

  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format USD value
 */
export function formatUsd(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(num)) return '$0.00';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Format percentage
 */
export function formatPercent(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(num)) return '0%';

  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
}

/**
 * Format transaction hash
 */
export function formatTxHash(hash: string, chars: number = 8): string {
  if (!hash) return '';
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`;
}

/**
 * Get explorer URL for a transaction
 */
export function getExplorerUrl(
  chainId: number,
  txHash: string
): string {
  const explorers: Record<number, string> = {
    1: 'https://etherscan.io',
    56: 'https://bscscan.com',
    137: 'https://polygonscan.com',
    42161: 'https://arbiscan.io',
    10: 'https://optimistic.etherscan.io',
    43114: 'https://snowtrace.io',
  };

  const baseUrl = explorers[chainId] || 'https://etherscan.io';
  return `${baseUrl}/tx/${txHash}`;
}

/**
 * Parse a decimal string safely
 */
export function parseDecimal(value: string): number {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}
