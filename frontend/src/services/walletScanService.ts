/**
 * Wallet Scan Service
 *
 * Frontend service for wallet token scanning via backend API.
 */

// Backend API base URL
const API_BASE = import.meta.env.VITE_SIGNALS_API_URL || 'http://localhost:4001';

// Token discovered from wallet scan
export interface DiscoveredToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  balance: string;
  balanceFormatted: string;
  priceUsd?: number;
  valueUsd?: number;
  isSpam: boolean;
  spamReason?: string;
  hasPricing: boolean;
  logo?: string;
  percentChange24h?: number;
  lastActivityTs?: number;
}

// Native token balance
export interface NativeBalance {
  symbol: string;
  balance: string;
  balanceFormatted: string;
  priceUsd?: number;
  valueUsd?: number;
  decimals: number;
}

// Scan statistics
export interface ScanStats {
  durationMs: number;
  transfersScanned: number;
  tokensDiscovered: number;
  tokensPriced: number;
  tokensMissingPrice: number;
  tokensFiltered: number;
  spamFiltered: number;
}

// Computed insights
export interface ScanInsights {
  biggestPosition?: {
    token: DiscoveredToken;
    reason: string;
  };
  mostVolatile?: {
    token: DiscoveredToken;
    reason: string;
  };
  newTokens?: {
    tokens: DiscoveredToken[];
    count: number;
  };
  unpricedTokens?: {
    tokens: DiscoveredToken[];
    count: number;
    reason: string;
  };
  topFive: DiscoveredToken[];
  totalValueUsd: number;
  chainSuggestion?: string;
}

// Full scan response
export interface WalletScanResponse {
  provider: string;
  cached: boolean;
  warnings: string[];
  stats: ScanStats;
  tokens: DiscoveredToken[];
  nativeBalance: NativeBalance;
  insights?: ScanInsights;
  error?: string;
}

// Scan configuration
export interface ScanOptions {
  chainId: number;
  wallet: string;
  minUsd?: number;
  strict?: boolean;
  provider?: 'auto' | 'moralis' | 'covalent' | 'explorer';
  includeSpam?: boolean;
}

// Supported chains response
export interface ChainsResponse {
  chains: number[];
  providers: string[];
}

// Chain info for UI
export const CHAIN_INFO: Record<number, { name: string; symbol: string; color: string }> = {
  1: { name: 'Ethereum', symbol: 'ETH', color: '#627EEA' },
  56: { name: 'BNB Chain', symbol: 'BNB', color: '#F3BA2F' },
  8453: { name: 'Base', symbol: 'ETH', color: '#0052FF' },
  42161: { name: 'Arbitrum', symbol: 'ETH', color: '#28A0F0' },
};

/**
 * Scan wallet for tokens
 */
export async function scanWallet(options: ScanOptions): Promise<WalletScanResponse> {
  const params = new URLSearchParams({
    chainId: options.chainId.toString(),
    wallet: options.wallet,
    minUsd: (options.minUsd ?? 1).toString(),
    strict: (options.strict ?? false).toString(),
    provider: options.provider ?? 'auto',
    includeSpam: (options.includeSpam ?? false).toString(),
  });

  const response = await fetch(`${API_BASE}/api/v1/wallet/scan?${params}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });

  const data = await response.json();

  if (!response.ok) {
    // Return error response with consistent shape
    return {
      provider: data.provider || 'unknown',
      cached: false,
      warnings: data.warnings || [data.error || 'Unknown error'],
      stats: data.stats || {
        durationMs: 0,
        transfersScanned: 0,
        tokensDiscovered: 0,
        tokensPriced: 0,
        tokensMissingPrice: 0,
        tokensFiltered: 0,
        spamFiltered: 0,
      },
      tokens: [],
      nativeBalance: data.nativeBalance || {
        symbol: 'ETH',
        balance: '0',
        balanceFormatted: '0',
        decimals: 18,
      },
      error: data.error,
    };
  }

  return data;
}

/**
 * Track tokens added from scan (for metrics)
 */
export async function trackAddSelected(
  selectedCount: number,
  addedCount: number,
  options: {
    minUsd?: number;
    provider?: string;
    strict?: boolean;
    chainId?: number;
    filteredSpam?: number;
  },
): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/v1/wallet/scan/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        selectedCount,
        addedCount,
        ...options,
      }),
    });
  } catch (err) {
    // Don't throw - metrics should never break the app
    console.warn('[WalletScan] Failed to track add event:', err);
  }
}

/**
 * Get supported chains
 */
export async function getSupportedChains(): Promise<ChainsResponse> {
  try {
    const response = await fetch(`${API_BASE}/api/v1/wallet/chains`);
    if (!response.ok) {
      throw new Error('Failed to fetch chains');
    }
    return response.json();
  } catch {
    // Return defaults if API fails
    return {
      chains: [1, 56, 8453, 42161],
      providers: [],
    };
  }
}

/**
 * Format USD value
 */
export function formatUsd(value: number | undefined): string {
  if (value === undefined || value === null) return '-';
  if (value < 0.01) return '<$0.01';
  if (value < 1) return `$${value.toFixed(2)}`;
  if (value < 1000) return `$${value.toFixed(2)}`;
  if (value < 1000000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${(value / 1000000).toFixed(2)}M`;
}

/**
 * Format percentage change
 */
export function formatPercent(value: number | undefined): string {
  if (value === undefined || value === null) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Get percentage color class
 */
export function getPercentColor(value: number | undefined): string {
  if (value === undefined || value === null) return 'text-dark-400';
  if (value > 0) return 'text-green-400';
  if (value < 0) return 'text-red-400';
  return 'text-dark-400';
}

/**
 * Short wallet address
 */
export function shortAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
