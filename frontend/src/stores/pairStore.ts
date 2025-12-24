/**
 * Pair Store - Zustand store for trending pairs
 *
 * Stores trending pairs in localStorage with deduplication.
 * Tracks viewed pairs to show "new" badges.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  fetchAllChainsPairs,
  fetchTrendingPairsForChain,
  searchPairs,
  type TrendingPair,
} from '@/services/pairDiscovery';

interface PairState {
  pairs: TrendingPair[];
  viewedPairIds: Set<string>;
  lastFetched: number;
  isLoading: boolean;
  error: string | null;
  selectedChain: number | null; // null = all chains

  // Actions
  fetchPairs: () => Promise<void>;
  fetchPairsForChain: (chainName: string) => Promise<void>;
  searchForPairs: (query: string) => Promise<TrendingPair[]>;
  markAsViewed: (pairId: string) => void;
  markAllAsViewed: () => void;
  setSelectedChain: (chainId: number | null) => void;
  getUnviewedCount: () => number;
  getPairsByChain: (chainId: number | null) => TrendingPair[];
  clearPairs: () => void;
}

// Deduplicate pairs by ID
function deduplicatePairs(pairs: TrendingPair[]): TrendingPair[] {
  const seen = new Map<string, TrendingPair>();
  pairs.forEach((pair) => {
    const existing = seen.get(pair.id);
    if (!existing || pair.discoveredAt > existing.discoveredAt) {
      seen.set(pair.id, pair);
    }
  });
  return Array.from(seen.values());
}

export const usePairStore = create<PairState>()(
  persist(
    (set, get) => ({
      pairs: [],
      viewedPairIds: new Set(),
      lastFetched: 0,
      isLoading: false,
      error: null,
      selectedChain: null,

      fetchPairs: async () => {
        set({ isLoading: true, error: null });
        try {
          const newPairs = await fetchAllChainsPairs();
          const existingPairs = get().pairs;

          // Merge and deduplicate
          const allPairs = deduplicatePairs([...newPairs, ...existingPairs]);

          // Keep only the most recent 100 pairs
          const trimmedPairs = allPairs
            .sort((a, b) => b.discoveredAt - a.discoveredAt)
            .slice(0, 100);

          set({
            pairs: trimmedPairs,
            lastFetched: Date.now(),
            isLoading: false,
          });

          console.log(`[PairStore] Fetched ${newPairs.length} pairs, total: ${trimmedPairs.length}`);
        } catch (err) {
          console.error('[PairStore] Fetch error:', err);
          set({
            error: err instanceof Error ? err.message : 'Failed to fetch pairs',
            isLoading: false,
          });
        }
      },

      fetchPairsForChain: async (chainName: string) => {
        set({ isLoading: true, error: null });
        try {
          const newPairs = await fetchTrendingPairsForChain(chainName);
          const existingPairs = get().pairs;

          // Merge and deduplicate
          const allPairs = deduplicatePairs([...newPairs, ...existingPairs]);

          set({
            pairs: allPairs.slice(0, 100),
            lastFetched: Date.now(),
            isLoading: false,
          });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : 'Failed to fetch pairs',
            isLoading: false,
          });
        }
      },

      searchForPairs: async (query: string) => {
        try {
          return await searchPairs(query);
        } catch (err) {
          console.error('[PairStore] Search error:', err);
          return [];
        }
      },

      markAsViewed: (pairId: string) => {
        set((state) => ({
          viewedPairIds: new Set([...state.viewedPairIds, pairId]),
        }));
      },

      markAllAsViewed: () => {
        const allIds = get().pairs.map((p) => p.id);
        set({ viewedPairIds: new Set(allIds) });
      },

      setSelectedChain: (chainId: number | null) => {
        set({ selectedChain: chainId });
      },

      getUnviewedCount: () => {
        const { pairs, viewedPairIds } = get();
        return pairs.filter((p) => !viewedPairIds.has(p.id)).length;
      },

      getPairsByChain: (chainId: number | null) => {
        const { pairs } = get();
        if (chainId === null) return pairs;
        return pairs.filter((p) => p.chainId === chainId);
      },

      clearPairs: () => {
        set({ pairs: [], viewedPairIds: new Set(), lastFetched: 0 });
      },
    }),
    {
      name: 'swaperex-pairs',
      version: 1,
      // Custom serialization for Set
      partialize: (state) => ({
        pairs: state.pairs,
        viewedPairIds: Array.from(state.viewedPairIds),
        lastFetched: state.lastFetched,
        selectedChain: state.selectedChain,
      }),
      // Custom deserialization
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray(state.viewedPairIds)) {
          state.viewedPairIds = new Set(state.viewedPairIds as unknown as string[]);
        }
      },
    }
  )
);

// Export type for external use
export type { TrendingPair };
