/**
 * DEX Liquidity Service
 *
 * Fetches pool liquidity data from various DEXs.
 * Used for liquidity depth analysis and risk assessment.
 */

import type { LiquidityData } from './types';

// DexScreener API for liquidity data
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex';

// Chain ID to DexScreener chain name mapping
const CHAIN_NAMES: Record<number, string> = {
  1: 'ethereum',
  56: 'bsc',
  137: 'polygon',
  42161: 'arbitrum',
  8453: 'base',
};

// Cache for liquidity data (5 minute TTL)
const liquidityCache = new Map<string, { data: LiquidityData; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get liquidity data for a token pair
 */
export async function getPoolLiquidity(
  tokenAddress: string,
  chainId: number
): Promise<LiquidityData | null> {
  const chainName = CHAIN_NAMES[chainId];
  if (!chainName) {
    console.warn(`[Liquidity] Unsupported chain: ${chainId}`);
    return null;
  }

  // Check cache first
  const cacheKey = `${chainId}-${tokenAddress.toLowerCase()}`;
  const cached = liquidityCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const url = `${DEXSCREENER_API}/tokens/${tokenAddress}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.warn(`[Liquidity] DexScreener API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (!data.pairs || data.pairs.length === 0) {
      return null;
    }

    // Find the pair for our chain with highest liquidity
    const chainPairs = data.pairs.filter(
      (p: any) => p.chainId === chainName
    );

    if (chainPairs.length === 0) {
      return null;
    }

    // Sort by liquidity and get the best pool
    const bestPool = chainPairs.sort(
      (a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
    )[0];

    const liquidityData: LiquidityData = {
      totalLiquidityUSD: bestPool.liquidity?.usd || 0,
      token0Reserve: bestPool.liquidity?.base?.toString() || '0',
      token1Reserve: bestPool.liquidity?.quote?.toString() || '0',
      poolAddress: bestPool.pairAddress || '',
      dex: bestPool.dexId || 'unknown',
      lastUpdated: Date.now(),
    };

    // Cache the result
    liquidityCache.set(cacheKey, {
      data: liquidityData,
      timestamp: Date.now(),
    });

    return liquidityData;
  } catch (error) {
    console.warn('[Liquidity] Failed to fetch:', error);
    return null;
  }
}

/**
 * Get liquidity for a swap pair (from -> to)
 * Returns an object compatible with LiquidityAnalysis
 */
export async function getSwapPairLiquidity(
  fromTokenAddress: string,
  toTokenAddress: string,
  chainId: number
): Promise<{ totalUSD: number; isLow: boolean; warning?: string }> {
  // For native tokens, use wrapped address
  const wrappedAddresses: Record<number, string> = {
    1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
    56: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
    137: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
  };

  // Determine which token to check (prefer non-native, non-stablecoin)
  let tokenToCheck = toTokenAddress;

  // If to token is native or stable, check from token instead
  const isToNative = toTokenAddress === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
  if (isToNative) {
    tokenToCheck = fromTokenAddress;
  }

  // Replace native with wrapped
  if (tokenToCheck === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
    tokenToCheck = wrappedAddresses[chainId] || tokenToCheck;
  }

  const liquidityData = await getPoolLiquidity(tokenToCheck, chainId);
  const totalUSD = liquidityData?.totalLiquidityUSD || 0;

  // Determine if liquidity is low
  const isLow = totalUSD < 50000;
  const warning = isLow ? 'Low liquidity - high slippage risk' : undefined;

  return { totalUSD, isLow, warning };
}

/**
 * Estimate liquidity based on quote output (fallback when API unavailable)
 * Uses a heuristic: larger trades typically occur on pools with higher liquidity
 */
export function estimateLiquidityFromQuote(outputAmount: number): number {
  // Simple heuristic: assume pool has ~100x the output amount in liquidity
  // This is conservative and should only be used as a fallback
  if (isNaN(outputAmount) || outputAmount <= 0) return 100000; // Default moderate liquidity

  // Estimate: output * 100, capped at reasonable range
  const estimate = outputAmount * 100;

  // Cap between $10k and $10M for sanity
  return Math.max(10000, Math.min(estimate, 10000000));
}

/**
 * Clear liquidity cache
 */
export function clearLiquidityCache(): void {
  liquidityCache.clear();
}

export default getPoolLiquidity;
