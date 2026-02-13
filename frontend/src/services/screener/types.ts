/**
 * Screener v2 shared types
 */

/** Supported screener chains */
export const SCREENER_CHAINS = [1, 56, 137, 42161] as const;
export type ScreenerChainId = (typeof SCREENER_CHAINS)[number];

export const CHAIN_LABELS: Record<ScreenerChainId, string> = {
  1: 'Ethereum',
  56: 'BSC',
  137: 'Polygon',
  42161: 'Arbitrum',
};

/** Token data from CoinGecko markets endpoint */
export interface ScreenerToken {
  id: string;             // CoinGecko id
  symbol: string;
  name: string;
  image?: string;
  currentPrice: number;
  priceChange24h: number; // percent
  priceChange1h?: number;
  volume24h: number;
  marketCap: number;
  fdv?: number;
  chainId: ScreenerChainId;
  contractAddress?: string;
  // Enrichment (on-demand)
  trendingScore?: number;
  riskLevel?: 'safe' | 'warning' | 'risk' | 'unknown';
}

/** Filter state persisted in localStorage per chain */
export interface ScreenerFilters {
  search: string;
  minVolume: number;       // 0 = disabled
  changeMin: number;       // -100
  changeMax: number;       // 1000
  priceMin: number;        // 0 = disabled
  priceMax: number;        // 0 = disabled
  hideStablecoins: boolean;
  hideWrapped: boolean;
  onlySafe: boolean;       // exclude honeypots / proxy / blacklisted
}

export const DEFAULT_FILTERS: ScreenerFilters = {
  search: '',
  minVolume: 0,
  changeMin: -100,
  changeMax: 1000,
  priceMin: 0,
  priceMax: 0,
  hideStablecoins: false,
  hideWrapped: false,
  onlySafe: false,
};

/** Sort options */
export type SortField = 'volume24h' | 'priceChange24h' | 'marketCap' | 'currentPrice' | 'trendingScore';
export type SortDir = 'asc' | 'desc';

/** DexScreener enrichment data */
export interface DexScreenerData {
  priceUsd: number;
  liquidity: number;
  fdv: number;
  volume24h: number;
  priceChange1h?: number;
  priceChange6h?: number;
  priceChange24h?: number;
  pairAddress?: string;
  dexName?: string;
  fetchedAt: number;
}

/** Stablecoin / wrapped token symbols for filtering */
export const STABLECOIN_SYMBOLS = new Set([
  'USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FDUSD', 'FRAX', 'LUSD',
  'USDD', 'GUSD', 'USDP', 'PYUSD', 'CRVUSD', 'GHO', 'USDS',
]);

export const WRAPPED_SYMBOLS = new Set([
  'WETH', 'WBNB', 'WMATIC', 'WBTC', 'BTCB', 'WARB',
]);
