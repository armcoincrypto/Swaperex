/**
 * Portfolio Store
 *
 * Zustand store for multi-chain portfolio state with snapshot persistence.
 * Wraps usePortfolio hook data and provides:
 *  - Live state in memory (tokens, totals, errors)
 *  - Snapshot persistence to localStorage (instant load on refresh)
 *  - Per-chain health tracking (backoff, stale data, latency)
 *  - Sort/filter/search controls
 *  - Privacy mode toggle
 *  - Refresh timing (for diagnostics)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Portfolio, PortfolioChain, ChainBalance, TokenBalance } from '@/services/portfolioTypes';
import {
  type ChainHealthState,
  type PricingStatus,
  createInitialHealth,
  getHealthStatus,
  calculateNextRetry,
  isStaleDataValid,
  CHAIN_LABELS,
  CHAIN_FULL_NAMES,
} from '@/utils/chainHealth';

export type SortMode = 'value' | 'balance' | 'alpha' | 'chain';

export interface PortfolioStoreState {
  /** Live portfolio data */
  portfolio: Portfolio | null;
  /** Loading state */
  loading: boolean;
  /** Per-chain errors (legacy — kept for backward compat, also see chainHealth) */
  errors: Partial<Record<PortfolioChain, string>>;
  /** Last successful fetch time */
  updatedAt: number;

  /** Snapshot (persisted — shown while live data loads) */
  snapshot: Portfolio | null;
  snapshotAt: number;

  /** Per-chain health tracking */
  chainHealth: Partial<Record<PortfolioChain, ChainHealthState>>;

  /** Refresh timing (for diagnostics) */
  refreshStartedAt: number;
  refreshFinishedAt: number;

  /** Pricing status (for diagnostics) */
  pricingStatus: PricingStatus;

  /** UI preferences (persisted) */
  sortMode: SortMode;
  hideSmallBalances: boolean;
  smallBalanceThreshold: number;
  hideZeroBalances: boolean;
  privacyMode: boolean;
  searchQuery: string;

  // Actions
  setPortfolio: (portfolio: Portfolio) => void;
  setLoading: (loading: boolean) => void;
  setChainError: (chain: PortfolioChain, error: string | null) => void;
  clearErrors: () => void;
  hydrateFromSnapshot: () => boolean;

  /** Record a successful chain fetch */
  recordChainSuccess: (chain: PortfolioChain, balance: ChainBalance, latencyMs: number) => void;
  /** Record a failed chain fetch */
  recordChainFailure: (chain: PortfolioChain, error: string) => void;
  /** Get health for a chain (returns default if none) */
  getChainHealth: (chain: PortfolioChain) => ChainHealthState;
  /** Reset all chain health */
  resetChainHealth: () => void;

  /** Refresh timing */
  setRefreshTimestamp: (type: 'start' | 'finish') => void;

  /** Pricing diagnostics */
  setPricingStatus: (status: Partial<PricingStatus>) => void;

  /**
   * Batch-update chain health, pricing, and refresh timestamps in ONE set() call.
   * Prevents re-render storms during multi-chain refresh.
   */
  batchRecordChainResults: (results: {
    chainResults: Array<{
      chain: PortfolioChain;
      success: boolean;
      balance: ChainBalance | null;
      latencyMs: number;
      error: string | null;
    }>;
    pricing: Partial<PricingStatus>;
    refreshStartedAt?: number;
    refreshFinishedAt?: number;
  }) => void;

  setSortMode: (mode: SortMode) => void;
  setHideSmallBalances: (hide: boolean) => void;
  setSmallBalanceThreshold: (threshold: number) => void;
  setHideZeroBalances: (hide: boolean) => void;
  setPrivacyMode: (privacy: boolean) => void;
  setSearchQuery: (query: string) => void;
  clear: () => void;
}

/** Snapshot TTL: 10 minutes */
const SNAPSHOT_TTL = 10 * 60 * 1000;

const INITIAL_PRICING: PricingStatus = {
  lastFetchAt: 0,
  lastError: null,
  cacheAgeMs: 0,
  tokensPriced: 0,
  tokensMissing: 0,
};

export const usePortfolioStore = create<PortfolioStoreState>()(
  persist(
    (set) => ({
      portfolio: null,
      loading: false,
      errors: {},
      updatedAt: 0,
      snapshot: null,
      snapshotAt: 0,
      chainHealth: {},
      refreshStartedAt: 0,
      refreshFinishedAt: 0,
      pricingStatus: { ...INITIAL_PRICING },
      sortMode: 'value',
      hideSmallBalances: false,
      smallBalanceThreshold: 1,
      hideZeroBalances: true,
      privacyMode: false,
      searchQuery: '',

      setPortfolio: (portfolio) =>
        set({
          portfolio,
          updatedAt: Date.now(),
          loading: false,
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

      // ─── Chain Health Actions ─────────────────────────────────

      recordChainSuccess: (chain, balance, latencyMs) =>
        set((s) => ({
          chainHealth: {
            ...s.chainHealth,
            [chain]: {
              status: 'ok' as const,
              failureCount: 0,
              lastSuccessAt: Date.now(),
              lastErrorAt: s.chainHealth[chain]?.lastErrorAt || 0,
              lastError: null,
              lastLatencyMs: latencyMs,
              nextRetryAt: 0,
              staleData: balance,
            },
          },
        })),

      recordChainFailure: (chain, error) =>
        set((s) => {
          const prev = s.chainHealth[chain] || createInitialHealth();
          const newCount = prev.failureCount + 1;
          return {
            chainHealth: {
              ...s.chainHealth,
              [chain]: {
                ...prev,
                status: getHealthStatus(newCount),
                failureCount: newCount,
                lastErrorAt: Date.now(),
                lastError: error,
                nextRetryAt: calculateNextRetry(newCount),
                // Keep staleData if still valid
                staleData: isStaleDataValid(prev.lastSuccessAt) ? prev.staleData : null,
              },
            },
            // Also update legacy errors map
            errors: { ...s.errors, [chain]: error },
          };
        }),

      getChainHealth: (chain): ChainHealthState => {
        return usePortfolioStore.getState().chainHealth[chain] || createInitialHealth();
      },

      resetChainHealth: () => set({ chainHealth: {} }),

      // ─── Refresh Timing ───────────────────────────────────────

      setRefreshTimestamp: (type) =>
        set(type === 'start'
          ? { refreshStartedAt: Date.now() }
          : { refreshFinishedAt: Date.now() }
        ),

      // ─── Pricing ──────────────────────────────────────────────

      setPricingStatus: (status) =>
        set((s) => ({
          pricingStatus: { ...s.pricingStatus, ...status },
        })),

      // ─── Batch Update (single set() to prevent re-render storm) ──

      batchRecordChainResults: ({ chainResults, pricing, refreshStartedAt, refreshFinishedAt }) =>
        set((s) => {
          const newHealth = { ...s.chainHealth };
          const newErrors = { ...s.errors };

          for (const { chain, success, balance, latencyMs, error } of chainResults) {
            if (success) {
              newHealth[chain] = {
                status: 'ok',
                failureCount: 0,
                lastSuccessAt: Date.now(),
                lastErrorAt: s.chainHealth[chain]?.lastErrorAt || 0,
                lastError: null,
                lastLatencyMs: latencyMs,
                nextRetryAt: 0,
                staleData: balance,
              };
              // Clear legacy error
              delete newErrors[chain];
            } else if (error) {
              const prev = s.chainHealth[chain] || createInitialHealth();
              const newCount = prev.failureCount + 1;
              newHealth[chain] = {
                ...prev,
                status: getHealthStatus(newCount),
                failureCount: newCount,
                lastErrorAt: Date.now(),
                lastError: error,
                nextRetryAt: calculateNextRetry(newCount),
                staleData: isStaleDataValid(prev.lastSuccessAt) ? prev.staleData : null,
              };
              newErrors[chain] = error;
            }
          }

          return {
            chainHealth: newHealth,
            errors: newErrors,
            pricingStatus: { ...s.pricingStatus, ...pricing },
            ...(refreshStartedAt ? { refreshStartedAt } : {}),
            ...(refreshFinishedAt ? { refreshFinishedAt } : {}),
          };
        }),

      // ─── UI Preferences ───────────────────────────────────────

      setSortMode: (mode) => set({ sortMode: mode }),
      setHideSmallBalances: (hide) => set({ hideSmallBalances: hide }),
      setSmallBalanceThreshold: (threshold) => set({ smallBalanceThreshold: threshold }),
      setHideZeroBalances: (hide) => set({ hideZeroBalances: hide }),
      setPrivacyMode: (privacy) => set({ privacyMode: privacy }),
      setSearchQuery: (query) => set({ searchQuery: query }),

      clear: () =>
        set({
          portfolio: null,
          loading: false,
          errors: {},
          updatedAt: 0,
          searchQuery: '',
          chainHealth: {},
          refreshStartedAt: 0,
          refreshFinishedAt: 0,
          pricingStatus: { ...INITIAL_PRICING },
        }),
    }),
    {
      name: 'swaperex-portfolio',
      version: 3,
      partialize: (state) => ({
        snapshot: state.snapshot,
        snapshotAt: state.snapshotAt,
        sortMode: state.sortMode,
        hideSmallBalances: state.hideSmallBalances,
        smallBalanceThreshold: state.smallBalanceThreshold,
        hideZeroBalances: state.hideZeroBalances,
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
      (t.symbol || '').toLowerCase().includes(q) ||
      (t.name || '').toLowerCase().includes(q) ||
      (t.address || '').toLowerCase().includes(q)
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

/** Filter out zero-balance tokens */
export function filterZeroBalances(
  tokens: TokenBalance[],
  hide: boolean
): TokenBalance[] {
  if (!hide) return tokens;
  return tokens.filter((t) => parseFloat(t.balanceFormatted || '0') > 0);
}

/** Calculate per-chain totals */
export function getChainTotals(
  portfolio: Portfolio | null
): Record<string, { total: number; label: string }> {
  if (!portfolio) return {};

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
  if (num === 0) return '$0.00';
  if (num > 0 && num < 0.01) return '< $0.01';
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

/** Get chain label from PortfolioChain */
export function getPortfolioChainLabel(chain: PortfolioChain): string {
  return CHAIN_LABELS[chain] || chain;
}

/** Get chain badge label (use full name when symbol would duplicate, e.g. ETH on Ethereum) */
export function getPortfolioChainBadgeLabel(chain: PortfolioChain, tokenSymbol: string): string {
  const short = CHAIN_LABELS[chain] || chain;
  const full = CHAIN_FULL_NAMES[chain] || chain;
  return short.toUpperCase() === tokenSymbol.toUpperCase() ? full : short;
}
