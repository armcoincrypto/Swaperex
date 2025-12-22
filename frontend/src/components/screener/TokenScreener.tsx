/**
 * Token Screener Component
 *
 * READ-ONLY price screener for ETH & BSC tokens.
 * Shows prices, 24h changes, and allows quick swap prefill.
 *
 * SECURITY: No swap logic - only price data from CoinGecko.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getTokens, type Token, NATIVE_SYMBOLS } from '@/tokens';
import { formatBalance } from '@/utils/format';

// CoinGecko API
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// Token ID mappings for CoinGecko
const COINGECKO_IDS: Record<string, string> = {
  // Ethereum
  ETH: 'ethereum',
  WETH: 'weth',
  USDT: 'tether',
  USDC: 'usd-coin',
  DAI: 'dai',
  WBTC: 'wrapped-bitcoin',
  LINK: 'chainlink',
  UNI: 'uniswap',
  AAVE: 'aave',
  MKR: 'maker',
  SHIB: 'shiba-inu',
  PEPE: 'pepe',
  ARB: 'arbitrum',
  OP: 'optimism',
  LDO: 'lido-dao',
  // BSC
  BNB: 'binancecoin',
  WBNB: 'wbnb',
  CAKE: 'pancakeswap-token',
  BUSD: 'binance-usd',
  FDUSD: 'first-digital-usd',
  XVS: 'venus',
  BAKE: 'bakerytoken',
};

interface TokenData {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  logoURI?: string;
  chainId: number;
}

interface TokenScreenerProps {
  onSwapSelect?: (fromSymbol: string, toSymbol: string, chainId: number) => void;
}

export function TokenScreener({ onSwapSelect }: TokenScreenerProps) {
  const [chain, setChain] = useState<1 | 56>(1); // ETH or BSC
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'price' | 'change24h' | 'volume24h'>('volume24h');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Get tokens for selected chain
  const chainTokens = useMemo(() => {
    return getTokens(chain).slice(0, 20); // Top 20 tokens
  }, [chain]);

  // Fetch prices from CoinGecko
  const fetchPrices = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get CoinGecko IDs for chain tokens
      const tokenIds = chainTokens
        .map((t) => COINGECKO_IDS[t.symbol])
        .filter(Boolean);

      if (tokenIds.length === 0) {
        setTokens([]);
        setIsLoading(false);
        return;
      }

      const idsParam = tokenIds.join(',');
      const response = await fetch(
        `${COINGECKO_API}/coins/markets?vs_currency=usd&ids=${idsParam}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`
      );

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limited - please wait a moment');
        }
        throw new Error('Failed to fetch prices');
      }

      const data = await response.json();

      // Map CoinGecko data to our token format
      const tokenData: TokenData[] = chainTokens
        .map((token) => {
          const cgId = COINGECKO_IDS[token.symbol];
          const cgData = data.find((d: { id: string }) => d.id === cgId);

          if (!cgData) return null;

          return {
            symbol: token.symbol,
            name: token.name,
            price: cgData.current_price || 0,
            change24h: cgData.price_change_percentage_24h || 0,
            volume24h: cgData.total_volume || 0,
            marketCap: cgData.market_cap || 0,
            logoURI: token.logoURI || cgData.image,
            chainId: chain,
          };
        })
        .filter((t): t is TokenData => t !== null);

      setTokens(tokenData);
    } catch (err) {
      console.error('[Screener] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load prices');
    } finally {
      setIsLoading(false);
    }
  }, [chainTokens, chain]);

  // Fetch on mount and chain change
  useEffect(() => {
    fetchPrices();

    // Refresh every 60 seconds
    const interval = setInterval(fetchPrices, 60000);
    return () => clearInterval(interval);
  }, [fetchPrices]);

  // Sort tokens
  const sortedTokens = useMemo(() => {
    return [...tokens].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [tokens, sortBy, sortDir]);

  // Handle sort click
  const handleSort = (column: 'price' | 'change24h' | 'volume24h') => {
    if (sortBy === column) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(column);
      setSortDir('desc');
    }
  };

  // Handle swap button click
  const handleSwapClick = (token: TokenData) => {
    const stablecoin = chain === 1 ? 'USDT' : 'USDT';
    onSwapSelect?.(token.symbol, stablecoin, token.chainId);
  };

  // Format volume
  const formatVolume = (vol: number): string => {
    if (vol >= 1e9) return `$${(vol / 1e9).toFixed(2)}B`;
    if (vol >= 1e6) return `$${(vol / 1e6).toFixed(2)}M`;
    if (vol >= 1e3) return `$${(vol / 1e3).toFixed(2)}K`;
    return `$${vol.toFixed(2)}`;
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Token Screener</h2>
          <p className="text-dark-400 text-sm mt-1">Top tokens by volume</p>
        </div>

        {/* Chain Selector */}
        <div className="flex gap-2">
          <button
            onClick={() => setChain(1)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              chain === 1
                ? 'bg-primary-600 text-white'
                : 'bg-dark-800 text-dark-400 hover:text-white'
            }`}
          >
            Ethereum
          </button>
          <button
            onClick={() => setChain(56)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              chain === 56
                ? 'bg-yellow-500 text-black'
                : 'bg-dark-800 text-dark-400 hover:text-white'
            }`}
          >
            BSC
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-4 text-red-400">
          {error}
          <button
            onClick={fetchPrices}
            className="ml-4 text-sm underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Token Table */}
      <div className="bg-dark-900 rounded-xl border border-dark-800 overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-3 bg-dark-800/50 text-sm font-medium text-dark-400">
          <div>Token</div>
          <div
            className="cursor-pointer hover:text-white flex items-center gap-1"
            onClick={() => handleSort('price')}
          >
            Price
            {sortBy === 'price' && <SortIcon dir={sortDir} />}
          </div>
          <div
            className="cursor-pointer hover:text-white flex items-center gap-1"
            onClick={() => handleSort('change24h')}
          >
            24h %
            {sortBy === 'change24h' && <SortIcon dir={sortDir} />}
          </div>
          <div
            className="cursor-pointer hover:text-white flex items-center gap-1"
            onClick={() => handleSort('volume24h')}
          >
            Volume
            {sortBy === 'volume24h' && <SortIcon dir={sortDir} />}
          </div>
          <div className="text-right">Action</div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="px-4 py-8 text-center text-dark-400">
            <LoadingSpinner />
            <p className="mt-2">Loading prices...</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && sortedTokens.length === 0 && !error && (
          <div className="px-4 py-8 text-center text-dark-400">
            No token data available
          </div>
        )}

        {/* Token Rows */}
        {!isLoading &&
          sortedTokens.map((token) => (
            <div
              key={token.symbol}
              className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-3 border-t border-dark-800 hover:bg-dark-800/30 transition-colors"
            >
              {/* Token Info */}
              <div className="flex items-center gap-3">
                {token.logoURI ? (
                  <img
                    src={token.logoURI}
                    alt={token.symbol}
                    className="w-8 h-8 rounded-full"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center text-sm font-bold">
                    {token.symbol[0]}
                  </div>
                )}
                <div>
                  <div className="font-medium">{token.symbol}</div>
                  <div className="text-xs text-dark-400 truncate max-w-[120px]">
                    {token.name}
                  </div>
                </div>
              </div>

              {/* Price */}
              <div className="flex items-center">
                ${token.price < 0.01
                  ? token.price.toFixed(6)
                  : token.price < 1
                  ? token.price.toFixed(4)
                  : formatBalance(token.price.toString(), 2)}
              </div>

              {/* 24h Change */}
              <div
                className={`flex items-center ${
                  token.change24h > 0
                    ? 'text-green-400'
                    : token.change24h < 0
                    ? 'text-red-400'
                    : 'text-dark-400'
                }`}
              >
                {token.change24h > 0 ? '+' : ''}
                {token.change24h.toFixed(2)}%
              </div>

              {/* Volume */}
              <div className="flex items-center text-dark-300">
                {formatVolume(token.volume24h)}
              </div>

              {/* Action */}
              <div className="flex items-center justify-end">
                <button
                  onClick={() => handleSwapClick(token)}
                  className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Swap
                </button>
              </div>
            </div>
          ))}
      </div>

      {/* Refresh Note */}
      <div className="mt-4 text-center text-xs text-dark-500">
        Prices refresh every 60 seconds • Data from CoinGecko
      </div>
    </div>
  );
}

// Sort Icon
function SortIcon({ dir }: { dir: 'asc' | 'desc' }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform ${dir === 'asc' ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// Loading Spinner
function LoadingSpinner() {
  return (
    <svg
      className="animate-spin w-6 h-6 mx-auto text-dark-400"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export default TokenScreener;
