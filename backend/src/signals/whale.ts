/**
 * Whale Transfer Signal Service
 *
 * Detects large token transfers (> threshold USD value).
 * Uses DexScreener data for volume/transaction analysis.
 *
 * Note: For production, consider using dedicated whale tracking APIs
 * like Whale Alert or blockchain indexers for real-time data.
 */

import axios from 'axios';
import cache, { CACHE_TTL } from '../cache/redis.js';
import type { WhaleTransferSignal, DexScreenerResponse } from './types.js';

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

// Whale thresholds per chain (USD)
const WHALE_THRESHOLDS: Record<number, number> = {
  1: 500000, // $500K on Ethereum
  56: 100000, // $100K on BSC
  137: 100000, // $100K on Polygon
  42161: 250000, // $250K on Arbitrum
  10: 250000, // $250K on Optimism
  43114: 100000, // $100K on Avalanche
  250: 50000, // $50K on Fantom
  8453: 250000, // $250K on Base
};

// Default threshold
const DEFAULT_THRESHOLD = 100000; // $100K

/**
 * Analyze trading activity for whale movements
 *
 * This is a simplified heuristic based on:
 * - Large single transactions in recent period
 * - Buy/sell imbalance in transaction counts
 */
async function analyzeWhaleActivity(
  chainId: number,
  tokenAddress: string
): Promise<WhaleTransferSignal | null> {
  const chainName = CHAIN_NAMES[chainId];
  if (!chainName) {
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

    // Find the pair on the correct chain
    const chainPairs = response.data.pairs.filter((p) => p.chainId === chainName);
    if (chainPairs.length === 0) {
      return null;
    }

    // Sort by liquidity
    chainPairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    const pair = chainPairs[0];

    const threshold = WHALE_THRESHOLDS[chainId] || DEFAULT_THRESHOLD;

    // Get 1-hour volume and transaction counts
    const h1Volume = pair.volume?.h1 || 0;
    const h1Txns = pair.txns?.h1 || { buys: 0, sells: 0 };
    const totalTxns = h1Txns.buys + h1Txns.sells;

    // No transactions = no whale activity
    if (totalTxns === 0 || h1Volume === 0) {
      return {
        detected: false,
        amountUsd: 0,
        direction: 'unknown',
        timestamp: Date.now(),
      };
    }

    // Calculate average transaction size
    const avgTxSize = h1Volume / totalTxns;

    // If average transaction size is above threshold, potential whale activity
    // This is a heuristic - real whale tracking needs blockchain indexing
    if (avgTxSize >= threshold) {
      // Determine direction based on buy/sell imbalance
      let direction: 'in' | 'out' | 'unknown' = 'unknown';
      if (h1Txns.buys > h1Txns.sells * 1.5) {
        direction = 'in'; // More buys than sells
      } else if (h1Txns.sells > h1Txns.buys * 1.5) {
        direction = 'out'; // More sells than buys
      }

      return {
        detected: true,
        amountUsd: Math.round(avgTxSize),
        direction,
        timestamp: Date.now(),
      };
    }

    // Also check for very high volume relative to liquidity (potential whale)
    const liquidity = pair.liquidity?.usd || 0;
    if (liquidity > 0 && h1Volume > liquidity * 0.5) {
      // Volume is more than 50% of liquidity in 1 hour - significant activity
      const direction: 'in' | 'out' | 'unknown' =
        h1Txns.buys > h1Txns.sells ? 'in' :
        h1Txns.sells > h1Txns.buys ? 'out' : 'unknown';

      return {
        detected: true,
        amountUsd: Math.round(h1Volume),
        direction,
        timestamp: Date.now(),
      };
    }

    // No whale activity detected
    return {
      detected: false,
      amountUsd: 0,
      direction: 'unknown',
      timestamp: Date.now(),
    };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.warn(`[Whale] API error: ${err.message}`);
    }
    return null;
  }
}

/**
 * Check for whale transfer signal
 */
export async function checkWhaleTransfer(
  chainId: number,
  tokenAddress: string
): Promise<WhaleTransferSignal | null> {
  const cacheKey = `whale:${chainId}:${tokenAddress.toLowerCase()}`;

  // Check cache first
  const cached = await cache.get<WhaleTransferSignal>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const signal = await analyzeWhaleActivity(chainId, tokenAddress);

    if (signal) {
      // Cache the result
      await cache.set(cacheKey, signal, CACHE_TTL.WHALE);
    }

    return signal;
  } catch (err) {
    console.error('[Whale] Check error:', err);
    return null;
  }
}

export default { checkWhaleTransfer };
