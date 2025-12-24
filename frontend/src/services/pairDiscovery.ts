/**
 * Pair Discovery Service
 *
 * Fetches trending pairs from Dexscreener API.
 * Filters by liquidity and volume thresholds.
 * Frontend-only, no backend required.
 */

// Chain IDs we support
export const SUPPORTED_CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  bsc: 56,
  base: 8453,
  arbitrum: 42161,
};

// Chain names for Dexscreener API
export const CHAIN_NAMES: Record<number, string> = {
  1: 'ethereum',
  56: 'bsc',
  8453: 'base',
  42161: 'arbitrum',
};

// Minimum thresholds for filtering
const MIN_LIQUIDITY_USD = 50000; // $50k minimum liquidity
const MIN_VOLUME_24H = 10000; // $10k minimum 24h volume

// Dexscreener API endpoints
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex';

// Trending pair data structure
export interface TrendingPair {
  id: string;
  chainId: number;
  chainName: string;
  dexId: string;
  pairAddress: string;
  baseToken: {
    address: string;
    symbol: string;
    name: string;
  };
  quoteToken: {
    address: string;
    symbol: string;
    name: string;
  };
  priceUsd: number;
  priceNative: number;
  priceChange: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  liquidity: {
    usd: number;
    base: number;
    quote: number;
  };
  volume: {
    h1: number;
    h6: number;
    h24: number;
  };
  txns: {
    h1: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  fdv?: number;
  marketCap?: number;
  url: string;
  // Computed fields
  volumeSpike1h: boolean;
  volumeSpike24h: boolean;
  isHot: boolean;
  discoveredAt: number;
}

// Raw Dexscreener pair response
interface DexscreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  txns: {
    m5?: { buys: number; sells: number };
    h1?: { buys: number; sells: number };
    h6?: { buys: number; sells: number };
    h24?: { buys: number; sells: number };
  };
  volume: {
    h1?: number;
    h6?: number;
    h24?: number;
  };
  priceChange: {
    m5?: number;
    h1?: number;
    h6?: number;
    h24?: number;
  };
  liquidity?: {
    usd?: number;
    base?: number;
    quote?: number;
  };
  fdv?: number;
  marketCap?: number;
}

/**
 * Convert chain name to chain ID
 */
function getChainId(chainName: string): number {
  const chainMap: Record<string, number> = {
    ethereum: 1,
    bsc: 56,
    base: 8453,
    arbitrum: 42161,
    polygon: 137,
    avalanche: 43114,
    optimism: 10,
  };
  return chainMap[chainName.toLowerCase()] || 1;
}

/**
 * Parse Dexscreener pair to our format
 */
function parsePair(pair: DexscreenerPair): TrendingPair | null {
  const chainId = getChainId(pair.chainId);
  const liquidity = pair.liquidity?.usd || 0;
  const volume24h = pair.volume?.h24 || 0;
  const volume1h = pair.volume?.h1 || 0;

  // Filter out pairs below thresholds
  if (liquidity < MIN_LIQUIDITY_USD) return null;
  if (volume24h < MIN_VOLUME_24H) return null;

  // Calculate volume spikes
  const avgHourlyVolume = volume24h / 24;
  const volumeSpike1h = volume1h > avgHourlyVolume * 2;
  const volumeSpike24h = volume24h > liquidity * 0.5; // Volume > 50% of liquidity

  // Determine if "hot" (significant activity)
  const priceChange1h = pair.priceChange?.h1 || 0;
  const isHot = Math.abs(priceChange1h) > 5 || volumeSpike1h;

  return {
    id: `${pair.chainId}-${pair.pairAddress}`,
    chainId,
    chainName: pair.chainId,
    dexId: pair.dexId,
    pairAddress: pair.pairAddress,
    baseToken: {
      address: pair.baseToken.address,
      symbol: pair.baseToken.symbol,
      name: pair.baseToken.name,
    },
    quoteToken: {
      address: pair.quoteToken.address,
      symbol: pair.quoteToken.symbol,
      name: pair.quoteToken.name,
    },
    priceUsd: parseFloat(pair.priceUsd) || 0,
    priceNative: parseFloat(pair.priceNative) || 0,
    priceChange: {
      m5: pair.priceChange?.m5 || 0,
      h1: pair.priceChange?.h1 || 0,
      h6: pair.priceChange?.h6 || 0,
      h24: pair.priceChange?.h24 || 0,
    },
    liquidity: {
      usd: liquidity,
      base: pair.liquidity?.base || 0,
      quote: pair.liquidity?.quote || 0,
    },
    volume: {
      h1: volume1h,
      h6: pair.volume?.h6 || 0,
      h24: volume24h,
    },
    txns: {
      h1: pair.txns?.h1 || { buys: 0, sells: 0 },
      h24: pair.txns?.h24 || { buys: 0, sells: 0 },
    },
    fdv: pair.fdv,
    marketCap: pair.marketCap,
    url: pair.url,
    volumeSpike1h,
    volumeSpike24h,
    isHot,
    discoveredAt: Date.now(),
  };
}

/**
 * Fetch trending pairs for a specific chain
 */
export async function fetchTrendingPairsForChain(chainName: string): Promise<TrendingPair[]> {
  try {
    // Dexscreener search endpoint - get top gainers
    const response = await fetch(
      `${DEXSCREENER_API}/search?q=${chainName}`,
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.warn(`[PairDiscovery] Failed to fetch pairs for ${chainName}:`, response.status);
      return [];
    }

    const data = await response.json();
    const pairs: DexscreenerPair[] = data.pairs || [];

    // Filter to only this chain and parse
    const chainId = getChainId(chainName);
    const trendingPairs = pairs
      .filter((p) => getChainId(p.chainId) === chainId)
      .map(parsePair)
      .filter((p): p is TrendingPair => p !== null)
      .slice(0, 20); // Top 20 per chain

    console.log(`[PairDiscovery] Found ${trendingPairs.length} trending pairs for ${chainName}`);
    return trendingPairs;
  } catch (err) {
    console.error(`[PairDiscovery] Error fetching pairs for ${chainName}:`, err);
    return [];
  }
}

/**
 * Fetch top gainers from Dexscreener
 */
export async function fetchTopGainers(): Promise<TrendingPair[]> {
  try {
    const response = await fetch(`${DEXSCREENER_API}/tokens/trending`, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      // Fallback to search if trending endpoint not available
      return fetchAllChainsPairs();
    }

    const data = await response.json();
    const pairs: DexscreenerPair[] = data.pairs || [];

    // Parse and filter
    const trendingPairs = pairs
      .map(parsePair)
      .filter((p): p is TrendingPair => p !== null)
      .filter((p) => Object.values(SUPPORTED_CHAIN_IDS).includes(p.chainId))
      .slice(0, 50);

    return trendingPairs;
  } catch (err) {
    console.error('[PairDiscovery] Error fetching top gainers:', err);
    return fetchAllChainsPairs();
  }
}

/**
 * Fetch pairs from all supported chains
 */
export async function fetchAllChainsPairs(): Promise<TrendingPair[]> {
  const chains = ['ethereum', 'bsc', 'base', 'arbitrum'];

  try {
    const results = await Promise.allSettled(
      chains.map((chain) => fetchTrendingPairsForChain(chain))
    );

    const allPairs: TrendingPair[] = [];
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        allPairs.push(...result.value);
      }
    });

    // Sort by volume and return top 50
    return allPairs
      .sort((a, b) => b.volume.h24 - a.volume.h24)
      .slice(0, 50);
  } catch (err) {
    console.error('[PairDiscovery] Error fetching all chains:', err);
    return [];
  }
}

/**
 * Search for a specific token/pair
 */
export async function searchPairs(query: string): Promise<TrendingPair[]> {
  try {
    const response = await fetch(`${DEXSCREENER_API}/search?q=${encodeURIComponent(query)}`, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const pairs: DexscreenerPair[] = data.pairs || [];

    // Parse and filter to supported chains
    return pairs
      .map(parsePair)
      .filter((p): p is TrendingPair => p !== null)
      .filter((p) => Object.values(SUPPORTED_CHAIN_IDS).includes(p.chainId))
      .slice(0, 20);
  } catch (err) {
    console.error('[PairDiscovery] Search error:', err);
    return [];
  }
}

/**
 * Get pair details by address
 */
export async function getPairByAddress(
  chainName: string,
  pairAddress: string
): Promise<TrendingPair | null> {
  try {
    const response = await fetch(`${DEXSCREENER_API}/pairs/${chainName}/${pairAddress}`, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const pair = data.pair || data.pairs?.[0];

    if (!pair) return null;

    return parsePair(pair);
  } catch (err) {
    console.error('[PairDiscovery] Error fetching pair:', err);
    return null;
  }
}

/**
 * Format price for display
 */
export function formatPrice(price: number): string {
  if (price === 0) return '$0.00';
  if (price < 0.00001) return `$${price.toExponential(2)}`;
  if (price < 0.01) return `$${price.toFixed(6)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  if (price < 1000) return `$${price.toFixed(2)}`;
  return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/**
 * Format large numbers (liquidity, volume)
 */
export function formatLargeNumber(num: number): string {
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}

/**
 * Get chain display name
 */
export function getChainDisplayName(chainId: number): string {
  const names: Record<number, string> = {
    1: 'Ethereum',
    56: 'BNB Chain',
    8453: 'Base',
    42161: 'Arbitrum',
    137: 'Polygon',
  };
  return names[chainId] || 'Unknown';
}

/**
 * Get chain color for UI
 */
export function getChainColor(chainId: number): string {
  const colors: Record<number, string> = {
    1: 'text-blue-400',
    56: 'text-yellow-400',
    8453: 'text-blue-300',
    42161: 'text-sky-400',
    137: 'text-purple-400',
  };
  return colors[chainId] || 'text-gray-400';
}
