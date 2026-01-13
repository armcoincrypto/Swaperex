/**
 * Token Metadata Service
 *
 * Fetches token metadata (name, symbol, logo, price) from DexScreener API.
 * Uses the tokenMetaStore for caching.
 *
 * Step 1 - Token Metadata Layer
 */

import { useTokenMetaStore, type TokenMeta } from '@/stores/tokenMetaStore';

// DexScreener API endpoint
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex';

// Chain ID to DexScreener chain name mapping
const CHAIN_ID_TO_NAME: Record<number, string> = {
  1: 'ethereum',
  56: 'bsc',
  8453: 'base',
  42161: 'arbitrum',
  137: 'polygon',
  43114: 'avalanche',
  10: 'optimism',
};

// Fallback logo placeholder (generates identicon-style shape)
function generateFallbackLogo(address: string): string {
  return `https://api.dicebear.com/7.x/shapes/svg?seed=${address}&backgroundColor=1a1a2e`;
}

/**
 * DexScreener pair response type
 */
interface DexScreenerPair {
  chainId: string;
  dexId: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceUsd: string;
  priceChange: {
    h24: number;
  };
  liquidity: {
    usd: number;
  };
  fdv: number;
  info?: {
    imageUrl?: string;
  };
}

interface DexScreenerResponse {
  schemaVersion: string;
  pairs: DexScreenerPair[] | null;
}

/**
 * Fetch token metadata from DexScreener
 */
async function fetchFromDexScreener(
  chainId: number,
  address: string
): Promise<Partial<TokenMeta> | null> {
  const chainName = CHAIN_ID_TO_NAME[chainId];
  if (!chainName) {
    console.warn(`[TokenMeta] Unsupported chain ID: ${chainId}`);
    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const res = await fetch(
      `${DEXSCREENER_API}/tokens/${address}`,
      {
        method: 'GET',
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[TokenMeta] DexScreener returned ${res.status}`);
      return null;
    }

    const data: DexScreenerResponse = await res.json();

    if (!data.pairs || data.pairs.length === 0) {
      console.log(`[TokenMeta] No pairs found for ${address}`);
      return null;
    }

    // Find pair matching our chain
    const pair = data.pairs.find(
      (p) => p.chainId.toLowerCase() === chainName.toLowerCase()
    ) || data.pairs[0]; // Fallback to first pair

    return {
      chainId,
      address: address.toLowerCase(),
      name: pair.baseToken.name,
      symbol: pair.baseToken.symbol,
      logoUrl: pair.info?.imageUrl || null,
      priceUsd: pair.priceUsd ? parseFloat(pair.priceUsd) : null,
      priceChange24h: pair.priceChange?.h24 ?? null,
    };
  } catch (error) {
    console.warn(`[TokenMeta] Failed to fetch from DexScreener:`, error);
    return null;
  }
}

/**
 * Get token metadata with caching
 * Returns cached data if available and not expired, otherwise fetches fresh
 */
export async function getTokenMeta(
  chainId: number,
  address: string,
  knownSymbol?: string
): Promise<TokenMeta> {
  const store = useTokenMetaStore.getState();
  const normalizedAddress = address.toLowerCase();

  // Check cache first
  const cached = store.getMeta(chainId, normalizedAddress);
  if (cached) {
    return cached;
  }

  // Fetch fresh data
  const fetched = await fetchFromDexScreener(chainId, normalizedAddress);

  // Create metadata object (with fallbacks)
  const meta: TokenMeta = {
    chainId,
    address: normalizedAddress,
    name: fetched?.name || knownSymbol || shortenAddress(normalizedAddress),
    symbol: fetched?.symbol || knownSymbol || shortenAddress(normalizedAddress),
    logoUrl: fetched?.logoUrl || generateFallbackLogo(normalizedAddress),
    priceUsd: fetched?.priceUsd ?? null,
    priceChange24h: fetched?.priceChange24h ?? null,
    fetchedAt: Date.now(),
  };

  // Cache it
  store.setMeta(meta);

  return meta;
}

/**
 * Get token metadata synchronously (from cache only)
 * Returns null if not cached
 */
export function getTokenMetaSync(
  chainId: number,
  address: string
): TokenMeta | null {
  const store = useTokenMetaStore.getState();
  return store.getMeta(chainId, address.toLowerCase());
}

/**
 * Prefetch metadata for multiple tokens
 * Useful for batch loading watchlist/history
 */
export async function prefetchTokenMeta(
  tokens: Array<{ chainId: number; address: string; symbol?: string }>
): Promise<void> {
  const store = useTokenMetaStore.getState();

  // Filter to only tokens that need fetching
  const toFetch = tokens.filter((t) =>
    store.isExpired(t.chainId, t.address)
  );

  if (toFetch.length === 0) return;

  console.log(`[TokenMeta] Prefetching ${toFetch.length} tokens...`);

  // Fetch in small batches to avoid rate limiting
  const BATCH_SIZE = 3;
  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((t) => getTokenMeta(t.chainId, t.address, t.symbol))
    );
    // Small delay between batches
    if (i + BATCH_SIZE < toFetch.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

/**
 * Shorten address to 0x1234...5678 format
 */
export function shortenAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format price for display
 */
export function formatPrice(price: number | null): string {
  if (price === null) return '—';

  if (price < 0.00001) {
    return `$${price.toExponential(2)}`;
  }
  if (price < 0.01) {
    return `$${price.toFixed(6)}`;
  }
  if (price < 1) {
    return `$${price.toFixed(4)}`;
  }
  if (price < 1000) {
    return `$${price.toFixed(2)}`;
  }
  return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/**
 * Format price change percentage
 */
export function formatPriceChange(change: number | null): string {
  if (change === null) return '';
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
}

/**
 * Get chain name for display
 */
export function getChainDisplayName(chainId: number): string {
  switch (chainId) {
    case 1:
      return 'Ethereum';
    case 56:
      return 'BNB Chain';
    case 8453:
      return 'Base';
    case 42161:
      return 'Arbitrum';
    case 137:
      return 'Polygon';
    case 43114:
      return 'Avalanche';
    case 10:
      return 'Optimism';
    default:
      return `Chain ${chainId}`;
  }
}

/**
 * Get chain short name for badges
 */
export function getChainShortName(chainId: number): string {
  switch (chainId) {
    case 1:
      return 'ETH';
    case 56:
      return 'BSC';
    case 8453:
      return 'Base';
    case 42161:
      return 'ARB';
    case 137:
      return 'POLY';
    case 43114:
      return 'AVAX';
    case 10:
      return 'OP';
    default:
      return `#${chainId}`;
  }
}

export default {
  getTokenMeta,
  getTokenMetaSync,
  prefetchTokenMeta,
  shortenAddress,
  formatPrice,
  formatPriceChange,
};
