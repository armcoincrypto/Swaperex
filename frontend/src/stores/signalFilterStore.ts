/**
 * Signal Filter Store
 *
 * User preferences for filtering signals in Radar and History.
 * Persisted to localStorage for cross-session retention.
 *
 * Priority 10.2 - User Signal Filters
 *
 * Design Rules:
 * - Filters NEVER affect backend logic
 * - Backend generates full data
 * - Frontend only hides/shows based on filters
 * - This preserves auditability + replay
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ImpactFilter = 'high' | 'high+medium' | 'all';
export type ViewScope = 'live' | 'timeline' | 'both';
export type SeverityFilter = 'all' | 'warning' | 'danger' | 'critical';
export type RecurrenceFilter = 'all' | 'repeated' | 'new';

export interface SignalFilterState {
  // View scope: what data source to show
  viewScope: ViewScope;

  // Impact level filter (default: high+medium)
  impactFilter: ImpactFilter;

  // Severity filter (default: all)
  severityFilter: SeverityFilter;

  // Minimum confidence threshold (default: 60)
  minConfidence: number;

  // Signal type toggles (default: both enabled)
  showLiquidity: boolean;
  showRisk: boolean;

  // Chain filter (0 = all chains)
  chainFilter: number;

  // Search query (symbol or address substring)
  searchQuery: string;

  // Recurrence filter
  recurrenceFilter: RecurrenceFilter;

  // Group repeats (default: true)
  groupRepeats: boolean;

  // Actions
  setViewScope: (scope: ViewScope) => void;
  setImpactFilter: (filter: ImpactFilter) => void;
  setSeverityFilter: (filter: SeverityFilter) => void;
  setMinConfidence: (threshold: number) => void;
  setShowLiquidity: (show: boolean) => void;
  setShowRisk: (show: boolean) => void;
  setChainFilter: (chainId: number) => void;
  setSearchQuery: (query: string) => void;
  setRecurrenceFilter: (filter: RecurrenceFilter) => void;
  setGroupRepeats: (group: boolean) => void;
  resetFilters: () => void;

  // Computed helpers
  isDefaultFilters: () => boolean;
  getActiveFilterCount: () => number;
}

const DEFAULT_FILTERS = {
  viewScope: 'both' as ViewScope,
  impactFilter: 'high+medium' as ImpactFilter,
  severityFilter: 'all' as SeverityFilter,
  minConfidence: 60,
  showLiquidity: true,
  showRisk: true,
  chainFilter: 0,
  searchQuery: '',
  recurrenceFilter: 'all' as RecurrenceFilter,
  groupRepeats: true,
};

export const useSignalFilterStore = create<SignalFilterState>()(
  persist(
    (set, get) => ({
      // Default state
      ...DEFAULT_FILTERS,

      // Actions
      setViewScope: (scope) => set({ viewScope: scope }),
      setImpactFilter: (filter) => set({ impactFilter: filter }),
      setSeverityFilter: (filter) => set({ severityFilter: filter }),
      setMinConfidence: (threshold) => set({ minConfidence: threshold }),
      setShowLiquidity: (show) => set({ showLiquidity: show }),
      setShowRisk: (show) => set({ showRisk: show }),
      setChainFilter: (chainId) => set({ chainFilter: chainId }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setRecurrenceFilter: (filter) => set({ recurrenceFilter: filter }),
      setGroupRepeats: (group) => set({ groupRepeats: group }),

      resetFilters: () => set(DEFAULT_FILTERS),

      // Helpers
      isDefaultFilters: () => {
        const state = get();
        return (
          state.viewScope === DEFAULT_FILTERS.viewScope &&
          state.impactFilter === DEFAULT_FILTERS.impactFilter &&
          state.severityFilter === DEFAULT_FILTERS.severityFilter &&
          state.minConfidence === DEFAULT_FILTERS.minConfidence &&
          state.showLiquidity === DEFAULT_FILTERS.showLiquidity &&
          state.showRisk === DEFAULT_FILTERS.showRisk &&
          state.chainFilter === DEFAULT_FILTERS.chainFilter &&
          state.searchQuery === DEFAULT_FILTERS.searchQuery &&
          state.recurrenceFilter === DEFAULT_FILTERS.recurrenceFilter &&
          state.groupRepeats === DEFAULT_FILTERS.groupRepeats
        );
      },

      getActiveFilterCount: () => {
        const state = get();
        let count = 0;
        if (state.viewScope !== DEFAULT_FILTERS.viewScope) count++;
        if (state.impactFilter !== DEFAULT_FILTERS.impactFilter) count++;
        if (state.severityFilter !== DEFAULT_FILTERS.severityFilter) count++;
        if (state.minConfidence !== DEFAULT_FILTERS.minConfidence) count++;
        if (state.showLiquidity !== DEFAULT_FILTERS.showLiquidity) count++;
        if (state.showRisk !== DEFAULT_FILTERS.showRisk) count++;
        if (state.chainFilter !== DEFAULT_FILTERS.chainFilter) count++;
        if (state.searchQuery !== DEFAULT_FILTERS.searchQuery) count++;
        if (state.recurrenceFilter !== DEFAULT_FILTERS.recurrenceFilter) count++;
        if (state.groupRepeats !== DEFAULT_FILTERS.groupRepeats) count++;
        return count;
      },
    }),
    {
      name: 'swaperex-signal-filters',
      version: 2,
      migrate: (persisted: unknown, version: number) => {
        if (version < 2) {
          // Migrate v1 → v2: add new fields with defaults
          const old = persisted as Record<string, unknown>;
          return {
            ...DEFAULT_FILTERS,
            // Preserve existing v1 values
            impactFilter: old.impactFilter ?? DEFAULT_FILTERS.impactFilter,
            minConfidence: old.minConfidence ?? DEFAULT_FILTERS.minConfidence,
            showLiquidity: old.showLiquidity ?? DEFAULT_FILTERS.showLiquidity,
            showRisk: old.showRisk ?? DEFAULT_FILTERS.showRisk,
          };
        }
        return persisted as SignalFilterState;
      },
    }
  )
);

/**
 * Filter a signal based on current filter settings
 * Returns true if signal should be shown, false if hidden
 */
export function shouldShowSignal(
  signal: {
    type: 'liquidity' | 'risk';
    confidence: number;
    impact?: { level: 'high' | 'medium' | 'low'; score: number };
  },
  filters: Pick<SignalFilterState, 'impactFilter' | 'minConfidence' | 'showLiquidity' | 'showRisk'>
): boolean {
  // Type filter
  if (signal.type === 'liquidity' && !filters.showLiquidity) return false;
  if (signal.type === 'risk' && !filters.showRisk) return false;

  // Confidence filter
  if (signal.confidence * 100 < filters.minConfidence) return false;

  // Impact filter
  if (signal.impact) {
    const level = signal.impact.level;
    if (filters.impactFilter === 'high' && level !== 'high') return false;
    if (filters.impactFilter === 'high+medium' && level === 'low') return false;
    // 'all' shows everything
  }

  return true;
}

/**
 * Extended filter for signal history entries (includes severity, chain, search, recurrence)
 */
export function shouldShowHistoryEntry(
  entry: {
    type: 'liquidity' | 'risk';
    confidence: number;
    severity: string;
    chainId: number;
    token: string;
    tokenSymbol?: string;
    impact?: { level: 'high' | 'medium' | 'low'; score: number };
    recurrence?: { isRepeat: boolean };
  },
  filters: SignalFilterState
): boolean {
  // Basic signal filters
  if (!shouldShowSignal(entry, filters)) return false;

  // Severity filter
  if (filters.severityFilter !== 'all' && entry.severity !== filters.severityFilter) return false;

  // Chain filter
  if (filters.chainFilter !== 0 && entry.chainId !== filters.chainFilter) return false;

  // Search filter
  if (filters.searchQuery) {
    const q = filters.searchQuery.toLowerCase();
    const matchesSymbol = entry.tokenSymbol?.toLowerCase().includes(q);
    const matchesAddress = entry.token.toLowerCase().includes(q);
    if (!matchesSymbol && !matchesAddress) return false;
  }

  // Recurrence filter
  if (filters.recurrenceFilter === 'repeated' && !entry.recurrence?.isRepeat) return false;
  if (filters.recurrenceFilter === 'new' && entry.recurrence?.isRepeat) return false;

  return true;
}

/**
 * Get human-readable filter summary (shows deviations from default)
 */
export function getFilterSummary(filters: SignalFilterState): string {
  const parts: string[] = [];

  if (filters.viewScope !== DEFAULT_FILTERS.viewScope) {
    parts.push(filters.viewScope === 'live' ? 'Live only' : 'Timeline only');
  }

  if (filters.impactFilter !== DEFAULT_FILTERS.impactFilter) {
    if (filters.impactFilter === 'high') {
      parts.push('High only');
    } else if (filters.impactFilter === 'all') {
      parts.push('All impacts');
    }
  }

  if (filters.severityFilter !== DEFAULT_FILTERS.severityFilter) {
    parts.push(filters.severityFilter);
  }

  if (filters.minConfidence !== DEFAULT_FILTERS.minConfidence) {
    parts.push(`>=${filters.minConfidence}%`);
  }

  if (!filters.showLiquidity) parts.push('-LIQ');
  if (!filters.showRisk) parts.push('-RISK');

  if (filters.chainFilter !== 0) parts.push(`chain:${filters.chainFilter}`);
  if (filters.searchQuery) parts.push(`"${filters.searchQuery}"`);
  if (filters.recurrenceFilter !== 'all') parts.push(filters.recurrenceFilter);

  return parts.length > 0 ? parts.join(' ') : 'Default filters';
}

// Export defaults for external comparison
export { DEFAULT_FILTERS };

// Convenience hooks
export const useImpactFilter = () => useSignalFilterStore((s) => s.impactFilter);
export const useMinConfidence = () => useSignalFilterStore((s) => s.minConfidence);
export const useShowLiquidity = () => useSignalFilterStore((s) => s.showLiquidity);
export const useShowRisk = () => useSignalFilterStore((s) => s.showRisk);
export const useViewScope = () => useSignalFilterStore((s) => s.viewScope);
