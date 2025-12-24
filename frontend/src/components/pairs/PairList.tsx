/**
 * Pair List Component
 *
 * Main panel showing trending pairs from Dexscreener.
 * Includes chain filtering, refresh, and search.
 */

import { useEffect, useState, useMemo } from 'react';
import { usePairStore, type TrendingPair } from '@/stores/pairStore';
import { PairItem } from './PairItem';
import { SUPPORTED_CHAIN_IDS, getChainDisplayName } from '@/services/pairDiscovery';

interface PairListProps {
  onPairClick: (pair: TrendingPair) => void;
}

type SortOption = 'volume24h' | 'volume1h' | 'liquidity' | 'priceChange24h' | 'hot';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'hot', label: 'Hot' },
  { value: 'volume24h', label: 'Volume 24h' },
  { value: 'volume1h', label: 'Volume 1h' },
  { value: 'liquidity', label: 'Liquidity' },
  { value: 'priceChange24h', label: 'Price Change' },
];

const CHAIN_OPTIONS = [
  { value: null, label: 'All Chains' },
  ...Object.entries(SUPPORTED_CHAIN_IDS).map(([_name, id]) => ({
    value: id,
    label: getChainDisplayName(id),
  })),
];

export function PairList({ onPairClick }: PairListProps) {
  const {
    pairs,
    viewedPairIds,
    isLoading,
    error,
    lastFetched,
    selectedChain,
    fetchPairs,
    markAsViewed,
    markAllAsViewed,
    setSelectedChain,
    getUnviewedCount,
  } = usePairStore();

  const [sortBy, setSortBy] = useState<SortOption>('hot');
  const [searchQuery, setSearchQuery] = useState('');

  const unviewedCount = getUnviewedCount();

  // Fetch pairs on mount if stale (older than 5 minutes)
  useEffect(() => {
    const fiveMinutes = 5 * 60 * 1000;
    if (Date.now() - lastFetched > fiveMinutes) {
      fetchPairs();
    }
  }, [lastFetched, fetchPairs]);

  // Filter and sort pairs
  const displayedPairs = useMemo(() => {
    let filtered = pairs;

    // Filter by chain
    if (selectedChain !== null) {
      filtered = filtered.filter((p) => p.chainId === selectedChain);
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.baseToken.symbol.toLowerCase().includes(query) ||
          p.baseToken.name.toLowerCase().includes(query) ||
          p.baseToken.address.toLowerCase().includes(query)
      );
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'hot':
          // Hot first, then by volume
          if (a.isHot && !b.isHot) return -1;
          if (!a.isHot && b.isHot) return 1;
          return b.volume.h24 - a.volume.h24;
        case 'volume24h':
          return b.volume.h24 - a.volume.h24;
        case 'volume1h':
          return b.volume.h1 - a.volume.h1;
        case 'liquidity':
          return b.liquidity.usd - a.liquidity.usd;
        case 'priceChange24h':
          return Math.abs(b.priceChange.h24) - Math.abs(a.priceChange.h24);
        default:
          return 0;
      }
    });

    return sorted;
  }, [pairs, selectedChain, searchQuery, sortBy]);

  const handlePairClick = (pair: TrendingPair) => {
    markAsViewed(pair.id);
    onPairClick(pair);
  };

  const handleRefresh = () => {
    fetchPairs();
  };

  // Format last fetched time
  const getLastFetchedText = () => {
    if (!lastFetched) return 'Never';
    const diff = Date.now() - lastFetched;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Trending Pairs</h2>
          {unviewedCount > 0 && (
            <span className="px-2 py-0.5 bg-primary-600 text-white text-sm font-medium rounded-full">
              {unviewedCount} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-dark-400">
            Updated: {getLastFetchedText()}
          </span>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-800 hover:bg-dark-700 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            <RefreshIcon spinning={isLoading} />
            <span>Refresh</span>
          </button>
          {unviewedCount > 0 && (
            <button
              onClick={markAllAsViewed}
              className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
            >
              Mark all viewed
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search by token name or symbol..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 bg-dark-800 rounded-lg text-sm outline-none focus:ring-1 focus:ring-primary-500 border border-dark-700"
          />
        </div>

        {/* Chain filter */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {CHAIN_OPTIONS.map((option) => (
            <button
              key={option.value ?? 'all'}
              onClick={() => setSelectedChain(option.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                selectedChain === option.value
                  ? 'bg-primary-600 text-white'
                  : 'bg-dark-800 text-dark-300 hover:bg-dark-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="px-3 py-2 bg-dark-800 rounded-lg text-sm border border-dark-700 outline-none cursor-pointer"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              Sort: {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-800 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoading && pairs.length === 0 && (
        <div className="text-center py-16">
          <div className="inline-flex items-center gap-3 text-dark-400">
            <RefreshIcon spinning />
            <span>Loading trending pairs...</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && displayedPairs.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">📊</div>
          <h3 className="text-xl font-bold mb-2">No pairs found</h3>
          <p className="text-dark-400 max-w-md mx-auto">
            {searchQuery
              ? 'Try a different search term.'
              : 'Click refresh to load trending pairs from Dexscreener.'}
          </p>
          <button
            onClick={handleRefresh}
            className="mt-4 px-4 py-2 bg-primary-600 hover:bg-primary-500 rounded-lg text-sm font-medium transition-colors"
          >
            Load Trending Pairs
          </button>
        </div>
      )}

      {/* Pairs grid */}
      {displayedPairs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayedPairs.map((pair) => (
            <PairItem
              key={pair.id}
              pair={pair}
              isNew={!viewedPairIds.has(pair.id)}
              onClick={handlePairClick}
            />
          ))}
        </div>
      )}

      {/* Stats footer */}
      {pairs.length > 0 && (
        <div className="mt-8 p-4 bg-dark-800 rounded-xl text-center">
          <p className="text-xs text-dark-400">
            Showing {displayedPairs.length} of {pairs.length} pairs from Dexscreener.
            <br />
            Pairs with liquidity &gt; $50k and 24h volume &gt; $10k.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Refresh icon with optional spinning animation
 */
function RefreshIcon({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg
      className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

export default PairList;
