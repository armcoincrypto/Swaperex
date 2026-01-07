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

export interface SignalFilterState {
  // Impact level filter (default: high+medium)
  impactFilter: ImpactFilter;

  // Minimum confidence threshold (default: 40)
  minConfidence: number;

  // Signal type toggles (default: both enabled)
  showLiquidity: boolean;
  showRisk: boolean;

  // Actions
  setImpactFilter: (filter: ImpactFilter) => void;
  setMinConfidence: (threshold: number) => void;
  setShowLiquidity: (show: boolean) => void;
  setShowRisk: (show: boolean) => void;
  resetFilters: () => void;

  // Computed helpers
  isDefaultFilters: () => boolean;
  getActiveFilterCount: () => number;
}

const DEFAULT_FILTERS = {
  impactFilter: 'high+medium' as ImpactFilter,
  minConfidence: 60, // Calmer default: ≥60% confidence
  showLiquidity: true,
  showRisk: true,
};

export const useSignalFilterStore = create<SignalFilterState>()(
  persist(
    (set, get) => ({
      // Default state
      ...DEFAULT_FILTERS,

      // Actions
      setImpactFilter: (filter) => set({ impactFilter: filter }),

      setMinConfidence: (threshold) => set({ minConfidence: threshold }),

      setShowLiquidity: (show) => set({ showLiquidity: show }),

      setShowRisk: (show) => set({ showRisk: show }),

      resetFilters: () => set(DEFAULT_FILTERS),

      // Helpers
      isDefaultFilters: () => {
        const state = get();
        return (
          state.impactFilter === DEFAULT_FILTERS.impactFilter &&
          state.minConfidence === DEFAULT_FILTERS.minConfidence &&
          state.showLiquidity === DEFAULT_FILTERS.showLiquidity &&
          state.showRisk === DEFAULT_FILTERS.showRisk
        );
      },

      getActiveFilterCount: () => {
        const state = get();
        let count = 0;
        // Count only deviations from defaults
        if (state.impactFilter !== DEFAULT_FILTERS.impactFilter) count++;
        if (state.minConfidence !== DEFAULT_FILTERS.minConfidence) count++;
        if (state.showLiquidity !== DEFAULT_FILTERS.showLiquidity) count++;
        if (state.showRisk !== DEFAULT_FILTERS.showRisk) count++;
        return count;
      },
    }),
    {
      name: 'swaperex-signal-filters',
      version: 1,
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
 * Get human-readable filter summary (shows deviations from default)
 */
export function getFilterSummary(filters: SignalFilterState): string {
  const parts: string[] = [];

  // Show impact filter only if different from default
  if (filters.impactFilter !== DEFAULT_FILTERS.impactFilter) {
    if (filters.impactFilter === 'high') {
      parts.push('🔥 High only');
    } else if (filters.impactFilter === 'all') {
      parts.push('All impacts');
    }
  }

  // Show confidence only if different from default
  if (filters.minConfidence !== DEFAULT_FILTERS.minConfidence) {
    parts.push(`≥${filters.minConfidence}%`);
  }

  // Show type filters only if disabled
  if (!filters.showLiquidity) {
    parts.push('-LIQ');
  }
  if (!filters.showRisk) {
    parts.push('-RISK');
  }

  return parts.length > 0 ? parts.join(' ') : 'Default filters';
}

// Export defaults for external comparison
export { DEFAULT_FILTERS };

// Convenience hooks
export const useImpactFilter = () => useSignalFilterStore((s) => s.impactFilter);
export const useMinConfidence = () => useSignalFilterStore((s) => s.minConfidence);
export const useShowLiquidity = () => useSignalFilterStore((s) => s.showLiquidity);
export const useShowRisk = () => useSignalFilterStore((s) => s.showRisk);
