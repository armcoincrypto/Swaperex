import { describe, it, expect } from 'vitest';
import { shouldShowSignal, shouldShowHistoryEntry, getFilterSummary, type SignalFilterState } from '../signalFilterStore';

describe('signalFilterStore', () => {
  // ── shouldShowSignal (basic filters) ──────────────────────────

  describe('shouldShowSignal', () => {
    const defaultFilters = {
      impactFilter: 'high+medium' as const,
      minConfidence: 60,
      showLiquidity: true,
      showRisk: true,
    };

    it('shows high-impact risk signal with default filters', () => {
      expect(shouldShowSignal(
        { type: 'risk', confidence: 0.8, impact: { level: 'high', score: 85 } },
        defaultFilters
      )).toBe(true);
    });

    it('shows medium-impact liquidity signal with default filters', () => {
      expect(shouldShowSignal(
        { type: 'liquidity', confidence: 0.7, impact: { level: 'medium', score: 55 } },
        defaultFilters
      )).toBe(true);
    });

    it('hides low-impact signal with default filters (high+medium)', () => {
      expect(shouldShowSignal(
        { type: 'risk', confidence: 0.8, impact: { level: 'low', score: 20 } },
        defaultFilters
      )).toBe(false);
    });

    it('hides signal below confidence threshold', () => {
      expect(shouldShowSignal(
        { type: 'risk', confidence: 0.5, impact: { level: 'high', score: 85 } },
        defaultFilters
      )).toBe(false);
    });

    it('hides liquidity signal when showLiquidity is false', () => {
      expect(shouldShowSignal(
        { type: 'liquidity', confidence: 0.9, impact: { level: 'high', score: 90 } },
        { ...defaultFilters, showLiquidity: false }
      )).toBe(false);
    });

    it('hides risk signal when showRisk is false', () => {
      expect(shouldShowSignal(
        { type: 'risk', confidence: 0.9, impact: { level: 'high', score: 90 } },
        { ...defaultFilters, showRisk: false }
      )).toBe(false);
    });

    it('shows all impacts when filter is set to all', () => {
      expect(shouldShowSignal(
        { type: 'risk', confidence: 0.8, impact: { level: 'low', score: 20 } },
        { ...defaultFilters, impactFilter: 'all' }
      )).toBe(true);
    });

    it('shows only high when filter is set to high', () => {
      expect(shouldShowSignal(
        { type: 'risk', confidence: 0.8, impact: { level: 'medium', score: 50 } },
        { ...defaultFilters, impactFilter: 'high' }
      )).toBe(false);

      expect(shouldShowSignal(
        { type: 'risk', confidence: 0.8, impact: { level: 'high', score: 80 } },
        { ...defaultFilters, impactFilter: 'high' }
      )).toBe(true);
    });

    it('handles signal without impact gracefully', () => {
      expect(shouldShowSignal(
        { type: 'risk', confidence: 0.8 },
        defaultFilters
      )).toBe(true);
    });
  });

  // ── shouldShowHistoryEntry (extended filters) ─────────────────

  describe('shouldShowHistoryEntry', () => {
    const defaultFilters: SignalFilterState = {
      viewScope: 'both',
      impactFilter: 'all',
      severityFilter: 'all',
      minConfidence: 40,
      showLiquidity: true,
      showRisk: true,
      chainFilter: 0,
      searchQuery: '',
      recurrenceFilter: 'all',
      groupRepeats: true,
      // Stubs for actions/helpers (not called in shouldShowHistoryEntry)
      setViewScope: () => {},
      setImpactFilter: () => {},
      setSeverityFilter: () => {},
      setMinConfidence: () => {},
      setShowLiquidity: () => {},
      setShowRisk: () => {},
      setChainFilter: () => {},
      setSearchQuery: () => {},
      setRecurrenceFilter: () => {},
      setGroupRepeats: () => {},
      resetFilters: () => {},
      isDefaultFilters: () => true,
      getActiveFilterCount: () => 0,
    };

    const baseEntry = {
      type: 'risk' as const,
      confidence: 0.8,
      severity: 'warning',
      chainId: 1,
      token: '0xabc123def456',
      tokenSymbol: 'USDC',
      impact: { level: 'high' as const, score: 80 },
    };

    it('shows entry when all filters are default', () => {
      expect(shouldShowHistoryEntry(baseEntry, defaultFilters)).toBe(true);
    });

    it('filters by severity', () => {
      expect(shouldShowHistoryEntry(
        baseEntry,
        { ...defaultFilters, severityFilter: 'warning' }
      )).toBe(true);

      expect(shouldShowHistoryEntry(
        baseEntry,
        { ...defaultFilters, severityFilter: 'critical' }
      )).toBe(false);
    });

    it('filters by chain', () => {
      expect(shouldShowHistoryEntry(
        baseEntry,
        { ...defaultFilters, chainFilter: 1 }
      )).toBe(true);

      expect(shouldShowHistoryEntry(
        baseEntry,
        { ...defaultFilters, chainFilter: 56 }
      )).toBe(false);
    });

    it('filters by search (symbol)', () => {
      expect(shouldShowHistoryEntry(
        baseEntry,
        { ...defaultFilters, searchQuery: 'usdc' }
      )).toBe(true);

      expect(shouldShowHistoryEntry(
        baseEntry,
        { ...defaultFilters, searchQuery: 'WETH' }
      )).toBe(false);
    });

    it('filters by search (address)', () => {
      expect(shouldShowHistoryEntry(
        baseEntry,
        { ...defaultFilters, searchQuery: '0xabc' }
      )).toBe(true);

      expect(shouldShowHistoryEntry(
        baseEntry,
        { ...defaultFilters, searchQuery: '0xzzz' }
      )).toBe(false);
    });

    it('filters by recurrence (repeated only)', () => {
      const repeatedEntry = { ...baseEntry, recurrence: { isRepeat: true } };
      const newEntry = { ...baseEntry, recurrence: { isRepeat: false } };

      expect(shouldShowHistoryEntry(
        repeatedEntry,
        { ...defaultFilters, recurrenceFilter: 'repeated' }
      )).toBe(true);

      expect(shouldShowHistoryEntry(
        newEntry,
        { ...defaultFilters, recurrenceFilter: 'repeated' }
      )).toBe(false);
    });

    it('filters by recurrence (new only)', () => {
      const repeatedEntry = { ...baseEntry, recurrence: { isRepeat: true } };
      const newEntry = { ...baseEntry, recurrence: { isRepeat: false } };

      expect(shouldShowHistoryEntry(
        newEntry,
        { ...defaultFilters, recurrenceFilter: 'new' }
      )).toBe(true);

      expect(shouldShowHistoryEntry(
        repeatedEntry,
        { ...defaultFilters, recurrenceFilter: 'new' }
      )).toBe(false);
    });

    it('combines multiple filters', () => {
      // BSC + critical + search "ETH" → should hide a warning on ETH chain named USDC
      expect(shouldShowHistoryEntry(
        baseEntry,
        { ...defaultFilters, chainFilter: 56, severityFilter: 'critical', searchQuery: 'ETH' }
      )).toBe(false);
    });
  });

  // ── getFilterSummary ──────────────────────────────────────────

  describe('getFilterSummary', () => {
    const defaultFilters: SignalFilterState = {
      viewScope: 'both',
      impactFilter: 'high+medium',
      severityFilter: 'all',
      minConfidence: 60,
      showLiquidity: true,
      showRisk: true,
      chainFilter: 0,
      searchQuery: '',
      recurrenceFilter: 'all',
      groupRepeats: true,
      setViewScope: () => {},
      setImpactFilter: () => {},
      setSeverityFilter: () => {},
      setMinConfidence: () => {},
      setShowLiquidity: () => {},
      setShowRisk: () => {},
      setChainFilter: () => {},
      setSearchQuery: () => {},
      setRecurrenceFilter: () => {},
      setGroupRepeats: () => {},
      resetFilters: () => {},
      isDefaultFilters: () => true,
      getActiveFilterCount: () => 0,
    };

    it('returns "Default filters" when all defaults', () => {
      expect(getFilterSummary(defaultFilters)).toBe('Default filters');
    });

    it('shows view scope deviation', () => {
      expect(getFilterSummary({ ...defaultFilters, viewScope: 'live' })).toContain('Live only');
      expect(getFilterSummary({ ...defaultFilters, viewScope: 'timeline' })).toContain('Timeline only');
    });

    it('shows impact filter deviation', () => {
      expect(getFilterSummary({ ...defaultFilters, impactFilter: 'high' })).toContain('High only');
      expect(getFilterSummary({ ...defaultFilters, impactFilter: 'all' })).toContain('All impacts');
    });

    it('shows confidence deviation', () => {
      expect(getFilterSummary({ ...defaultFilters, minConfidence: 80 })).toContain('>=80%');
    });

    it('shows disabled types', () => {
      expect(getFilterSummary({ ...defaultFilters, showLiquidity: false })).toContain('-LIQ');
      expect(getFilterSummary({ ...defaultFilters, showRisk: false })).toContain('-RISK');
    });

    it('shows chain filter', () => {
      expect(getFilterSummary({ ...defaultFilters, chainFilter: 56 })).toContain('chain:56');
    });

    it('shows search query', () => {
      expect(getFilterSummary({ ...defaultFilters, searchQuery: 'USDC' })).toContain('"USDC"');
    });

    it('shows recurrence filter', () => {
      expect(getFilterSummary({ ...defaultFilters, recurrenceFilter: 'repeated' })).toContain('repeated');
    });
  });
});
