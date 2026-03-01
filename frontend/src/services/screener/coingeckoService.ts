/**
 * CoinGecko Markets Service for Screener
 *
 * Fetches top tokens by market cap via backend-signals proxy.
 * The proxy bypasses browser CORS restrictions on CoinGecko.
 * Uses two-layer caching. On 429, returns cached data with a warning.
 *
 * READ-ONLY: No auth required (free tier).
 */

import { cacheGet, cacheSet } from './cache';
import type { ScreenerToken, ScreenerChainId } from './types';

// Backend-signals proxy (server-side CoinGecko fetch → no CORS)
const PROXY_BASE = import.meta.env.VITE_SIGNALS_API_URL || 'http://207.180.212.142:4001';
const CACHE_TTL = 60_000; // 1 minute success

// CoinGecko category IDs per chain
const CHAIN_CATEGORIES: Record<ScreenerChainId, string> = {
  1: 'ethereum-ecosystem',
  56: 'binance-smart-chain',
  137: 'polygon-ecosystem',
  42161: 'arbitrum-ecosystem',
};

// Map of known token symbol → CoinGecko ID (extend as needed)
const KNOWN_IDS: Record<string, string> = {
  ethereum: 'ETH', binancecoin: 'BNB', 'matic-network': 'MATIC',
  tether: 'USDT', 'usd-coin': 'USDC', dai: 'DAI',
  'binance-usd': 'BUSD', 'first-digital-usd': 'FDUSD',
  weth: 'WETH', wbnb: 'WBNB', 'wrapped-bitcoin': 'WBTC',
  'bitcoin-bep2': 'BTCB', chainlink: 'LINK', uniswap: 'UNI',
  aave: 'AAVE', maker: 'MKR', 'lido-dao': 'LDO',
  arbitrum: 'ARB', 'curve-dao-token': 'CRV',
  'pancakeswap-token': 'CAKE', ripple: 'XRP', dogecoin: 'DOGE',
  cardano: 'ADA', polkadot: 'DOT', 'shiba-inu': 'SHIB', pepe: 'PEPE',
  bitcoin: 'BTC', solana: 'SOL', avalanche: 'AVAX',
};

export interface FetchResult {
  tokens: ScreenerToken[];
  fromCache: boolean;
  rateLimited: boolean;
}

/**
 * Fetch top market tokens for a chain via backend proxy.
 * Fetches up to `perPage` tokens (max 250).
 */
export async function fetchMarketTokens(
  chainId: ScreenerChainId,
  perPage: number = 100,
  signal?: AbortSignal,
): Promise<FetchResult> {
  const cacheKey = `markets:${chainId}:${perPage}`;
  const cached = cacheGet<ScreenerToken[]>(cacheKey);

  try {
    const category = CHAIN_CATEGORIES[chainId];
    const url = `${PROXY_BASE}/coingecko/markets?category=${category}&per_page=${perPage}&page=1`;

    const res = await fetch(url, { signal });

    if (res.status === 429) {
      if (cached) {
        return { tokens: cached, fromCache: true, rateLimited: true };
      }
      throw new Error('Rate limited and no cached data');
    }

    if (!res.ok) {
      throw new Error(`CoinGecko HTTP ${res.status}`);
    }

    const data: CoinGeckoMarketItem[] = await res.json();

    const tokens: ScreenerToken[] = data.map((item) => ({
      id: item.id,
      symbol: (KNOWN_IDS[item.id] || item.symbol).toUpperCase(),
      name: item.name,
      image: item.image,
      currentPrice: item.current_price ?? 0,
      priceChange24h: item.price_change_percentage_24h ?? 0,
      priceChange1h: item.price_change_percentage_1h_in_currency ?? undefined,
      volume24h: item.total_volume ?? 0,
      marketCap: item.market_cap ?? 0,
      fdv: item.fully_diluted_valuation ?? undefined,
      chainId,
    }));

    cacheSet(cacheKey, tokens, CACHE_TTL);
    return { tokens, fromCache: false, rateLimited: false };
  } catch (err) {
    // On any failure, try cache
    if (cached) {
      return { tokens: cached, fromCache: true, rateLimited: false };
    }
    throw err;
  }
}

/** CoinGecko /coins/markets response item (subset) */
interface CoinGeckoMarketItem {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  current_price: number | null;
  market_cap: number | null;
  total_volume: number | null;
  price_change_percentage_24h: number | null;
  price_change_percentage_1h_in_currency?: number | null;
  fully_diluted_valuation?: number | null;
}
