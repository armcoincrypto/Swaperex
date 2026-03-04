/**
 * Token Screener v2
 *
 * READ-ONLY price screener with Basic / Advanced mode toggle.
 * Basic: simple table like v1.
 * Advanced: filters, trending scores, watchlist, expandable details.
 *
 * SECURITY: No swap logic - only price data from CoinGecko.
 * DexScreener + GoPlus fetched on-demand for expanded rows only.
 */

import { useCallback } from 'react';
import { useScreener } from '@/hooks/useScreener';
import { useUsageStore } from '@/stores/usageStore';
import { TierBadge } from '@/components/common/TierBadge';
import { ScreenerFilters } from './ScreenerFilters';
import { ScreenerTable } from './ScreenerTable';
import {
  SCREENER_CHAINS,
  CHAIN_LABELS,
} from '@/services/screener/types';
import type { ScreenerToken, ScreenerChainId, SortField } from '@/services/screener/types';

interface TokenScreenerProps {
  onSwapSelect?: (fromSymbol: string, toSymbol: string, chainId: number) => void;
}

const CHAIN_STYLES: Record<ScreenerChainId, { active: string }> = {
  1: { active: 'bg-primary-600 text-white' },
  56: { active: 'bg-yellow-500 text-black' },
  137: { active: 'bg-purple-500 text-white' },
  42161: { active: 'bg-blue-500 text-white' },
};

export function TokenScreener({ onSwapSelect }: TokenScreenerProps) {
  const {
    tokens,
    rawCount,
    mode,
    chainId,
    sortField,
    sortDir,
    filters,
    isLoading,
    error,
    fromCache,
    rateLimited,
    lastUpdated,
    countdown,
    expandedTokenId,
    setMode,
    setChainId,
    setSort,
    setFilters,
    resetFilters,
    setExpandedTokenId,
    refresh,
  } = useScreener();

  const { trackEvent } = useUsageStore();

  const handleSwap = useCallback(
    (token: ScreenerToken) => {
      const stablecoin = 'USDT';
    onSwapSelect?.(token.symbol, stablecoin, token.chainId);
    trackEvent('screener_used');
    },
    [onSwapSelect, trackEvent],
  );

  const handleSort = useCallback(
    (field: SortField) => setSort(field),
    [setSort],
  );

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold">Token Screener</h2>
            <TierBadge tier="advanced" />
          </div>
          <p className="text-dark-400 text-sm mt-1">
            {mode === 'basic' ? 'Top tokens by volume' : `${tokens.length} tokens matching filters`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Mode toggle */}
          <div className="flex bg-dark-800 rounded-lg overflow-hidden text-sm">
          <button
              onClick={() => setMode('basic')}
              className={`px-3 py-1.5 transition-colors ${mode === 'basic' ? 'bg-primary-600 text-white' : 'text-dark-400 hover:text-white'}`}
            >
              Basic
          </button>
          <button
              onClick={() => setMode('advanced')}
              className={`px-3 py-1.5 transition-colors ${mode === 'advanced' ? 'bg-primary-600 text-white' : 'text-dark-400 hover:text-white'}`}
            >
              Advanced
            </button>
          </div>

          {/* Chain selector */}
          <div className="flex gap-1">
            {SCREENER_CHAINS.map((cid) => (
              <button
                key={cid}
                onClick={() => setChainId(cid)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  chainId === cid
                    ? CHAIN_STYLES[cid].active
                : 'bg-dark-800 text-dark-400 hover:text-white'
            }`}
          >
                {CHAIN_LABELS[cid]}
          </button>
            ))}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4 text-xs text-dark-500">
        {/* Last updated + countdown */}
        {lastUpdated && (
          <span>
            Updated {new Date(lastUpdated).toLocaleTimeString()} · Next in {countdown}s
          </span>
        )}

        {/* Source badges */}
        <span className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${rateLimited ? 'bg-yellow-500' : 'bg-green-500'}`} />
          CoinGecko
        </span>
        {mode === 'advanced' && (
          <>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              DexScreener
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              GoPlus
            </span>
          </>
        )}

        {/* Cache / rate limit warnings */}
        {fromCache && (
          <span className="text-yellow-500">Using cached data</span>
        )}
        {rateLimited && (
          <span className="text-yellow-500">Rate limited</span>
        )}

        {/* Refresh button */}
        <button
          onClick={refresh}
          disabled={isLoading}
          className="text-dark-400 hover:text-white transition-colors disabled:opacity-50 ml-auto"
          title="Refresh now"
        >
          <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-4 text-red-400 text-sm">
          {error}
          <button onClick={refresh} className="ml-4 underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {/* Filters (Advanced mode only) */}
      {mode === 'advanced' && (
        <ScreenerFilters
          filters={filters}
          onChange={setFilters}
          onReset={resetFilters}
          tokenCount={tokens.length}
          totalCount={rawCount}
        />
      )}

      {/* Sort dropdown for Advanced mode (trending) */}
      {mode === 'advanced' && (
        <div className="flex items-center gap-2 mb-3">
          <label className="text-xs text-dark-400">Sort by:</label>
          <select
            value={sortField}
            onChange={(e) => setSort(e.target.value as SortField, sortDir)}
            className="bg-dark-800 border border-dark-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-primary-500"
          >
            <option value="volume24h">Volume (24h)</option>
            <option value="priceChange24h">Price Change (24h)</option>
            <option value="marketCap">Market Cap</option>
            <option value="currentPrice">Price</option>
            <option value="trendingScore">Trending Score</option>
          </select>
          <span className="text-xs text-dark-500" title="Composite score from volume + momentum + liquidity">
            {sortField === 'trendingScore' && 'Composite score from volume + momentum + market cap'}
          </span>
          </div>
        )}

      {/* Table */}
      <ScreenerTable
        tokens={tokens}
        isAdvanced={mode === 'advanced'}
        sortField={sortField}
        sortDir={sortDir}
        expandedTokenId={expandedTokenId}
        onSort={handleSort}
        onToggleExpand={setExpandedTokenId}
        onSwap={handleSwap}
        isLoading={isLoading}
      />

      {/* Footer */}
      <div className="mt-4 text-center text-xs text-dark-500">
        Prices refresh every 60 seconds · Data from CoinGecko
        {mode === 'advanced' && ' · DexScreener + GoPlus on expand'}
      </div>
    </div>
  );
}

export default TokenScreener;
