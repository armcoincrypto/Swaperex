/**
 * Wallet Scan Service
 *
 * Main orchestrator for wallet scanning:
 * - Provider selection with fallback chain (Moralis → Covalent)
 * - Token fetching with non-fatal native balance errors
 * - Spam filtering
 * - Insights generation
 * - UX warnings for better user feedback
 * - Observability logging
 */

import type {
  WalletScanResponse,
  ScanConfig,
  ScanStats,
  ScanInsights,
  DiscoveredToken,
  FilterStep,
  WalletScanProviderInterface,
  NativeBalance,
  ScanDiff,
} from './types.js';
import { shortWallet, SUPPORTED_CHAIN_IDS, CHAIN_CONFIG } from './types.js';
import { classifyTokens, getNonSpamTokens } from './spamFilter.js';
import { createMoralisProvider } from './moralisProvider.js';
import { createCovalentProvider } from './covalentProvider.js';
import { getPreviousSnapshot, saveSnapshot } from './snapshotStore.js';
import { calculateDiff } from './diffEngine.js';

// In-memory cache for scan results (5 minute TTL)
const scanCache = new Map<string, { result: WalletScanResponse; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// Provider instances
let moralisProvider: WalletScanProviderInterface | null = null;
let covalentProvider: WalletScanProviderInterface | null = null;

// Provider fallback order
const PROVIDER_ORDER = ['moralis', 'covalent'] as const;

/**
 * Initialize providers on startup
 */
export function initializeProviders(): string[] {
  const available: string[] = [];

  try {
    moralisProvider = createMoralisProvider();
    if (moralisProvider) {
      available.push('moralis');
    }
  } catch (err) {
    console.error('[WalletScan] Failed to initialize Moralis:', err);
  }

  try {
    covalentProvider = createCovalentProvider();
    if (covalentProvider) {
      available.push('covalent');
    }
  } catch (err) {
    console.error('[WalletScan] Failed to initialize Covalent:', err);
  }

  console.log(`[WalletScan] Available providers: ${available.join(', ') || 'none'}`);
  return available;
}

/**
 * Get provider by name
 */
function getProviderByName(name: string): WalletScanProviderInterface | null {
  switch (name) {
    case 'moralis':
      return moralisProvider;
    case 'covalent':
      return covalentProvider;
    default:
      return null;
  }
}

/**
 * Select provider based on config (returns single provider, no fallback logic here)
 */
function selectProvider(
  config: ScanConfig,
): { provider: WalletScanProviderInterface; warnings: string[] } {
  const warnings: string[] = [];

  // Explicit provider requested
  if (config.provider !== 'auto') {
    const provider = getProviderByName(config.provider);
    if (!provider) {
      if (config.strict) {
        throw new Error(`${config.provider} provider not available (API key not configured)`);
      }
      warnings.push(`${config.provider}_not_available`);
      throw new Error(`${config.provider} provider not available`);
    }
    return { provider, warnings };
  }

  // Auto mode - return first available provider
  for (const providerName of PROVIDER_ORDER) {
    const provider = getProviderByName(providerName);
    if (provider) {
      return { provider, warnings };
    }
  }

  throw new Error('No wallet scan providers available');
}

/**
 * Get next fallback provider after the given one
 */
function getNextFallbackProvider(currentProviderName: string): WalletScanProviderInterface | null {
  const currentIndex = PROVIDER_ORDER.indexOf(currentProviderName as typeof PROVIDER_ORDER[number]);
  if (currentIndex === -1) return null;

  for (let i = currentIndex + 1; i < PROVIDER_ORDER.length; i++) {
    const provider = getProviderByName(PROVIDER_ORDER[i]);
    if (provider) {
      return provider;
    }
  }
  return null;
}

/**
 * Generate cache key
 */
function getCacheKey(chainId: number, wallet: string): string {
  return `${chainId}:${wallet.toLowerCase()}`;
}

/**
 * Generate insights from scan results
 */
function generateInsights(
  tokens: DiscoveredToken[],
  chainId: number,
): ScanInsights {
  const nonSpam = getNonSpamTokens(tokens, 0);
  const priced = nonSpam.filter((t) => t.hasPricing && t.valueUsd && t.valueUsd > 0);
  const unpriced = nonSpam.filter((t) => !t.hasPricing);

  // Total portfolio value
  const totalValueUsd = priced.reduce((sum, t) => sum + (t.valueUsd || 0), 0);

  // Sort by value for top positions
  const sortedByValue = [...priced].sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));

  // Find most volatile (highest absolute % change)
  const sortedByVolatility = [...priced]
    .filter((t) => typeof t.percentChange24h === 'number')
    .sort((a, b) => Math.abs(b.percentChange24h || 0) - Math.abs(a.percentChange24h || 0));

  const insights: ScanInsights = {
    topFive: sortedByValue.slice(0, 5),
    totalValueUsd,
  };

  // Biggest position
  if (sortedByValue.length > 0) {
    const biggest = sortedByValue[0];
    const percentage = totalValueUsd > 0 ? ((biggest.valueUsd || 0) / totalValueUsd * 100).toFixed(1) : '100';
    insights.biggestPosition = {
      token: biggest,
      reason: `${percentage}% of portfolio ($${(biggest.valueUsd || 0).toFixed(2)})`,
    };
  }

  // Most volatile
  if (sortedByVolatility.length > 0) {
    const volatile = sortedByVolatility[0];
    const direction = (volatile.percentChange24h || 0) > 0 ? 'up' : 'down';
    insights.mostVolatile = {
      token: volatile,
      reason: `${direction} ${Math.abs(volatile.percentChange24h || 0).toFixed(1)}% in 24h`,
    };
  }

  // New/recent tokens (detected by no 24h change data or recent activity)
  const newTokens = nonSpam.filter((t) =>
    !t.hasPricing || typeof t.percentChange24h !== 'number'
  ).slice(0, 5);

  if (newTokens.length > 0) {
    insights.newTokens = {
      tokens: newTokens,
      count: newTokens.length,
    };
  }

  // Unpriced tokens
  if (unpriced.length > 0) {
    insights.unpricedTokens = {
      tokens: unpriced.slice(0, 5),
      count: unpriced.length,
      reason: 'No price data available from DEX aggregators',
    };
  }

  // Chain suggestion if empty
  if (nonSpam.length === 0) {
    // Suggest trying another chain based on current chain
    const suggestions: Record<number, string> = {
      1: 'Try scanning on Base or Arbitrum for L2 tokens',
      56: 'Try scanning on Ethereum or Base for more tokens',
      8453: 'Try scanning on Ethereum or Arbitrum',
      42161: 'Try scanning on Ethereum or Base',
    };
    insights.chainSuggestion = suggestions[chainId] || 'Try scanning on another chain';
  }

  return insights;
}

/**
 * Get default native balance for chain (used when native balance fetch fails)
 */
function getDefaultNativeBalance(chainId: number): NativeBalance {
  const config = CHAIN_CONFIG[chainId];
  return {
    symbol: config?.nativeSymbol || 'ETH',
    balance: '0',
    balanceFormatted: '0',
    decimals: config?.nativeDecimals || 18,
  };
}

/**
 * Fetch balances with provider fallback support
 */
async function fetchBalancesWithFallback(
  config: ScanConfig,
  initialProvider: WalletScanProviderInterface,
  warnings: string[],
): Promise<{
  tokens: DiscoveredToken[];
  native: NativeBalance;
  rawCount: number;
  providerLatencyMs: number;
  usedProvider: string;
}> {
  let currentProvider = initialProvider;
  let lastError: Error | null = null;

  while (currentProvider) {
    try {
      const result = await currentProvider.getTokenBalances(config.chainId, config.wallet);
      return {
        tokens: result.tokens,
        native: result.native,
        rawCount: result.rawCount,
        providerLatencyMs: result.latencyMs,
        usedProvider: currentProvider.name,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[WalletScan] PROVIDER_ERROR provider=${currentProvider.name} error=${errorMsg.slice(0, 200)}`);
      warnings.push(`provider_error_${currentProvider.name}`);

      // Check if we should try fallback
      if (config.strict) {
        throw new Error(`Provider ${currentProvider.name} failed: ${errorMsg.slice(0, 200)}`);
      }

      lastError = err instanceof Error ? err : new Error(String(err));

      // Try next provider in fallback chain
      const nextProvider = getNextFallbackProvider(currentProvider.name);
      if (nextProvider) {
        console.log(`[WalletScan] Falling back from ${currentProvider.name} to ${nextProvider.name}`);
        warnings.push(`fallback_${currentProvider.name}_to_${nextProvider.name}`);
        currentProvider = nextProvider;
      } else {
        break;
      }
    }
  }

  // All providers failed - return empty with warning
  warnings.push('all_providers_failed');
  return {
    tokens: [],
    native: getDefaultNativeBalance(config.chainId),
    rawCount: 0,
    providerLatencyMs: 0,
    usedProvider: 'none',
  };
}

/**
 * Main scan function
 */
export async function scanWallet(
  config: ScanConfig,
  watchedTokens?: Set<string>, // Optional: set of "chainId:address" for already watched tokens
): Promise<WalletScanResponse> {
  const startTime = Date.now();
  const warnings: string[] = [];
  const filterSteps: FilterStep[] = [];

  // Validate chain
  if (!SUPPORTED_CHAIN_IDS.includes(config.chainId)) {
    throw new Error(`Chain ${config.chainId} not supported. Supported: ${SUPPORTED_CHAIN_IDS.join(', ')}`);
  }

  // Check cache
  const cacheKey = getCacheKey(config.chainId, config.wallet);
  const cached = scanCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[WalletScan] CACHE_HIT chain=${config.chainId} wallet=${shortWallet(config.wallet)}`);
    return {
      ...cached.result,
      cached: true,
    };
  }

  // Select initial provider
  const { provider: initialProvider, warnings: providerWarnings } = selectProvider(config);
  warnings.push(...providerWarnings);

  // Fetch balances with fallback support
  const {
    tokens,
    native,
    rawCount,
    providerLatencyMs,
    usedProvider,
  } = await fetchBalancesWithFallback(config, initialProvider, warnings);

  filterSteps.push({
    name: 'raw_fetch',
    before: rawCount,
    after: tokens.length,
    removed: [],
  });

  // Classify spam
  const { classified, spamCount } = classifyTokens(tokens);
  filterSteps.push({
    name: 'spam_classification',
    before: tokens.length,
    after: tokens.length - spamCount,
    removed: classified.filter((t) => t.isSpam).map((t) => t.symbol).slice(0, 10),
  });

  // Track tokens filtered by minUsd
  let minUsdFilteredCount = 0;

  // Filter by minUsd (only if price available)
  let filtered = classified;
  if (config.minUsd > 0) {
    const beforeCount = filtered.filter((t) => !t.isSpam).length;
    filtered = filtered.map((t) => {
      // Keep spam classification, but also mark tokens below minUsd
      if (!t.isSpam && t.hasPricing && t.valueUsd !== undefined && t.valueUsd < config.minUsd) {
        minUsdFilteredCount++;
        return {
          ...t,
          isSpam: true,
          spamReason: `Value below minimum ($${config.minUsd})`,
        };
      }
      return t;
    });
    const afterCount = filtered.filter((t) => !t.isSpam).length;
    filterSteps.push({
      name: 'min_usd_filter',
      before: beforeCount,
      after: afterCount,
      removed: [],
    });

    // Add UX warning if tokens were filtered by minUsd
    if (minUsdFilteredCount > 0) {
      warnings.push(`filtered_by_minUsd:${minUsdFilteredCount}`);
    }
  }

  // Track already watched tokens
  let alreadyWatchedCount = 0;
  if (watchedTokens && watchedTokens.size > 0) {
    for (const token of filtered) {
      const key = `${token.chainId}:${token.address.toLowerCase()}`;
      if (watchedTokens.has(key) && !token.isSpam) {
        alreadyWatchedCount++;
      }
    }
    if (alreadyWatchedCount > 0) {
      warnings.push(`already_watched_tokens_hidden:${alreadyWatchedCount}`);
    }
  }

  // Generate insights
  const insights = generateInsights(filtered, config.chainId);

  // Calculate diff from previous scan (V4)
  let diff: ScanDiff | null = null;
  try {
    const previousSnapshot = await getPreviousSnapshot(config.wallet, config.chainId);
    const nonSpamTokens = filtered.filter((t) => !t.isSpam);
    diff = calculateDiff(nonSpamTokens, previousSnapshot, config.minUsd);
  } catch (err) {
    console.warn('[WalletScan] Failed to calculate diff:', err);
    // Don't fail the scan if diff calculation fails
  }

  // Build stats
  const stats: ScanStats = {
    durationMs: Date.now() - startTime,
    transfersScanned: rawCount,
    tokensDiscovered: rawCount,
    tokensPriced: filtered.filter((t) => t.hasPricing).length,
    tokensMissingPrice: filtered.filter((t) => !t.hasPricing).length,
    tokensFiltered: filtered.filter((t) => !t.isSpam).length,
    spamFiltered: filtered.filter((t) => t.isSpam).length,
  };

  // Final response
  const response: WalletScanResponse = {
    provider: usedProvider,
    cached: false,
    warnings,
    stats,
    tokens: config.includeSpam ? filtered : filtered.filter((t) => !t.isSpam),
    nativeBalance: native,
    insights,
    diff,
    debug: {
      rawTokenCount: rawCount,
      filterSteps,
      providerLatencyMs,
    },
  };

  // Save snapshot for future diff calculations (V4)
  try {
    await saveSnapshot(config.wallet, config.chainId, filtered);
  } catch (err) {
    console.warn('[WalletScan] Failed to save snapshot:', err);
    // Don't fail the scan if snapshot save fails
  }

  // Cache result
  scanCache.set(cacheKey, { result: response, timestamp: Date.now() });

  // Log completion (structured, no sensitive data)
  console.log(
    `[WalletScan] COMPLETE chain=${config.chainId} wallet=${shortWallet(config.wallet)} ` +
    `provider=${usedProvider} raw=${rawCount} spam=${spamCount} final=${stats.tokensFiltered} ` +
    `priced=${stats.tokensPriced} missingPrice=${stats.tokensMissingPrice} ms=${stats.durationMs} ` +
    `strict=${config.strict} minUsdFiltered=${minUsdFilteredCount} alreadyWatched=${alreadyWatchedCount}`
  );

  return response;
}

/**
 * Clear cache (useful for testing)
 */
export function clearScanCache(): void {
  scanCache.clear();
}

/**
 * Get provider health status
 */
export async function getProviderHealth(): Promise<Record<string, boolean>> {
  const health: Record<string, boolean> = {};

  if (moralisProvider) {
    health.moralis = await moralisProvider.isHealthy();
  }

  if (covalentProvider) {
    health.covalent = await covalentProvider.isHealthy();
  }

  return health;
}
