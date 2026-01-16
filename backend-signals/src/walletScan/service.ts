/**
 * Wallet Scan Service
 *
 * Orchestrates token scanning with caching, filtering, and normalization.
 * Uses multiple providers with fallback.
 *
 * Radar: Wallet Scan MVP
 */

import {
  WalletToken,
  WalletScanResult,
  WalletScanError,
  WalletTokenProvider,
  WALLET_SCAN_CONFIG,
  SUPPORTED_CHAINS,
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
 * Get wallet tokens with caching and fallback
 */
export async function getWalletTokens(
  chainId: number,
  wallet: string
): Promise<WalletScanResult | WalletScanError> {
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
    console.log(`[WalletScan] Cache hit for ${cacheKey}`);
    return { ...cached.result, cached: true };
  }

  // Try providers in order
  let tokens: WalletToken[] = [];
  let lastError: Error | null = null;

  for (const provider of providers) {
    if (!provider.supportedChains.includes(chainId)) {
      continue;
    }

    try {
      console.log(`[WalletScan] Trying ${provider.name} for chain ${chainId}`);
      tokens = await provider.getTokens(chainId, normalizedWallet);

      if (tokens.length > 0 || provider.name === "fallback") {
        console.log(`[WalletScan] ${provider.name} returned ${tokens.length} tokens`);
        break;
      }
    } catch (err: any) {
      console.error(`[WalletScan] ${provider.name} failed:`, err.message);
      lastError = err;
    }
  }

  // If all providers failed and we have no tokens
  if (tokens.length === 0 && lastError) {
    return {
      code: "SCAN_FAILED",
      message: "Failed to scan wallet. Please try again.",
    };
  }

  // Filter and sort tokens
  const filteredTokens = filterAndSortTokens(tokens);

  // Build result
  const result: WalletScanResult = {
    chainId,
    wallet: normalizedWallet,
    tokens: filteredTokens,
    cached: false,
    timestamp: Date.now(),
  };

  // Cache result
  scanCache.set(cacheKey, {
    result,
    expiresAt: Date.now() + WALLET_SCAN_CONFIG.cacheTtlSeconds * 1000,
  });

  return result;
}

/**
 * Filter and sort tokens according to MVP rules
 */
function filterAndSortTokens(tokens: WalletToken[]): WalletToken[] {
  return tokens
    .filter((token) => {
      // Exclude zero balance
      if (token.balanceFormatted === "0" || token.balanceFormatted === "0.000000") {
        return false;
      }

      // Exclude tokens below min USD value (if value available)
      if (token.valueUsd !== null && token.valueUsd < WALLET_SCAN_CONFIG.minUsdValue) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      // Sort by USD value desc (if available)
      if (a.valueUsd !== null && b.valueUsd !== null) {
        return b.valueUsd - a.valueUsd;
      }
      // Tokens with price come first
      if (a.valueUsd !== null && b.valueUsd === null) return -1;
      if (a.valueUsd === null && b.valueUsd !== null) return 1;

      // Fallback: sort by balance
      const balA = parseFloat(a.balanceFormatted) || 0;
      const balB = parseFloat(b.balanceFormatted) || 0;
      return balB - balA;
    })
    .slice(0, WALLET_SCAN_CONFIG.maxTokens);
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
