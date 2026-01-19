/**
 * Wallet Scan Types
 *
 * Defines the contract for wallet scanning functionality.
 */

// Provider selection mode
export type WalletScanProvider = 'auto' | 'moralis' | 'covalent' | 'explorer';

// Token discovered from wallet scan
export interface DiscoveredToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  // Balance info
  balance: string;
  balanceFormatted: string;
  // Value info (if price available)
  priceUsd?: number;
  valueUsd?: number;
  // Classification
  isSpam: boolean;
  spamReason?: string;
  hasPricing: boolean;
  // Metadata for insights
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

// Scan statistics for observability
export interface ScanStats {
  durationMs: number;
  transfersScanned: number;
  tokensDiscovered: number;
  tokensPriced: number;
  tokensMissingPrice: number;
  tokensFiltered: number;
  spamFiltered: number;
}

// Scan configuration
export interface ScanConfig {
  chainId: number;
  wallet: string;
  minUsd: number;
  strict: boolean;
  provider: WalletScanProvider;
  includeSpam?: boolean;
  limit?: number;
}

// Full scan response (API contract)
export interface WalletScanResponse {
  // Required fields (contract)
  provider: string;
  cached: boolean;
  warnings: string[];
  stats: ScanStats;
  tokens: DiscoveredToken[];
  nativeBalance: NativeBalance;
  // Insights for UI
  insights?: ScanInsights;
  // Diff from previous scan (V4)
  diff?: ScanDiff | null;
  // Debug info
  debug?: {
    rawTokenCount: number;
    filterSteps: FilterStep[];
    providerLatencyMs: number;
  };
}

// Filter step for debugging
export interface FilterStep {
  name: string;
  before: number;
  after: number;
  removed: string[];
}

// Computed insights for "instant payoff" UX
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

// Provider interface for pluggable backends
export interface WalletScanProviderInterface {
  name: string;
  supportedChains: number[];

  // Fetch token balances for wallet
  getTokenBalances(
    chainId: number,
    wallet: string,
  ): Promise<{
    tokens: DiscoveredToken[];
    native: NativeBalance;
    rawCount: number;
    latencyMs: number;
  }>;

  // Health check
  isHealthy(): Promise<boolean>;
}

// Chain configuration
export const CHAIN_CONFIG: Record<number, {
  name: string;
  nativeSymbol: string;
  nativeDecimals: number;
  explorerUrl: string;
  moralisChain?: string;
}> = {
  1: {
    name: 'Ethereum',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    explorerUrl: 'https://etherscan.io',
    moralisChain: 'eth',
  },
  56: {
    name: 'BNB Chain',
    nativeSymbol: 'BNB',
    nativeDecimals: 18,
    explorerUrl: 'https://bscscan.com',
    moralisChain: 'bsc',
  },
  8453: {
    name: 'Base',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    explorerUrl: 'https://basescan.org',
    moralisChain: 'base',
  },
  42161: {
    name: 'Arbitrum',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    explorerUrl: 'https://arbiscan.io',
    moralisChain: 'arbitrum',
  },
};

// Supported chain IDs
export const SUPPORTED_CHAIN_IDS = Object.keys(CHAIN_CONFIG).map(Number);

// Short wallet format for logging (security - never log full address)
export function shortWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ============================================================
// Wallet Scan Diff Types (V4)
// ============================================================

// Minimal token snapshot for storage (only what's needed for diffs)
export interface TokenSnapshot {
  address: string;
  symbol: string;
  balance: string;
  valueUsd?: number;
}

// Wallet scan snapshot (stored per wallet+chain)
export interface WalletSnapshot {
  wallet: string;
  chainId: number;
  timestamp: number;
  tokens: TokenSnapshot[];
}

// Token with delta info for diff display
export interface TokenDelta {
  address: string;
  symbol: string;
  name: string;
  logo?: string;
  chainId: number;
  // Current values
  balance: string;
  balanceFormatted: string;
  valueUsd?: number;
  // Delta info
  prevBalance?: string;
  prevValueUsd?: number;
  balanceChange?: string;  // human readable like "+1,234" or "-567"
  valueChange?: number;    // USD change
}

// Scan diff result
export interface ScanDiff {
  added: TokenDelta[];      // New tokens that weren't in previous scan
  removed: TokenDelta[];    // Tokens that were in previous but not in current
  increased: TokenDelta[];  // Tokens with higher balance
  decreased: TokenDelta[];  // Tokens with lower balance
  previousScanTime?: number; // When the previous scan was done
}
