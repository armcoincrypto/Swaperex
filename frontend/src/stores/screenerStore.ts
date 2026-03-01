/**
 * Screener Store (Zustand)
 *
 * Manages screener state: mode, chain, filters, sorting, loading, data.
 * Filters are persisted per chain in localStorage.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ScreenerChainId,
  ScreenerFilters,
  SortField,
  SortDir,
} from '@/services/screener/types';
import { DEFAULT_FILTERS } from '@/services/screener/types';

export type ScreenerMode = 'basic' | 'advanced';

interface PersistedState {
  mode: ScreenerMode;
  chainId: ScreenerChainId;
  sortField: SortField;
  sortDir: SortDir;
  /** Filters per chain */
  filtersByChain: Partial<Record<ScreenerChainId, ScreenerFilters>>;
}

interface ScreenerState extends PersistedState {
  // Volatile (not persisted)
  isLoading: boolean;
  error: string | null;
  fromCache: boolean;
  rateLimited: boolean;
  lastUpdated: number | null;
  expandedTokenId: string | null;

  // Actions
  setMode: (mode: ScreenerMode) => void;
  setChainId: (chainId: ScreenerChainId) => void;
  setSort: (field: SortField, dir?: SortDir) => void;
  toggleSortDir: () => void;
  setFilters: (patch: Partial<ScreenerFilters>) => void;
  resetFilters: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setFetchMeta: (meta: { fromCache: boolean; rateLimited: boolean }) => void;
  setLastUpdated: (ts: number) => void;
  setExpandedTokenId: (id: string | null) => void;
  getFilters: () => ScreenerFilters;
}

export const useScreenerStore = create<ScreenerState>()(
  persist(
    (set, get) => ({
      // Persisted defaults
      mode: 'basic',
      chainId: 1,
      sortField: 'volume24h',
      sortDir: 'desc',
      filtersByChain: {},

      // Volatile defaults
      isLoading: false,
      error: null,
      fromCache: false,
      rateLimited: false,
      lastUpdated: null,
      expandedTokenId: null,

      setMode: (mode) => set({ mode }),
      setChainId: (chainId) => set({ chainId, expandedTokenId: null }),

      setSort: (field, dir) => {
        const state = get();
        if (state.sortField === field && !dir) {
          // Toggle direction
          set({ sortDir: state.sortDir === 'desc' ? 'asc' : 'desc' });
        } else {
          set({ sortField: field, sortDir: dir ?? 'desc' });
        }
      },

      toggleSortDir: () =>
        set((s) => ({ sortDir: s.sortDir === 'desc' ? 'asc' : 'desc' })),

      setFilters: (patch) =>
        set((s) => {
          const current = s.filtersByChain[s.chainId] ?? DEFAULT_FILTERS;
          return {
            filtersByChain: {
              ...s.filtersByChain,
              [s.chainId]: { ...current, ...patch },
            },
          };
        }),

      resetFilters: () =>
        set((s) => ({
          filtersByChain: {
            ...s.filtersByChain,
            [s.chainId]: { ...DEFAULT_FILTERS },
          },
        })),

      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      setFetchMeta: (meta) => set(meta),
      setLastUpdated: (ts) => set({ lastUpdated: ts }),
      setExpandedTokenId: (id) =>
        set((s) => ({ expandedTokenId: s.expandedTokenId === id ? null : id })),

      getFilters: () => {
        const s = get();
        return s.filtersByChain[s.chainId] ?? DEFAULT_FILTERS;
      },
    }),
    {
      name: 'swaperex-screener',
      version: 1,
      partialize: (state) => ({
        mode: state.mode,
        chainId: state.chainId,
        sortField: state.sortField,
        sortDir: state.sortDir,
        filtersByChain: state.filtersByChain,
      }),
    },
  ),
);

export default useScreenerStore;
