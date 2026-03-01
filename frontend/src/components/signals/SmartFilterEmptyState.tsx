/**
 * Smart Filter Empty State
 *
 * Shows context-aware messaging when signals are filtered out.
 * Explains exactly why signals are hidden and provides quick fixes.
 *
 * Priority: Filter UX improvement
 */

import { useMemo } from 'react';
import { useSignalFilterStore, type ImpactFilter } from '@/stores/signalFilterStore';
import type { SignalHistoryEntry } from '@/stores/signalHistoryStore';

interface SmartFilterEmptyStateProps {
  /** All unfiltered signal entries */
  allEntries: SignalHistoryEntry[];
  /** Whether this is the main radar panel (vs history panel) */
  isMainPanel?: boolean;
  /** Custom class name */
  className?: string;
}

interface FilterAnalysis {
  totalSignals: number;
  hiddenByConfidence: number;
  hiddenByImpact: number;
  hiddenByType: number;
  maxAvailableConfidence: number;
  hasHighImpact: boolean;
  hasMediumImpact: boolean;
  hasLowImpact: boolean;
  hasLiquidity: boolean;
  hasRisk: boolean;
}

function analyzeFilteredSignals(
  entries: SignalHistoryEntry[],
  filters: {
    impactFilter: ImpactFilter;
    minConfidence: number;
    showLiquidity: boolean;
    showRisk: boolean;
  }
): FilterAnalysis {
  let hiddenByConfidence = 0;
  let hiddenByImpact = 0;
  let hiddenByType = 0;
  let maxAvailableConfidence = 0;
  let hasHighImpact = false;
  let hasMediumImpact = false;
  let hasLowImpact = false;
  let hasLiquidity = false;
  let hasRisk = false;

  entries.forEach((entry) => {
    const confidence = entry.confidence * 100;
    maxAvailableConfidence = Math.max(maxAvailableConfidence, confidence);

    // Track available types
    if (entry.type === 'liquidity') hasLiquidity = true;
    if (entry.type === 'risk') hasRisk = true;

    // Track available impact levels
    if (entry.impact?.level === 'high') hasHighImpact = true;
    if (entry.impact?.level === 'medium') hasMediumImpact = true;
    if (entry.impact?.level === 'low') hasLowImpact = true;

    // Check why it would be hidden
    const passesType =
      (entry.type === 'liquidity' && filters.showLiquidity) ||
      (entry.type === 'risk' && filters.showRisk);
    const passesConfidence = confidence >= filters.minConfidence;
    const passesImpact =
      filters.impactFilter === 'all' ||
      (filters.impactFilter === 'high' && entry.impact?.level === 'high') ||
      (filters.impactFilter === 'high+medium' && entry.impact?.level !== 'low');

    if (!passesType) hiddenByType++;
    else if (!passesConfidence) hiddenByConfidence++;
    else if (!passesImpact) hiddenByImpact++;
  });

  return {
    totalSignals: entries.length,
    hiddenByConfidence,
    hiddenByImpact,
    hiddenByType,
    maxAvailableConfidence: Math.round(maxAvailableConfidence),
    hasHighImpact,
    hasMediumImpact,
    hasLowImpact,
    hasLiquidity,
    hasRisk,
  };
}

export function SmartFilterEmptyState({
  allEntries,
  isMainPanel = false,
  className = '',
}: SmartFilterEmptyStateProps) {
  const filters = useSignalFilterStore();
  const { setMinConfidence, setImpactFilter, resetFilters } = filters;

  const analysis = useMemo(
    () => analyzeFilteredSignals(allEntries, filters),
    [allEntries, filters]
  );

  // If no signals at all, show "no signals yet" state
  if (analysis.totalSignals === 0) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <div className="text-3xl mb-3">📡</div>
        <h3 className="text-lg font-semibold mb-2 text-dark-300">
          {isMainPanel ? 'Radar is Monitoring' : 'No Signal History Yet'}
        </h3>
        <p className="text-dark-500 text-sm max-w-sm mx-auto">
          {isMainPanel
            ? 'Add tokens to your Watchlist to start receiving alerts when risks or liquidity changes are detected.'
            : 'Signals will appear here as Radar detects changes in your monitored tokens.'}
        </p>
      </div>
    );
  }

  // Signals exist but are filtered out - show smart messaging
  const primaryReason = getPrimaryReason(analysis, filters);
  const suggestedConfidence = getSuggestedConfidence(analysis, filters.minConfidence);

  return (
    <div className={`text-center py-6 ${className}`}>
      <div className="text-2xl mb-3">🔍</div>
      <h3 className="text-base font-semibold mb-2 text-dark-300">
        No signals matching your filters
      </h3>

      {/* Specific reason */}
      <div className="text-dark-400 text-sm mb-4 max-w-md mx-auto">
        {primaryReason}
      </div>

      {/* Current filter summary */}
      <div className="text-[11px] text-dark-600 font-mono mb-4 px-4">
        Active: {getFilterSummaryText(filters)}
      </div>

      {/* Quick fix buttons */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {/* Show confidence fix if that's the issue */}
        {analysis.hiddenByConfidence > 0 && suggestedConfidence !== null && (
          <button
            onClick={() => setMinConfidence(suggestedConfidence)}
            className="px-3 py-1.5 bg-primary-600/20 hover:bg-primary-600/30 text-primary-400 text-xs font-medium rounded-lg transition-colors"
          >
            Set to ≥{suggestedConfidence}%
          </button>
        )}

        {/* Show impact fix if that's the issue */}
        {analysis.hiddenByImpact > 0 && filters.impactFilter !== 'all' && (
          <button
            onClick={() => setImpactFilter('all')}
            className="px-3 py-1.5 bg-primary-600/20 hover:bg-primary-600/30 text-primary-400 text-xs font-medium rounded-lg transition-colors"
          >
            Show All Impacts
          </button>
        )}

        {/* Reset filters button */}
        <button
          onClick={resetFilters}
          className="px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-dark-300 text-xs font-medium rounded-lg transition-colors"
        >
          Reset Filters
        </button>
      </div>

      {/* Signal count hint */}
      <p className="text-[10px] text-dark-600 mt-3">
        {analysis.totalSignals} signal{analysis.totalSignals !== 1 ? 's' : ''} in last 24h
      </p>
    </div>
  );
}

function getPrimaryReason(
  analysis: FilterAnalysis,
  filters: {
    impactFilter: ImpactFilter;
    minConfidence: number;
    showLiquidity: boolean;
    showRisk: boolean;
  }
): string {
  // Priority: confidence > impact > type (most common issue first)
  if (analysis.hiddenByConfidence > 0) {
    return `Your signals are ${analysis.maxAvailableConfidence}% confidence, but filter is set to ≥${filters.minConfidence}%.`;
  }

  if (analysis.hiddenByImpact > 0) {
    const impactLabel = filters.impactFilter === 'high' ? 'High only' : 'High + Medium';
    const availableImpacts: string[] = [];
    if (analysis.hasLowImpact) availableImpacts.push('Low');
    if (analysis.hasMediumImpact && filters.impactFilter === 'high') availableImpacts.push('Medium');

    return `Signals have ${availableImpacts.join('/')} impact, but filter is set to "${impactLabel}".`;
  }

  if (analysis.hiddenByType > 0) {
    const hiddenTypes: string[] = [];
    if (!filters.showLiquidity && analysis.hasLiquidity) hiddenTypes.push('Liquidity');
    if (!filters.showRisk && analysis.hasRisk) hiddenTypes.push('Risk');

    return `${hiddenTypes.join(' and ')} signals are hidden by type filter.`;
  }

  return 'Signals are hidden by your current filter settings.';
}

function getSuggestedConfidence(analysis: FilterAnalysis, currentMin: number): number | null {
  // Suggest a confidence level that would reveal signals
  if (analysis.maxAvailableConfidence < currentMin) {
    // Round down to nearest 20% for cleaner UX
    const suggested = Math.floor(analysis.maxAvailableConfidence / 20) * 20;
    return Math.max(40, suggested); // Never suggest below 40%
  }
  return null;
}

function getFilterSummaryText(filters: {
  impactFilter: ImpactFilter;
  minConfidence: number;
  showLiquidity: boolean;
  showRisk: boolean;
}): string {
  const parts: string[] = [];

  // Impact
  if (filters.impactFilter === 'high') {
    parts.push('🔥 High only');
  } else if (filters.impactFilter === 'high+medium') {
    parts.push('High+Med');
  } else {
    parts.push('All impacts');
  }

  // Confidence
  parts.push(`≥${filters.minConfidence}%`);

  // Types (only show if disabled)
  const types: string[] = [];
  if (filters.showLiquidity) types.push('Liq');
  if (filters.showRisk) types.push('Risk');
  if (types.length < 2) {
    parts.push(types.join('+') || 'No types');
  }

  return parts.join(' · ');
}
