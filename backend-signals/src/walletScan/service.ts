/**
 * Wallet Scan Service V2
 *
 * Orchestrates token scanning with caching, filtering, spam detection,
 * and enhanced stats for UI explainability.
 *
 * Radar: Wallet Scan V2
 */

import {
  WalletToken,
  WalletScanResult,
  WalletScanError,
  WalletTokenProvider,
  ScanStats,
  ScanWarning,
  WALLET_SCAN_CONFIG,
  SUPPORTED_CHAINS,
  SPAM_PATTERNS,
} from "./types.js";
import { ankrProvider } from "./providers/ankr.js";
import { fallbackProvider } from "./providers/fallback.js";

// In-memory cache
interface CacheEntry {
  result: WalletScanResult;
  expiresAt: number;
}

const scanCache = new Map<string, CacheEntry>();

// Provider priority (try in order)
const providers: WalletTokenProvider[] = [ankrProvider, fallbackProvider];

/**
 * Generate cache key
 */
function getCacheKey(chainId: number, wallet: string): string {
  return `${chainId}:${wallet.toLowerCase()}`;
}

/**
 * Check if chain is supported
 */
export function isChainSupported(chainId: number): boolean {
  return chainId in SUPPORTED_CHAINS;
}

/**
 * Short wallet for logging (privacy)
 */
function shortWallet(wallet: string): string {
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

/**
 * Check if token matches spam patterns
 */
function isSpamToken(token: WalletToken): boolean {
  // Check blacklisted addresses
  if (SPAM_PATTERNS.blacklistedAddresses.has(token.address.toLowerCase())) {
    return true;
  }

  // Check symbol patterns
  for (const pattern of SPAM_PATTERNS.symbolPatterns) {
    if (pattern.test(token.symbol)) {
      return true;
    }
  }

  // Check name patterns
  for (const pattern of SPAM_PATTERNS.namePatterns) {
    if (pattern.test(token.name)) {
      return true;
    }
  }

  // Empty/null symbol or name is spam
  if (!token.symbol || token.symbol === "???" || !token.name) {
    return true;
  }

  return false;
}

/**
 * Get wallet tokens with caching, filtering, and stats
 */
export async function getWalletTokens(
  chainId: number,
  wallet: string
): Promise<WalletScanResult | WalletScanError> {
  const startTime = Date.now();

  // Validate chain
  if (!isChainSupported(chainId)) {
    return {
      code: "UNSUPPORTED_CHAIN",
      message: `Chain ${chainId} is not supported. Supported chains: ${Object.keys(SUPPORTED_CHAINS).join(", ")}`,
      chainId,
    };
  }

  // Validate wallet address
  if (!isValidAddress(wallet)) {
    return {
      code: "INVALID_ADDRESS",
      message: "Invalid wallet address format",
    };
  }

  const normalizedWallet = wallet.toLowerCase();
  const cacheKey = getCacheKey(chainId, normalizedWallet);

  // Check cache
  const cached = scanCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    console.log(
      `[WalletScan] CACHE_HIT chain=${chainId} wallet=${shortWallet(normalizedWallet)} ` +
        `provider=${cached.result.provider} tokens=${cached.result.stats.finalTokens}`
    );
    return {
      ...cached.result,
      cached: true,
      warnings: [...cached.result.warnings, "CACHE_HIT"],
    };
  }

  // Initialize stats
  const stats: ScanStats = {
    providerTokens: 0,
    afterChainFilter: 0,
    afterSpamFilter: 0,
    belowMinValue: 0,
    finalTokens: 0,
  };

  let tokens: WalletToken[] = [];
  let warnings: ScanWarning[] = [];
  let usedProvider = "unknown";
  let lastError: Error | null = null;

  // Try providers in order
  for (const provider of providers) {
    if (!provider.supportedChains.includes(chainId)) {
      continue;
    }

    try {
      console.log(`[WalletScan] TRYING provider=${provider.name} chain=${chainId}`);
      const result = await provider.getTokens(chainId, normalizedWallet);

      tokens = result.tokens;
      warnings = result.warnings;
      usedProvider = provider.name;
      stats.providerTokens = tokens.length;

      if (tokens.length > 0 || provider.name === "fallback") {
        break;
      }
    } catch (err: any) {
      console.error(`[WalletScan] PROVIDER_ERROR provider=${provider.name} error=${err.message}`);
      lastError = err;
    }
  }

  // If all providers failed
  if (tokens.length === 0 && lastError) {
    console.log(
      `[WalletScan] SCAN_FAILED chain=${chainId} wallet=${shortWallet(normalizedWallet)} ` +
        `error=${lastError.message}`
    );
    return {
      code: "SCAN_FAILED",
      message: "Failed to scan wallet. Please try again.",
    };
  }

  // Stats after provider
  stats.afterChainFilter = tokens.length;

  // Step 1: Remove spam tokens
  const nonSpamTokens = tokens.filter((token) => !isSpamToken(token));
  stats.afterSpamFilter = nonSpamTokens.length;

  // Step 2: Track tokens below min value
  const { minUsdValue } = WALLET_SCAN_CONFIG;
  let belowMinCount = 0;
  const valueFilteredTokens = nonSpamTokens.filter((token) => {
    // If no value data, include it
    if (token.valueUsd === null) {
      return true;
    }
    // Check against min value
    if (token.valueUsd < minUsdValue) {
      belowMinCount++;
      return false;
    }
    return true;
  });
  stats.belowMinValue = belowMinCount;

  // Step 3: Sort by value (desc) and limit
  const sortedTokens = valueFilteredTokens
    .sort((a, b) => {
      // Tokens with value come first
      if (a.valueUsd !== null && b.valueUsd !== null) {
        return b.valueUsd - a.valueUsd;
      }
      if (a.valueUsd !== null && b.valueUsd === null) return -1;
      if (a.valueUsd === null && b.valueUsd !== null) return 1;

      // Then sort by balance
      const balA = parseFloat(a.balance) || 0;
      const balB = parseFloat(b.balance) || 0;
      return balB - balA;
    })
    .slice(0, WALLET_SCAN_CONFIG.maxTokens);

  stats.finalTokens = sortedTokens.length;

  // Build result
  const result: WalletScanResult = {
    chainId,
    wallet: normalizedWallet,
    provider: usedProvider,
    fetchedAt: Date.now(),
    minValueUsd: minUsdValue,
    tokens: sortedTokens,
    stats,
    warnings,
    cached: false,
  };

  // Cache result
  scanCache.set(cacheKey, {
    result,
    expiresAt: Date.now() + WALLET_SCAN_CONFIG.cacheTtlSeconds * 1000,
  });

  // Log summary
  const duration = Date.now() - startTime;
  console.log(
    `[WalletScan] COMPLETE chain=${chainId} wallet=${shortWallet(normalizedWallet)} ` +
      `provider=${usedProvider} raw=${stats.providerTokens} spam=${stats.providerTokens - stats.afterSpamFilter} ` +
      `belowMin=${stats.belowMinValue} final=${stats.finalTokens} time=${duration}ms`
  );

  return result;
}

/**
 * Validate Ethereum address format
 */
function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Clear cache (for testing)
 */
export function clearScanCache(): void {
  scanCache.clear();
  console.log("[WalletScan] Cache cleared");
}

/**
 * Get cache stats
 */
export function getScanCacheStats(): { size: number; keys: string[] } {
  // Clean expired entries
  const now = Date.now();
  for (const [key, entry] of scanCache.entries()) {
    if (entry.expiresAt < now) {
      scanCache.delete(key);
    }
  }

  return {
    size: scanCache.size,
    keys: Array.from(scanCache.keys()),
  };
}
