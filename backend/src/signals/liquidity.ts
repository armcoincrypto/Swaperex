/**
 * Liquidity Signal Service
 *
 * Detects significant liquidity changes (≥30% drop in <10 minutes).
 * Uses DexScreener API for liquidity data.
 */

import axios from 'axios';
import cache, { CACHE_TTL } from '../cache/redis.js';
import type { LiquidityDropSignal, DexScreenerResponse, DexScreenerPair } from './types.js';

// Chain ID to DexScreener chain name mapping
const CHAIN_NAMES: Record<number, string> = {
  1: 'ethereum',
  56: 'bsc',
  137: 'polygon',
  42161: 'arbitrum',
  10: 'optimism',
  43114: 'avalanche',
  250: 'fantom',
  8453: 'base',
};

// Thresholds
const LIQUIDITY_DROP_THRESHOLD = -30; // 30% drop
const HISTORY_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// Historical liquidity snapshots (in-memory for now)
const liquidityHistory = new Map<string, { usd: number; timestamp: number }[]>();

/**
 * Fetch current liquidity from DexScreener
 */
async function fetchLiquidity(chainId: number, tokenAddress: string): Promise<DexScreenerPair | null> {
  const chainName = CHAIN_NAMES[chainId];
  if (!chainName) {
    console.warn(`[Liquidity] Unknown chain ID: ${chainId}`);
    return null;
  }

  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
    const response = await axios.get<DexScreenerResponse>(url, {
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.data.pairs || response.data.pairs.length === 0) {
      return null;
    }

    // Find the pair on the correct chain with highest liquidity
    const chainPairs = response.data.pairs.filter(
      (p) => p.chainId === chainName
    );

    if (chainPairs.length === 0) {
      return null;
    }

    // Sort by liquidity and return highest
    chainPairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    return chainPairs[0];
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.warn(`[Liquidity] DexScreener API error: ${err.message}`);
    } else {
      console.warn('[Liquidity] Fetch error:', err);
    }
    return null;
  }
}

/**
 * Record liquidity snapshot for tracking changes
 */
function recordSnapshot(chainId: number, tokenAddress: string, liquidityUsd: number) {
  const key = `${chainId}:${tokenAddress.toLowerCase()}`;
  const now = Date.now();

  if (!liquidityHistory.has(key)) {
    liquidityHistory.set(key, []);
  }

  const history = liquidityHistory.get(key)!;

  // Add current snapshot
  history.push({ usd: liquidityUsd, timestamp: now });

  // Clean up old snapshots (older than 15 minutes)
  const cutoff = now - 15 * 60 * 1000;
  const filtered = history.filter((s) => s.timestamp > cutoff);
  liquidityHistory.set(key, filtered);
}

/**
 * Calculate liquidity change percentage
 */
function calculateLiquidityChange(chainId: number, tokenAddress: string, currentUsd: number): {
  percentageChange: number;
  previousUsd: number;
} {
  const key = `${chainId}:${tokenAddress.toLowerCase()}`;
  const history = liquidityHistory.get(key) || [];
  const now = Date.now();
  const windowStart = now - HISTORY_WINDOW_MS;

  // Find oldest snapshot within the window
  const oldSnapshots = history.filter((s) => s.timestamp < windowStart);

  if (oldSnapshots.length === 0) {
    // Not enough history - use oldest available or current
    const oldest = history[0];
    if (oldest && oldest.usd > 0) {
      const percentageChange = ((currentUsd - oldest.usd) / oldest.usd) * 100;
      return { percentageChange, previousUsd: oldest.usd };
    }
    return { percentageChange: 0, previousUsd: currentUsd };
  }

  // Use the oldest snapshot before the window
  const baseline = oldSnapshots[oldSnapshots.length - 1];
  const percentageChange = ((currentUsd - baseline.usd) / baseline.usd) * 100;

  return { percentageChange, previousUsd: baseline.usd };
}

/**
 * Check for liquidity drop signal
 */
export async function checkLiquidityDrop(
  chainId: number,
  tokenAddress: string
): Promise<LiquidityDropSignal | null> {
  const cacheKey = `liquidity:${chainId}:${tokenAddress.toLowerCase()}`;

  // Check cache first
  const cached = await cache.get<LiquidityDropSignal>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // Fetch current liquidity
    const pair = await fetchLiquidity(chainId, tokenAddress);

    if (!pair || !pair.liquidity?.usd) {
      return null;
    }

    const currentUsd = pair.liquidity.usd;

    // Record snapshot
    recordSnapshot(chainId, tokenAddress, currentUsd);

    // Calculate change
    const { percentageChange, previousUsd } = calculateLiquidityChange(
      chainId,
      tokenAddress,
      currentUsd
    );

    // Determine if significant drop detected
    const detected = percentageChange <= LIQUIDITY_DROP_THRESHOLD;

    const signal: LiquidityDropSignal = {
      detected,
      percentageChange: Math.round(percentageChange * 100) / 100,
      window: '10m',
      previousUsd,
      currentUsd,
      timestamp: Date.now(),
    };

    // Cache the result
    await cache.set(cacheKey, signal, CACHE_TTL.LIQUIDITY);

    return signal;
  } catch (err) {
    console.error('[Liquidity] Check error:', err);
    return null;
  }
}

/**
 * Get liquidity stats for a token (for debugging/monitoring)
 */
export function getLiquidityHistory(chainId: number, tokenAddress: string) {
  const key = `${chainId}:${tokenAddress.toLowerCase()}`;
  return liquidityHistory.get(key) || [];
}

export default { checkLiquidityDrop, getLiquidityHistory };
