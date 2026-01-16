/**
 * Wallet Scan Types
 *
 * Type definitions for wallet token scanning.
 * Radar: Wallet Scan MVP
 */

export interface WalletToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string; // Raw balance as string (wei)
  balanceFormatted: string; // Human-readable balance
  priceUsd: number | null; // Price per token in USD
  valueUsd: number | null; // Total value in USD
  logo: string | null; // Token logo URL
  source: string; // Data provider source
}

export interface WalletScanResult {
  chainId: number;
  wallet: string;
  tokens: WalletToken[];
  cached: boolean;
  timestamp: number;
}

export interface WalletScanError {
  code: string;
  message: string;
  chainId?: number;
}

// Provider interface
export interface WalletTokenProvider {
  name: string;
  supportedChains: number[];
  getTokens(chainId: number, wallet: string): Promise<WalletToken[]>;
}

// Chain configuration
export const SUPPORTED_CHAINS: Record<number, { name: string; symbol: string }> = {
  1: { name: "Ethereum", symbol: "ETH" },
  56: { name: "BNB Chain", symbol: "BNB" },
  137: { name: "Polygon", symbol: "MATIC" },
  42161: { name: "Arbitrum", symbol: "ETH" },
  10: { name: "Optimism", symbol: "ETH" },
  43114: { name: "Avalanche", symbol: "AVAX" },
};

// Configuration
export const WALLET_SCAN_CONFIG = {
  minUsdValue: Number(process.env.WALLET_SCAN_MIN_USD) || 2,
  cacheTtlSeconds: Number(process.env.WALLET_SCAN_CACHE_SEC) || 60,
  maxTokens: 100,
  requestTimeoutMs: 15000,
};
