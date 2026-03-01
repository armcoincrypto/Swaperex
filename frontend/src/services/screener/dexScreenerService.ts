/**
 * DexScreener On-Demand Enrichment
 *
 * Fetches liquidity / pair data per token only when user expands a row.
 * Uses caching with 2-minute TTL. Abortable.
 *
 * READ-ONLY: No auth required.
 */

import { cacheGet, cacheSet } from './cache';
import type { DexScreenerData, ScreenerChainId } from './types';

const DEX_API = 'https://api.dexscreener.com/latest/dex';
const CACHE_TTL = 2 * 60_000; // 2 minutes

const CHAIN_SLUGS: Record<ScreenerChainId, string> = {
  1: 'ethereum',
  56: 'bsc',
  137: 'polygon',
  42161: 'arbitrum',
};

// Concurrency limiter (max 4 parallel requests)
let activeRequests = 0;
const MAX_CONCURRENT = 4;
const queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => queue.push(resolve));
}

function releaseSlot(): void {
  activeRequests--;
  const next = queue.shift();
  if (next) {
    activeRequests++;
    next();
  }
}

/**
 * Fetch DexScreener pair data for a token address on a chain.
 * Returns null on failure (never throws).
 */
export async function fetchDexScreenerData(
  contractAddress: string,
  chainId: ScreenerChainId,
  signal?: AbortSignal,
): Promise<DexScreenerData | null> {
  if (!contractAddress) return null;

  const slug = CHAIN_SLUGS[chainId];
  if (!slug) return null;

  const cacheKey = `dex:${chainId}:${contractAddress.toLowerCase()}`;
  const cached = cacheGet<DexScreenerData>(cacheKey);
  if (cached) return cached;

  await acquireSlot();
  try {
    const res = await fetch(
      `${DEX_API}/tokens/${contractAddress}`,
      { signal },
    );

    if (!res.ok) return null;

    const json = await res.json();
    const pairs = json.pairs as DexPair[] | undefined;
    if (!pairs || pairs.length === 0) return null;

    // Find the highest-liquidity pair on the target chain
    const chainPairs = pairs.filter(
      (p) => p.chainId === slug,
    );
    if (chainPairs.length === 0) return null;

    const best = chainPairs.reduce((a, b) =>
      (b.liquidity?.usd ?? 0) > (a.liquidity?.usd ?? 0) ? b : a,
    );

    const result: DexScreenerData = {
      priceUsd: parseFloat(best.priceUsd ?? '0'),
      liquidity: best.liquidity?.usd ?? 0,
      fdv: best.fdv ?? 0,
      volume24h: best.volume?.h24 ?? 0,
      priceChange1h: best.priceChange?.h1,
      priceChange6h: best.priceChange?.h6,
      priceChange24h: best.priceChange?.h24,
      pairAddress: best.pairAddress,
      dexName: best.dexId,
      fetchedAt: Date.now(),
    };

    cacheSet(cacheKey, result, CACHE_TTL);
    return result;
  } catch {
    return null;
  } finally {
    releaseSlot();
  }
}

/** DexScreener pair response shape (subset) */
interface DexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  priceUsd?: string;
  fdv?: number;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  priceChange?: { h1?: number; h6?: number; h24?: number };
}
