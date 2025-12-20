/**
 * Price Service
 *
 * PHASE 13: Fetches token prices from aggregators.
 * Uses CoinGecko for EVM tokens, Jupiter for Solana.
 *
 * SECURITY: Read-only API calls, no authentication required.
 */

import {
  type TokenBalance,
  type ChainBalance,
  logPortfolioLifecycle,
} from './portfolioTypes';
import { JUPITER_CONFIG } from '@/config/dex';

/**
 * CoinGecko API base URL (free tier)
 */
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

/**
 * Jupiter Price API
 */
const JUPITER_PRICE_API = JUPITER_CONFIG.priceApi || 'https://api.jup.ag/price/v2';

/**
 * Token ID mappings for CoinGecko
 * Maps symbol -> coingecko id
 */
const COINGECKO_IDS: Record<string, string> = {
  // Native tokens
  ETH: 'ethereum',
  BNB: 'binancecoin',
  MATIC: 'matic-network',
  // Major tokens
  USDT: 'tether',
  USDC: 'usd-coin',
  DAI: 'dai',
  WBTC: 'wrapped-bitcoin',
  WETH: 'weth',
  LINK: 'chainlink',
  UNI: 'uniswap',
  AAVE: 'aave',
  CRV: 'curve-dao-token',
  SUSHI: 'sushi',
  COMP: 'compound-governance-token',
  MKR: 'maker',
  SNX: 'synthetix-network-token',
  // BSC tokens
  CAKE: 'pancakeswap-token',
  BUSD: 'binance-usd',
  // Common tokens
  SHIB: 'shiba-inu',
  PEPE: 'pepe',
};

/**
 * Price cache to avoid rate limiting
 */
const priceCache: Record<string, { price: number; timestamp: number }> = {};
const CACHE_TTL = 60000; // 1 minute

/**
 * Get cached price if available
 */
function getCachedPrice(key: string): number | null {
  const cached = priceCache[key];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.price;
  }
  return null;
}

/**
 * Set price in cache
 */
function setCachedPrice(key: string, price: number): void {
  priceCache[key] = { price, timestamp: Date.now() };
}

/**
 * Fetch prices from CoinGecko for multiple tokens
 */
async function fetchCoinGeckoPrices(
  symbols: string[]
): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};

  // Filter to known symbols and check cache
  const toFetch: string[] = [];
  for (const symbol of symbols) {
    const cachedPrice = getCachedPrice(`cg:${symbol}`);
    if (cachedPrice !== null) {
      prices[symbol] = cachedPrice;
    } else if (COINGECKO_IDS[symbol]) {
      toFetch.push(symbol);
    }
  }

  if (toFetch.length === 0) {
    return prices;
  }

  try {
    const ids = toFetch.map((s) => COINGECKO_IDS[s]).join(',');
    const response = await fetch(
      `${COINGECKO_API}/simple/price?ids=${ids}&vs_currencies=usd`
    );

    if (!response.ok) {
      console.warn('[PriceService] CoinGecko rate limited or error:', response.status);
      return prices;
    }

    const data = await response.json();

    for (const symbol of toFetch) {
      const id = COINGECKO_IDS[symbol];
      if (data[id]?.usd) {
        const price = data[id].usd;
        prices[symbol] = price;
        setCachedPrice(`cg:${symbol}`, price);
      }
    }

    logPortfolioLifecycle('CoinGecko prices fetched', {
      requested: toFetch.length,
      received: Object.keys(prices).length,
    });
  } catch (error) {
    console.warn('[PriceService] CoinGecko fetch failed:', error);
  }

  return prices;
}

/**
 * Fetch prices from Jupiter for Solana tokens
 */
async function fetchJupiterPrices(
  mints: string[]
): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};

  // Check cache first
  const toFetch: string[] = [];
  for (const mint of mints) {
    const cachedPrice = getCachedPrice(`jup:${mint}`);
    if (cachedPrice !== null) {
      prices[mint] = cachedPrice;
    } else {
      toFetch.push(mint);
    }
  }

  if (toFetch.length === 0) {
    return prices;
  }

  try {
    const ids = toFetch.join(',');
    const response = await fetch(`${JUPITER_PRICE_API}?ids=${ids}`);

    if (!response.ok) {
      console.warn('[PriceService] Jupiter price error:', response.status);
      return prices;
    }

    const data = await response.json();

    for (const mint of toFetch) {
      if (data.data?.[mint]?.price) {
        const price = parseFloat(data.data[mint].price);
        prices[mint] = price;
        setCachedPrice(`jup:${mint}`, price);
      }
    }

    logPortfolioLifecycle('Jupiter prices fetched', {
      requested: toFetch.length,
      received: Object.keys(prices).length,
    });
  } catch (error) {
    console.warn('[PriceService] Jupiter fetch failed:', error);
  }

  return prices;
}

/**
 * Apply USD prices to token balances
 */
export function applyPricesToBalance(
  balance: TokenBalance,
  prices: Record<string, number>
): TokenBalance {
  const priceKey = balance.chain === 'solana' ? balance.address : balance.symbol;
  const price = prices[priceKey];

  if (price && price > 0) {
    const balanceNum = parseFloat(balance.balanceFormatted);
    const usdValue = (balanceNum * price).toFixed(2);

    return {
      ...balance,
      usdPrice: price.toString(),
      usdValue,
    };
  }

  return balance;
}

/**
 * Apply USD prices to chain balance
 */
export function applyPricesToChainBalance(
  chainBalance: ChainBalance,
  prices: Record<string, number>
): ChainBalance {
  // Apply to native balance
  const nativeBalance = applyPricesToBalance(chainBalance.nativeBalance, prices);

  // Apply to token balances
  const tokenBalances = chainBalance.tokenBalances.map((tb) =>
    applyPricesToBalance(tb, prices)
  );

  // Calculate total USD value
  let totalUsd = 0;
  if (nativeBalance.usdValue) {
    totalUsd += parseFloat(nativeBalance.usdValue);
  }
  for (const tb of tokenBalances) {
    if (tb.usdValue) {
      totalUsd += parseFloat(tb.usdValue);
    }
  }

  return {
    ...chainBalance,
    nativeBalance,
    tokenBalances,
    totalUsdValue: totalUsd.toFixed(2),
  };
}

/**
 * Fetch and apply prices to EVM chain balance
 */
export async function enrichEvmChainBalance(
  chainBalance: ChainBalance
): Promise<ChainBalance> {
  const symbols = [
    chainBalance.nativeBalance.symbol,
    ...chainBalance.tokenBalances.map((tb) => tb.symbol),
  ];

  const prices = await fetchCoinGeckoPrices(symbols);
  return applyPricesToChainBalance(chainBalance, prices);
}

/**
 * Fetch and apply prices to Solana chain balance
 */
export async function enrichSolanaChainBalance(
  chainBalance: ChainBalance
): Promise<ChainBalance> {
  const mints = [
    chainBalance.nativeBalance.address,
    ...chainBalance.tokenBalances.map((tb) => tb.address),
  ];

  const prices = await fetchJupiterPrices(mints);
  return applyPricesToChainBalance(chainBalance, prices);
}

/**
 * Get single token price
 */
export async function getTokenPrice(
  symbol: string,
  chain: 'evm' | 'solana' = 'evm',
  address?: string
): Promise<number | null> {
  if (chain === 'solana' && address) {
    const prices = await fetchJupiterPrices([address]);
    return prices[address] || null;
  }

  const prices = await fetchCoinGeckoPrices([symbol]);
  return prices[symbol] || null;
}

export default {
  fetchCoinGeckoPrices,
  fetchJupiterPrices,
  enrichEvmChainBalance,
  enrichSolanaChainBalance,
  getTokenPrice,
};
