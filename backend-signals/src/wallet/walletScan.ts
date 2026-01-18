/**
 * Wallet Scan Service
 *
 * Main orchestrator for wallet scanning:
 * - Provider selection (auto/strict mode)
 * - Token fetching
 * - Spam filtering
 * - Insights generation
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
  CHAIN_CONFIG,
} from './types.js';
import { shortWallet, SUPPORTED_CHAIN_IDS } from './types.js';
import { classifyTokens, getNonSpamTokens } from './spamFilter.js';
import { createMoralisProvider } from './moralisProvider.js';

// In-memory cache for scan results (5 minute TTL)
const scanCache = new Map<string, { result: WalletScanResponse; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// Provider instances
let moralisProvider: WalletScanProviderInterface | null = null;

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

  console.log(`[WalletScan] Available providers: ${available.join(', ') || 'none'}`);
  return available;
}

/**
 * Select provider based on config
 */
function selectProvider(
  config: ScanConfig,
): { provider: WalletScanProviderInterface; warnings: string[] } {
  const warnings: string[] = [];

  // Explicit provider requested
  if (config.provider !== 'auto') {
    if (config.provider === 'moralis') {
      if (!moralisProvider) {
        if (config.strict) {
          throw new Error('Moralis provider not available (API key not configured)');
        }
        warnings.push('Moralis not available, no fallback in strict mode');
        throw new Error('Moralis provider not available');
      }
      return { provider: moralisProvider, warnings };
    }

    // Covalent/explorer not yet implemented
    throw new Error(`Provider '${config.provider}' not implemented`);
  }

  // Auto mode - try providers in order
  if (moralisProvider) {
    return { provider: moralisProvider, warnings };
  }

  throw new Error('No wallet scan providers available');
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
 * Main scan function
 */
export async function scanWallet(config: ScanConfig): Promise<WalletScanResponse> {
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

  // Select provider
  const { provider, warnings: providerWarnings } = selectProvider(config);
  warnings.push(...providerWarnings);

  // Fetch balances
  let tokens: DiscoveredToken[];
  let native;
  let rawCount: number;
  let providerLatencyMs: number;

  try {
    const result = await provider.getTokenBalances(config.chainId, config.wallet);
    tokens = result.tokens;
    native = result.native;
    rawCount = result.rawCount;
    providerLatencyMs = result.latencyMs;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[WalletScan] PROVIDER_ERROR provider=${provider.name} error=${errorMsg.slice(0, 200)}`);

    if (config.strict) {
      throw new Error(`Provider ${provider.name} failed: ${errorMsg.slice(0, 200)}`);
    }

    // In non-strict mode, return empty with warning
    warnings.push(`Provider ${provider.name} failed: ${errorMsg.slice(0, 100)}`);
    tokens = [];
    native = {
      symbol: 'ETH',
      balance: '0',
      balanceFormatted: '0',
      decimals: 18,
    };
    rawCount = 0;
    providerLatencyMs = Date.now() - startTime;
  }

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

  // Filter by minUsd (only if price available)
  let filtered = classified;
  if (config.minUsd > 0) {
    const beforeCount = filtered.filter((t) => !t.isSpam).length;
    filtered = filtered.map((t) => {
      // Keep spam classification, but also mark tokens below minUsd
      if (!t.isSpam && t.hasPricing && t.valueUsd !== undefined && t.valueUsd < config.minUsd) {
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
  }

  // Generate insights
  const insights = generateInsights(filtered, config.chainId);

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
    provider: provider.name,
    cached: false,
    warnings,
    stats,
    tokens: config.includeSpam ? filtered : filtered.filter((t) => !t.isSpam),
    nativeBalance: native,
    insights,
    debug: {
      rawTokenCount: rawCount,
      filterSteps,
      providerLatencyMs,
    },
  };

  // Cache result
  scanCache.set(cacheKey, { result: response, timestamp: Date.now() });

  // Log completion (structured, no sensitive data)
  console.log(
    `[WalletScan] COMPLETE chain=${config.chainId} wallet=${shortWallet(config.wallet)} ` +
    `provider=${provider.name} raw=${rawCount} spam=${spamCount} final=${stats.tokensFiltered} ` +
    `priced=${stats.tokensPriced} missingPrice=${stats.tokensMissingPrice} ms=${stats.durationMs} ` +
    `strict=${config.strict}`
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

  return health;
}
