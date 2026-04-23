/**
 * Formatting utilities
 */

import { getExplorerTxUrl, getChainById } from '@/config/chains';

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
 * Uses chain config as single source of truth
 */
export function getExplorerUrl(
  chainId: number,
  txHash: string
): string {
  return getExplorerTxUrl(chainId, txHash) || `https://etherscan.io/tx/${txHash}`;
}

/**
 * Parse a decimal string safely
 */
export function parseDecimal(value: string): number {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Format estimated gas limit (gas units from quote simulation) for display.
 */
export function formatGasLimitUnits(gasEstimate: string | undefined | null): string | null {
  if (gasEstimate == null || String(gasEstimate).trim() === '') return null;
  const n = Math.floor(Number(String(gasEstimate).replace(/,/g, '')));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toLocaleString('en-US');
}

export type PriceImpactSeverity =
  | 'negligible'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical'
  | 'unavailable';

/**
 * Stored on `SwapQuote.price_impact` when the venue does not provide a trustworthy % (e.g. direct Uniswap V3 quote without pool-based impact math).
 * Not a user-facing string; UI maps via {@link getPriceImpactUi}.
 */
export const PRICE_IMPACT_NOT_ESTIMATED = '__NOT_ESTIMATED__';

/**
 * Parse a quoted price-impact field for numeric thresholds (high-impact banners, guards).
 * Returns NaN when the value is missing or explicitly not estimated.
 */
export function parsePriceImpactPercentOrNaN(priceImpact: string | undefined | null): number {
  const raw = String(priceImpact ?? '').replace(/%/g, '').trim();
  if (raw === '' || raw === PRICE_IMPACT_NOT_ESTIMATED) return NaN;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Short label for aggregator execution providers (swap card / preview).
 * Normalizes common slug variants; unknown strings pass through.
 */
export function swapAggregatorProviderLabel(provider: string): string {
  if (!provider) return '—';
  const key = provider.toLowerCase().replace(/-/g, '_');
  switch (key) {
    case '1inch':
    case 'oneinch':
      return '1inch';
    case 'uniswap_v3':
    case 'uniswap':
      return 'Uniswap';
    case 'uniswap_v3_wrapper':
      return 'Uniswap V3 (Swaperex wrapper)';
    case 'pancakeswap_v3':
    case 'pancakeswap':
      return 'PancakeSwap';
    default:
      return provider;
  }
}

export function getPriceImpactUi(priceImpact: string | undefined | null): {
  label: string;
  severity: PriceImpactSeverity;
} {
  const raw = String(priceImpact ?? '0').replace(/%/g, '').trim();
  if (raw === PRICE_IMPACT_NOT_ESTIMATED) {
    return {
      label: 'Not estimated',
      severity: 'unavailable',
    };
  }
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return { label: 'Negligible', severity: 'negligible' };
  }
  if (n < 0.01) {
    return { label: '<0.01%', severity: 'negligible' };
  }
  if (n <= 1) {
    return { label: `${n.toFixed(2)}%`, severity: 'low' };
  }
  if (n <= 3) {
    return { label: `${n.toFixed(2)}%`, severity: 'medium' };
  }
  if (n <= 10) {
    return { label: `${n.toFixed(2)}%`, severity: 'high' };
  }
  return { label: `${n.toFixed(2)}%`, severity: 'critical' };
}

/**
 * Get chain name from chain ID - uses chain config as single source of truth
 */
export function getChainName(chainId: number): string {
  return getChainById(chainId)?.name || `Chain ${chainId}`;
}

/**
 * Get chain icon path from chain ID
 */
export function getChainIcon(chainId: number): string {
  const chainIcons: Record<number, string> = {
    1: '/assets/chains/ethereum.svg',
    56: '/assets/chains/bnb.svg',
    137: '/assets/chains/polygon.svg',
    42161: '/assets/chains/arbitrum.svg',
    10: '/assets/chains/optimism.svg',
    43114: '/assets/chains/avalanche.svg',
    100: '/assets/chains/gnosis.svg',
    250: '/assets/chains/fantom.svg',
    8453: '/assets/chains/base.svg',
  };
  return chainIcons[chainId] || '/assets/chains/default.svg';
}
