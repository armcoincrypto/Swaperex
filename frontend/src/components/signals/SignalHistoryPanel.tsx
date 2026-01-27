/**
 * Signal History Panel
 *
 * Displays recent signal history with user-friendly grouped view.
 * Priority 8.4 - Signal History & Replay
 *
 * Features:
 * - Grouped view by default (same token+type+impact within 60min)
 * - Advanced toggle for raw entries
 * - Calm visual design unless high severity
 * - TEST signals hidden in normal mode
 */

import { useState, useMemo, useEffect } from 'react';
import {
  useSignalHistoryStore,
  type SignalHistoryEntry,
  type GroupedSignalEntry,
  getTrendIcon,
  getTrendColorClass,
  formatRecurrenceText,
  groupSignalEntries,
} from '@/stores/signalHistoryStore';
import { useSignalFilterStore, shouldShowSignal } from '@/stores/signalFilterStore';
import { useDebugMode, isTestSignal } from '@/stores/debugStore';
import { SignalAge } from '@/components/signals/SignalAge';
import { SignalGuidance } from '@/components/signals/SignalGuidance';
import { TokenBadge } from '@/components/common/TokenDisplay';
import { prefetchTokenMeta } from '@/services/tokenMeta';
import { QuickActions } from '@/components/signals/QuickActions';
import { RiskScoreBreakdown } from '@/components/signals/RiskScoreBreakdown';
import { SmartFilterEmptyState } from '@/components/signals/SmartFilterEmptyState';

// LocalStorage keys for toggles
const ADVANCED_STORAGE_KEY = 'radar.history.advanced';
const SHOW_INFO_STORAGE_KEY = 'radar.history.showInformational';

interface SignalHistoryPanelProps {
  maxEntries?: number;
  compact?: boolean;
  /** Bypass filters (for debug mode) */
  bypassFilters?: boolean;
}

export function SignalHistoryPanel({ maxEntries = 10, compact = false, bypassFilters = false }: SignalHistoryPanelProps) {
  const { entries, clearHistory } = useSignalHistoryStore();
  const filters = useSignalFilterStore();
  const debugEnabled = useDebugMode();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replayingId, setReplayingId] = useState<string | null>(null);

  // Advanced mode toggle - persisted
  const [advancedMode, setAdvancedMode] = useState(() => {
    try {
      return localStorage.getItem(ADVANCED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggleAdvanced = () => {
    const newValue = !advancedMode;
    setAdvancedMode(newValue);
    try {
      localStorage.setItem(ADVANCED_STORAGE_KEY, String(newValue));
    } catch {
      // Ignore localStorage errors
    }
  };

  // Show informational toggle (only visible in Advanced mode)
  const [showInformational, setShowInformational] = useState(() => {
    try {
      return localStorage.getItem(SHOW_INFO_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggleShowInformational = () => {
    const newValue = !showInformational;
    setShowInformational(newValue);
    try {
      localStorage.setItem(SHOW_INFO_STORAGE_KEY, String(newValue));
    } catch {
      // Ignore localStorage errors
    }
  };

  // Prefetch metadata for all history entries
  useEffect(() => {
    if (entries.length > 0) {
      prefetchTokenMeta(entries.map((e) => ({
        chainId: e.chainId,
        address: e.token,
        symbol: e.tokenSymbol,
      })));
    }
  }, [entries]);

  // Apply filters to entries
  const filteredEntries = useMemo(() => {
    let filtered = entries;

    // Filter out TEST signals in normal mode
    if (!debugEnabled) {
      filtered = filtered.filter(
        (entry) => !isTestSignal(entry.tokenSymbol, entry.token)
      );
    }

    if (bypassFilters) return filtered;

    return filtered.filter((entry) =>
      shouldShowSignal(
        {
          type: entry.type,
          confidence: entry.confidence,
          impact: entry.impact,
        },
        filters
      )
    );
  }, [entries, filters, bypassFilters, debugEnabled]);

  // Group entries for user-friendly view
  const groupedEntries = useMemo(() => {
    return groupSignalEntries(filteredEntries);
  }, [filteredEntries]);

  // Filter groups by category based on mode
  const visibleGroups = useMemo(() => {
    if (!advancedMode) {
      // Normal mode: only show 'event' category
      return groupedEntries.filter((g) => g.category === 'event');
    }
    if (showInformational) {
      // Advanced + show informational: show events and informational
      return groupedEntries.filter((g) => g.category !== 'debug' || debugEnabled);
    }
    // Advanced mode: show events, hide informational unless toggled
    return groupedEntries.filter((g) => g.category === 'event' || (g.category === 'debug' && debugEnabled));
  }, [groupedEntries, advancedMode, showInformational, debugEnabled]);

  // Count hidden informational groups
  const hiddenInformationalCount = useMemo(() => {
    return groupedEntries.filter((g) => g.category === 'informational').length;
  }, [groupedEntries]);

  // Decide what to display based on mode
  const displayGroups = advancedMode ? null : visibleGroups.slice(0, maxEntries);
  const displayGroupsAdvanced = advancedMode ? visibleGroups.slice(0, maxEntries) : null;

  const hiddenByFilters = entries.length - filteredEntries.length;

  // Check if any high-impact signals exist
  const hasHighImpact = filteredEntries.some((e) => e.impact?.level === 'high');

  if (filteredEntries.length === 0) {
    return (
      <div className="p-4 bg-dark-800/50 rounded-lg border border-dark-700">
        <SmartFilterEmptyState
          allEntries={entries}
          isMainPanel={false}
          className="py-4"
        />
      </div>
    );
  }

  const handleReplay = (entry: SignalHistoryEntry) => {
    setReplayingId(entry.id);
    setTimeout(() => setReplayingId(null), 2000);
  };

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-dark-500 uppercase tracking-wider">
            Signal History
          </span>
          {/* Advanced toggle */}
          <button
            onClick={toggleAdvanced}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
              advancedMode
                ? 'bg-primary-900/30 text-primary-400'
                : 'bg-dark-700/50 text-dark-500 hover:text-dark-400'
            }`}
            title={advancedMode ? 'Switch to grouped view' : 'Show all groups'}
          >
            {advancedMode ? 'Advanced' : 'Events'}
          </button>
          {/* Show informational toggle - only in Advanced mode */}
          {advancedMode && hiddenInformationalCount > 0 && (
            <button
              onClick={toggleShowInformational}
              className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
                showInformational
                  ? 'bg-dark-600 text-dark-300'
                  : 'bg-dark-700/50 text-dark-600 hover:text-dark-400'
              }`}
              title={showInformational ? 'Hide routine checks' : 'Show routine checks'}
            >
              {showInformational ? `−${hiddenInformationalCount} info` : `+${hiddenInformationalCount} info`}
            </button>
          )}
        </div>
        {entries.length > 0 && (
          <button
            onClick={clearHistory}
            className="text-[10px] text-dark-600 hover:text-dark-400 transition-colors font-mono"
          >
            clear
          </button>
        )}
      </div>

      {/* Helper text - calm messaging */}
      {!hasHighImpact && visibleGroups.length > 0 && (
        <div className="px-1 text-[10px] text-dark-500">
          Showing meaningful events only. {hiddenInformationalCount > 0 && `${hiddenInformationalCount} routine checks hidden.`}
        </div>
      )}
      {!hasHighImpact && visibleGroups.length === 0 && hiddenInformationalCount > 0 && (
        <div className="px-1 text-[10px] text-green-500/70">
          ✓ No significant events. {hiddenInformationalCount} routine checks in background.
        </div>
      )}

      {/* Entry List - Grouped View (default: Events only) */}
      {!advancedMode && displayGroups && displayGroups.length > 0 && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {displayGroups.map((group) => (
            <GroupedSignalItem
              key={group.entry.id}
              group={group}
              expanded={expandedId === group.entry.id}
              replaying={replayingId === group.entry.id}
              compact={compact}
              debugEnabled={debugEnabled}
              onToggle={() => setExpandedId(expandedId === group.entry.id ? null : group.entry.id)}
              onReplay={() => handleReplay(group.entry)}
            />
          ))}
        </div>
      )}

      {/* Entry List - Grouped View (advanced: with category visibility) */}
      {advancedMode && displayGroupsAdvanced && displayGroupsAdvanced.length > 0 && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {displayGroupsAdvanced.map((group) => (
            <GroupedSignalItem
              key={group.entry.id}
              group={group}
              expanded={expandedId === group.entry.id}
              replaying={replayingId === group.entry.id}
              compact={compact}
              debugEnabled={debugEnabled}
              onToggle={() => setExpandedId(expandedId === group.entry.id ? null : group.entry.id)}
              onReplay={() => handleReplay(group.entry)}
            />
          ))}
        </div>
      )}

      {/* Footer info */}
      {(visibleGroups.length > maxEntries || hiddenByFilters > 0 || (!advancedMode && hiddenInformationalCount > 0)) && (
        <div className="text-center text-[10px] text-dark-600 font-mono space-x-2">
          {visibleGroups.length > maxEntries && (
            <span>+{visibleGroups.length - maxEntries} more</span>
          )}
          {hiddenByFilters > 0 && (
            <span className="text-dark-500">({hiddenByFilters} by filters)</span>
          )}
        </div>
      )}
    </div>
  );
}

interface GroupedSignalItemProps {
  group: GroupedSignalEntry;
  expanded: boolean;
  replaying: boolean;
  compact: boolean;
  debugEnabled: boolean;
  onToggle: () => void;
  onReplay: () => void;
}

function GroupedSignalItem({
  group,
  expanded,
  replaying,
  compact,
  debugEnabled,
  onToggle,
  onReplay,
}: GroupedSignalItemProps) {
  const { entry, count, firstSeen, lastSeen, category, reasonTags } = group;
  const isHigh = entry.impact?.level === 'high';
  const isMedium = entry.impact?.level === 'medium';
  const isInformational = category === 'informational';

  // Calm styling unless high impact
  const borderClass = isHigh
    ? 'border-red-800/40'
    : isMedium
    ? 'border-yellow-800/30'
    : isInformational
    ? 'border-dark-700/30'
    : 'border-dark-700/50';

  const bgClass = isHigh
    ? 'bg-red-900/10'
    : isMedium
    ? 'bg-yellow-900/5'
    : isInformational
    ? 'bg-dark-900/30'
    : 'bg-dark-800/30';

  return (
    <div
      className={`rounded-lg border transition-all text-xs ${borderClass} ${bgClass} ${
        replaying ? 'animate-pulse' : ''
      } ${expanded ? 'ring-1 ring-dark-600' : ''} ${compact ? 'py-1' : ''}`}
    >
      {/* Main Row */}
      <button
        onClick={onToggle}
        className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-dark-700/20 transition-colors rounded-lg"
      >
        {/* Impact indicator - simple dot */}
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            isHigh ? 'bg-red-500' : isMedium ? 'bg-yellow-500' : isInformational ? 'bg-dark-600' : 'bg-dark-500'
          }`}
        />

        {/* Reason Tags - primary context for why this signal exists */}
        {reasonTags.length > 0 && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium truncate max-w-[100px] ${
            isHigh ? 'bg-red-900/30 text-red-400' :
            isMedium ? 'bg-yellow-900/20 text-yellow-400' :
            isInformational ? 'bg-dark-700/50 text-dark-500' :
            'bg-dark-700/50 text-dark-400'
          }`} title={reasonTags.join(', ')}>
            {reasonTags[0]}
          </span>
        )}

        {/* Token */}
        <TokenBadge
          chainId={entry.chainId}
          address={entry.token}
          symbol={entry.tokenSymbol}
          className="truncate flex-1"
        />

        {/* Occurrence count - friendly text */}
        {count > 1 && (
          <span className="text-[10px] text-dark-400 bg-dark-700/50 px-1.5 py-0.5 rounded">
            {count}×
          </span>
        )}

        {/* Time - relative to last seen */}
        <SignalAge
          timestamp={lastSeen}
          compact
          className="text-dark-500 text-[10px] flex-shrink-0"
        />

        {/* Expand Arrow */}
        <span className="text-dark-600 text-[10px]">
          {expanded ? '▼' : '▶'}
        </span>
      </button>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-dark-700/30 space-y-2">
          {/* All Reason Tags */}
          {reasonTags.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {reasonTags.map((tag, i) => (
                <span
                  key={i}
                  className={`text-[9px] px-1.5 py-0.5 rounded ${
                    isHigh ? 'bg-red-900/20 text-red-400' :
                    isMedium ? 'bg-yellow-900/20 text-yellow-400' :
                    'bg-dark-700/50 text-dark-500'
                  }`}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Time range if multiple occurrences */}
          {count > 1 && (
            <div className="text-[10px] text-dark-500">
              First seen <SignalAge timestamp={firstSeen} compact className="inline" /> ·
              Last seen <SignalAge timestamp={lastSeen} compact className="inline" />
            </div>
          )}

          {/* Impact breakdown */}
          {entry.impact && (
            <RiskScoreBreakdown
              impact={entry.impact}
              type={entry.type}
              riskFactors={entry.debugSnapshot?.risk?.riskFactors}
              liquidityDropPct={entry.debugSnapshot?.liquidity?.dropPct ?? undefined}
              className="mt-2"
            />
          )}

          {/* Recurrence Info */}
          {entry.recurrence && (
            <div className={`text-[10px] ${getTrendColorClass(entry.recurrence.trend)}`}>
              {getTrendIcon(entry.recurrence.trend)} {formatRecurrenceText(entry.recurrence)}
            </div>
          )}

          {/* Reason - hide technical messages */}
          {(debugEnabled || !entry.reason.toLowerCase().includes('cache')) && (
            <div className="text-dark-400 text-[10px]">
              {entry.reason}
            </div>
          )}

          {/* Debug info - only in debug mode */}
          {debugEnabled && entry.debugSnapshot && (
            <div className="bg-dark-900/50 rounded p-2 text-[10px] space-y-1 font-mono">
              {entry.debugSnapshot.liquidity?.currentLiquidity !== undefined && (
                <div className="text-dark-500">
                  liquidity: ${entry.debugSnapshot.liquidity.currentLiquidity?.toLocaleString()}
                </div>
              )}
              {entry.debugSnapshot.risk?.riskFactorCount !== undefined && (
                <div className="text-dark-500">
                  risk factors: {entry.debugSnapshot.risk.riskFactorCount}
                </div>
              )}
            </div>
          )}

          {/* Signal Guidance */}
          <SignalGuidance
            type={entry.type}
            impactLevel={entry.impact?.level}
            recurrence={entry.recurrence}
            riskFactors={entry.debugSnapshot?.risk?.riskFactors}
            liquidityDropPct={entry.debugSnapshot?.liquidity?.dropPct ?? undefined}
          />

          {/* Quick Actions */}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReplay();
              }}
              className="px-2 py-1 bg-dark-700 text-dark-300 rounded text-[10px] hover:bg-dark-600 transition-colors"
            >
              ▶ Replay
            </button>
            <QuickActions
              chainId={entry.chainId}
              address={entry.token}
              symbol={entry.tokenSymbol}
              showSwap={false}
            />
          </div>

          {/* Individual entries - collapsible in debug mode */}
          {debugEnabled && count > 1 && (
            <details className="text-[9px] text-dark-600 mt-2">
              <summary className="cursor-pointer hover:text-dark-400">
                Show {count} individual entries
              </summary>
              <div className="mt-1 space-y-1 pl-2 border-l border-dark-700">
                {group.entries.map((e, i) => (
                  <div key={e.id} className="text-dark-500">
                    {i + 1}. <SignalAge timestamp={e.timestamp} compact className="inline" /> - conf: {Math.round(e.confidence * 100)}%
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

export default SignalHistoryPanel;
