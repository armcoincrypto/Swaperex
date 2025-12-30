/**
 * Signal History Panel
 *
 * Displays recent signal history with replay capability.
 * Priority 8.4 - Signal History & Replay
 *
 * Features:
 * - Compact scrollable list
 * - Terminal-style display
 * - Click to expand debug details
 * - Replay mode (visual simulation)
 */

import { useState, useMemo } from 'react';
import {
  useSignalHistoryStore,
  type SignalHistoryEntry,
  getSeverityColor,
  getSeverityIcon,
  getTrendIcon,
  getTrendColorClass,
  formatRecurrenceText,
} from '@/stores/signalHistoryStore';
import { useSignalFilterStore, shouldShowSignal } from '@/stores/signalFilterStore';
import { getImpactIcon } from '@/components/signals/ImpactBadge';
import { SignalAge } from '@/components/signals/SignalAge';
import { RecurrenceBadge } from '@/components/signals/RecurrenceBadge';

interface SignalHistoryPanelProps {
  maxEntries?: number;
  compact?: boolean;
  /** Bypass filters (for debug mode) */
  bypassFilters?: boolean;
}

export function SignalHistoryPanel({ maxEntries = 10, compact = false, bypassFilters = false }: SignalHistoryPanelProps) {
  const { entries, clearHistory } = useSignalHistoryStore();
  const filters = useSignalFilterStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replayingId, setReplayingId] = useState<string | null>(null);

  // Apply filters to entries
  const filteredEntries = useMemo(() => {
    if (bypassFilters) return entries;

    return entries.filter((entry) =>
      shouldShowSignal(
        {
          type: entry.type,
          confidence: entry.confidence,
          impact: entry.impact,
        },
        filters
      )
    );
  }, [entries, filters, bypassFilters]);

  const displayEntries = filteredEntries.slice(0, maxEntries);
  const hiddenByFilters = entries.length - filteredEntries.length;

  if (displayEntries.length === 0) {
    return (
      <div className="p-4 bg-dark-800/50 rounded-lg border border-dark-700">
        <div className="text-center text-dark-500 text-sm font-mono">
          <span className="text-dark-600">$</span>{' '}
          {hiddenByFilters > 0
            ? `${hiddenByFilters} signals hidden by filters`
            : 'No signal history yet'}
        </div>
      </div>
    );
  }

  const handleReplay = (entry: SignalHistoryEntry) => {
    setReplayingId(entry.id);
    // Simulate replay animation
    setTimeout(() => {
      setReplayingId(null);
    }, 2000);
  };

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="text-xs font-mono text-dark-500 uppercase tracking-wider">
          Signal History
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

      {/* Entry List */}
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {displayEntries.map((entry) => (
          <SignalHistoryItem
            key={entry.id}
            entry={entry}
            expanded={expandedId === entry.id}
            replaying={replayingId === entry.id}
            compact={compact}
            onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
            onReplay={() => handleReplay(entry)}
          />
        ))}
      </div>

      {/* More indicator */}
      {(filteredEntries.length > maxEntries || hiddenByFilters > 0) && (
        <div className="text-center text-[10px] text-dark-600 font-mono space-x-2">
          {filteredEntries.length > maxEntries && (
            <span>+{filteredEntries.length - maxEntries} more</span>
          )}
          {hiddenByFilters > 0 && (
            <span className="text-dark-500">({hiddenByFilters} filtered)</span>
          )}
        </div>
      )}
    </div>
  );
}

interface SignalHistoryItemProps {
  entry: SignalHistoryEntry;
  expanded: boolean;
  replaying: boolean;
  compact: boolean;
  onToggle: () => void;
  onReplay: () => void;
}

function SignalHistoryItem({
  entry,
  expanded,
  replaying,
  compact,
  onToggle,
  onReplay,
}: SignalHistoryItemProps) {
  const severityColor = getSeverityColor(entry.severity);
  const severityIcon = getSeverityIcon(entry.severity);

  return (
    <div
      className={`
        rounded-lg border transition-all font-mono text-xs
        ${replaying ? 'bg-primary-900/20 border-primary-700 animate-pulse' : 'bg-dark-800/50 border-dark-700'}
        ${expanded ? 'ring-1 ring-dark-600' : ''}
        ${compact ? 'py-1' : ''}
      `}
    >
      {/* Main Row */}
      <button
        onClick={onToggle}
        className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-dark-700/30 transition-colors rounded-lg"
      >
        {/* Severity Icon */}
        <span className="flex-shrink-0">{severityIcon}</span>

        {/* Type Badge */}
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
            entry.type === 'liquidity'
              ? 'bg-blue-900/30 text-blue-400'
              : 'bg-orange-900/30 text-orange-400'
          }`}
        >
          {entry.type === 'liquidity' ? 'LIQ' : 'RISK'}
        </span>

        {/* Impact Badge */}
        {entry.impact && (
          <span
            className={`px-1 text-[10px] ${
              entry.impact.level === 'high'
                ? 'text-red-400'
                : entry.impact.level === 'medium'
                ? 'text-orange-400'
                : 'text-gray-500'
            }`}
            title={`Impact: ${entry.impact.score} - ${entry.impact.reason}`}
          >
            {getImpactIcon(entry.impact.level)}
          </span>
        )}

        {/* Recurrence Badge (Priority 10.3) */}
        {entry.recurrence && (
          <RecurrenceBadge recurrence={entry.recurrence} compact />
        )}

        {/* Token */}
        <span className="text-dark-200 font-medium truncate flex-1">
          {entry.tokenSymbol || entry.token.slice(0, 8) + '...'}
        </span>

        {/* Confidence */}
        <span className={`px-1 py-0.5 rounded text-[10px] ${severityColor}`}>
          {Math.round(entry.confidence * 100)}%
        </span>

        {/* Time (Live-updating - Priority 10.3.1) */}
        <SignalAge
          timestamp={entry.timestamp}
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
        <div className="px-3 pb-3 pt-1 border-t border-dark-700/50 space-y-2">
          {/* Reason */}
          <div className="text-dark-400">
            <span className="text-dark-600">reason:</span> {entry.reason}
          </div>

          {/* Impact Score */}
          {entry.impact && (
            <div className={`${
              entry.impact.level === 'high'
                ? 'text-red-400'
                : entry.impact.level === 'medium'
                ? 'text-orange-400'
                : 'text-gray-400'
            }`}>
              <span className="text-dark-600">impact:</span>{' '}
              {getImpactIcon(entry.impact.level)} {entry.impact.score}/100 ({entry.impact.level})
            </div>
          )}

          {/* Escalation */}
          {entry.escalated && (
            <div className="text-orange-400">
              <span className="text-dark-600">escalated:</span> {entry.previousSeverity} → {entry.severity}
            </div>
          )}

          {/* Recurrence Info (Priority 10.3) */}
          {entry.recurrence && (
            <div className={getTrendColorClass(entry.recurrence.trend)}>
              <span className="text-dark-600">recurrence:</span>{' '}
              {getTrendIcon(entry.recurrence.trend)} {formatRecurrenceText(entry.recurrence)}
              {entry.recurrence.previousImpact !== null && (
                <span className="text-dark-500 ml-2">
                  (prev: {entry.recurrence.previousImpact})
                </span>
              )}
            </div>
          )}

          {/* Debug Snapshot */}
          {entry.debugSnapshot && (
            <div className="bg-dark-900/50 rounded p-2 space-y-1">
              {/* Liquidity Debug */}
              {entry.debugSnapshot.liquidity && (
                <>
                  {entry.debugSnapshot.liquidity.currentLiquidity !== null && (
                    <div className="text-dark-500">
                      <span className="text-dark-600">liquidity:</span> ${entry.debugSnapshot.liquidity.currentLiquidity.toLocaleString()}
                    </div>
                  )}
                  {entry.debugSnapshot.liquidity.dropPct !== null && entry.debugSnapshot.liquidity.dropPct > 0 && (
                    <div className="text-red-400">
                      <span className="text-dark-600">drop:</span> {entry.debugSnapshot.liquidity.dropPct.toFixed(1)}%
                    </div>
                  )}
                </>
              )}

              {/* Risk Debug */}
              {entry.debugSnapshot.risk && (
                <>
                  <div className="text-dark-500">
                    <span className="text-dark-600">factors:</span> {entry.debugSnapshot.risk.riskFactorCount}
                  </div>
                  {entry.debugSnapshot.risk.isHoneypot && (
                    <div className="text-red-400 font-bold">
                      HONEYPOT DETECTED
                    </div>
                  )}
                  {entry.debugSnapshot.risk.riskFactors.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {entry.debugSnapshot.risk.riskFactors.slice(0, 3).map((factor, i) => (
                        <span
                          key={i}
                          className="px-1 py-0.5 bg-red-900/20 text-red-400/80 rounded text-[10px]"
                        >
                          {factor.replace(/_/g, ' ')}
                        </span>
                      ))}
                      {entry.debugSnapshot.risk.riskFactors.length > 3 && (
                        <span className="text-dark-600 text-[10px]">
                          +{entry.debugSnapshot.risk.riskFactors.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Cooldown Status */}
              {entry.debugSnapshot.cooldown && (
                <div className="text-dark-500">
                  <span className="text-dark-600">cooldown:</span>{' '}
                  {entry.debugSnapshot.cooldown.active
                    ? `active (${Math.floor(entry.debugSnapshot.cooldown.remainingSeconds / 60)}m)`
                    : 'inactive'}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReplay();
              }}
              className="px-2 py-1 bg-primary-900/30 text-primary-400 rounded text-[10px] hover:bg-primary-900/50 transition-colors"
            >
              ▶ Replay
            </button>
            <span className="text-dark-600 text-[10px]">
              Chain {entry.chainId}
            </span>
          </div>
        </div>
      )}

      {/* Replay Animation Overlay */}
      {replaying && (
        <div className="absolute inset-0 flex items-center justify-center bg-dark-900/80 rounded-lg">
          <div className="text-primary-400 text-sm font-mono animate-pulse">
            Replaying signal...
          </div>
        </div>
      )}
    </div>
  );
}

export default SignalHistoryPanel;
