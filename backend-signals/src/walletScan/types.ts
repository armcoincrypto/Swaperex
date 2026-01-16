/**
 * Wallet Scan Types V2
 *
 * Type definitions for wallet token scanning with enhanced explainability.
 * Radar: Wallet Scan V2
 */

export interface WalletToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string; // Human-readable balance
  priceUsd: number | null; // Price per token in USD
  valueUsd: number | null; // Total value in USD
  logoUrl: string | null; // Token logo URL
  verified: boolean; // Whether token is verified/whitelisted
  isNative: boolean; // Whether this is the native chain token
}

export interface ScanStats {
  providerTokens: number; // Raw tokens from provider
  afterChainFilter: number; // After chain validation
  afterSpamFilter: number; // After spam removal
  belowMinValue: number; // Excluded by min value
  finalTokens: number; // Final returned count
}

export type ScanWarning =
  | "ANKR_KEY_MISSING"
  | "FALLBACK_PROVIDER_LIMITED"
  | "CACHE_HIT"
  | "RATE_LIMITED"
  | "PARTIAL_DATA";

export interface WalletScanResult {
  chainId: number;
  wallet: string;
  provider: string; // 'ankr' | 'fallback'
  fetchedAt: number; // Timestamp
  minValueUsd: number; // Applied min value filter
  tokens: WalletToken[];
  stats: ScanStats;
  warnings: ScanWarning[];
  cached: boolean;
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
  getTokens(
    chainId: number,
    wallet: string
  ): Promise<{ tokens: WalletToken[]; warnings: ScanWarning[] }>;
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

// Configuration (from env or defaults)
export const WALLET_SCAN_CONFIG = {
  minUsdValue: Number(process.env.WALLET_SCAN_MIN_VALUE_USD) || 2,
  maxTokens: Number(process.env.WALLET_SCAN_MAX_TOKENS) || 50,
  cacheTtlSeconds: Number(process.env.WALLET_SCAN_CACHE_TTL_SEC) || 120,
  requestTimeoutMs: 15000,
};

// Known spam token patterns
export const SPAM_PATTERNS = {
  // Suspicious symbol patterns
  symbolPatterns: [
    /^.{0,1}$/, // Too short (0-1 chars)
    /^.{20,}$/, // Too long (20+ chars)
    /airdrop/i,
    /claim/i,
    /\.com$/i,
    /\.io$/i,
    /\.org$/i,
    /free/i,
    /bonus/i,
    /reward/i,
    /visit/i,
    /http/i,
  ],
  // Suspicious name patterns
  namePatterns: [
    /airdrop/i,
    /claim.*reward/i,
    /visit.*to.*claim/i,
    /\.com/i,
    /\.io/i,
    /http/i,
    /t\.me/i,
    /telegram/i,
  ],
  // Known spam addresses (lowercase)
  blacklistedAddresses: new Set<string>([
    // Add known spam token addresses here
  ]),
};
