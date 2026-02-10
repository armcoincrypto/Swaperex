/**
 * Portfolio Store
 *
 * Zustand store for multi-chain portfolio state with snapshot persistence.
 * Wraps usePortfolio hook data and provides:
 *  - Live state in memory (tokens, totals, errors)
 *  - Snapshot persistence to localStorage (instant load on refresh)
 *  - Sort/filter/search controls
 *  - Privacy mode toggle
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Portfolio, PortfolioChain, TokenBalance } from '@/services/portfolioTypes';

export type SortMode = 'value' | 'balance' | 'alpha' | 'chain';

export interface PortfolioStoreState {
  /** Live portfolio data */
  portfolio: Portfolio | null;
  /** Loading state */
  loading: boolean;
  /** Per-chain errors */
  errors: Partial<Record<PortfolioChain, string>>;
  /** Last successful fetch time */
  updatedAt: number;

  /** Snapshot (persisted — shown while live data loads) */
  snapshot: Portfolio | null;
  snapshotAt: number;

  /** UI preferences (persisted) */
  sortMode: SortMode;
  hideSmallBalances: boolean;
  smallBalanceThreshold: number; // USD value below which to hide
  privacyMode: boolean;
  searchQuery: string;

  // Actions
  setPortfolio: (portfolio: Portfolio) => void;
  setLoading: (loading: boolean) => void;
  setChainError: (chain: PortfolioChain, error: string | null) => void;
  clearErrors: () => void;
  /** Hydrate from snapshot without re-stamping snapshotAt */
  hydrateFromSnapshot: () => boolean;
  setSortMode: (mode: SortMode) => void;
  setHideSmallBalances: (hide: boolean) => void;
  setSmallBalanceThreshold: (threshold: number) => void;
  setPrivacyMode: (privacy: boolean) => void;
  setSearchQuery: (query: string) => void;
  clear: () => void;
}

/** Snapshot TTL: 10 minutes */
const SNAPSHOT_TTL = 10 * 60 * 1000;

export const usePortfolioStore = create<PortfolioStoreState>()(
  persist(
    (set) => ({
      portfolio: null,
      loading: false,
      errors: {},
      updatedAt: 0,
      snapshot: null,
      snapshotAt: 0,
      sortMode: 'value',
      hideSmallBalances: false,
      smallBalanceThreshold: 1, // $1 default
      privacyMode: false,
      searchQuery: '',

      setPortfolio: (portfolio) =>
        set({
          portfolio,
          updatedAt: Date.now(),
          loading: false,
          // Save as snapshot
          snapshot: portfolio,
          snapshotAt: Date.now(),
        }),

      setLoading: (loading) => set({ loading }),

      hydrateFromSnapshot: () => {
        const { snapshot, snapshotAt, portfolio } = usePortfolioStore.getState();
        if (!portfolio && snapshot && isSnapshotValid(snapshotAt)) {
          set({ portfolio: snapshot, updatedAt: snapshotAt, loading: false });
          return true;
        }
        return false;
      },

      setChainError: (chain, error) =>
        set((s) => ({
          errors: error
            ? { ...s.errors, [chain]: error }
            : Object.fromEntries(
                Object.entries(s.errors).filter(([k]) => k !== chain)
              ) as Partial<Record<PortfolioChain, string>>,
        })),

      clearErrors: () => set({ errors: {} }),

      setSortMode: (mode) => set({ sortMode: mode }),
      setHideSmallBalances: (hide) => set({ hideSmallBalances: hide }),
      setSmallBalanceThreshold: (threshold) => set({ smallBalanceThreshold: threshold }),
      setPrivacyMode: (privacy) => set({ privacyMode: privacy }),
      setSearchQuery: (query) => set({ searchQuery: query }),

      clear: () =>
        set({
          portfolio: null,
          loading: false,
          errors: {},
          updatedAt: 0,
          searchQuery: '',
        }),
    }),
    {
      name: 'swaperex-portfolio',
      version: 1,
      partialize: (state) => ({
        snapshot: state.snapshot,
        snapshotAt: state.snapshotAt,
        sortMode: state.sortMode,
        hideSmallBalances: state.hideSmallBalances,
        smallBalanceThreshold: state.smallBalanceThreshold,
        privacyMode: state.privacyMode,
      }),
    }
  )
);

// ─── Helper Functions ──────────────────────────────────────────────

/** Check if snapshot is still valid */
export function isSnapshotValid(snapshotAt: number): boolean {
  return snapshotAt > 0 && Date.now() - snapshotAt < SNAPSHOT_TTL;
}

/** Get all tokens from portfolio, flattened across chains */
export function flattenPortfolioTokens(
  portfolio: Portfolio | null
): TokenBalance[] {
  if (!portfolio) return [];

  const tokens: TokenBalance[] = [];
  for (const [, chainBalance] of Object.entries(portfolio.chains)) {
    if (!chainBalance) continue;
    tokens.push(chainBalance.nativeBalance);
    tokens.push(...chainBalance.tokenBalances);
  }
  return tokens;
}

/** Sort tokens by the given mode */
export function sortTokens(tokens: TokenBalance[], mode: SortMode): TokenBalance[] {
  return [...tokens].sort((a, b) => {
    switch (mode) {
      case 'value': {
        const aVal = parseFloat(a.usdValue || '0');
        const bVal = parseFloat(b.usdValue || '0');
        if (bVal !== aVal) return bVal - aVal;
        return parseFloat(b.balanceFormatted) - parseFloat(a.balanceFormatted);
      }
      case 'balance':
        return parseFloat(b.balanceFormatted) - parseFloat(a.balanceFormatted);
      case 'alpha':
        return a.symbol.localeCompare(b.symbol);
      case 'chain':
        return (a.chain || '').localeCompare(b.chain || '');
      default:
        return 0;
    }
  });
}

/** Filter tokens by search query */
export function filterTokensBySearch(
  tokens: TokenBalance[],
  query: string
): TokenBalance[] {
  if (!query) return tokens;
  const q = query.toLowerCase();
  return tokens.filter(
    (t) =>
      t.symbol.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      t.address.toLowerCase().includes(q)
  );
}

/** Filter tokens by minimum USD value */
export function filterSmallBalances(
  tokens: TokenBalance[],
  threshold: number,
  hide: boolean
): TokenBalance[] {
  if (!hide) return tokens;
  return tokens.filter((t) => {
    const val = parseFloat(t.usdValue || '0');
    return val >= threshold || t.isNative;
  });
}

/** Calculate per-chain totals */
export function getChainTotals(
  portfolio: Portfolio | null
): Record<string, { total: number; label: string }> {
  if (!portfolio) return {};

  const CHAIN_LABELS: Record<string, string> = {
    ethereum: 'ETH',
    bsc: 'BSC',
    polygon: 'Polygon',
    arbitrum: 'Arbitrum',
    solana: 'Solana',
  };

  const totals: Record<string, { total: number; label: string }> = {};
  for (const [chain, balance] of Object.entries(portfolio.chains)) {
    if (!balance) continue;
    totals[chain] = {
      total: parseFloat(balance.totalUsdValue || '0'),
      label: CHAIN_LABELS[chain] || chain,
    };
  }
  return totals;
}

/** Format USD with privacy mode */
export function formatUsdPrivate(value: string | number, privacyMode: boolean): string {
  if (privacyMode) return '****';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '$0.00';
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

/** Get chain label from PortfolioChain */
export function getPortfolioChainLabel(chain: PortfolioChain): string {
  const labels: Record<PortfolioChain, string> = {
    ethereum: 'ETH',
    bsc: 'BSC',
    polygon: 'Polygon',
    arbitrum: 'Arbitrum',
    solana: 'Solana',
  };
  return labels[chain] || chain;
}
