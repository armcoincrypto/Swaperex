/**
 * Recurrence Badge Component
 *
 * Displays signal recurrence info with trend indicators.
 * Shows: "New" | "2× today" with trend arrow.
 *
 * Priority 10.3 - Time Context & Recurrence
 */

import {
  type SignalRecurrence,
  getTrendIcon,
  getTrendColorClass,
} from '@/stores/signalHistoryStore';

interface RecurrenceBadgeProps {
  recurrence: SignalRecurrence;
  /** Impact level for context (optional) */
  impactLevel?: 'high' | 'medium' | 'low';
  /** Compact mode - smaller badge */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function RecurrenceBadge({ recurrence, impactLevel, compact = false, className = '' }: RecurrenceBadgeProps) {
  const trendIcon = getTrendIcon(recurrence.trend);
  const trendColorClass = getTrendColorClass(recurrence.trend);

  // First occurrence
  if (!recurrence.isRepeat) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-blue-400 bg-blue-900/20 ${
          compact ? 'text-[9px]' : 'text-[10px]'
        } ${className}`}
        title="First occurrence in 24 hours"
      >
        <span>🆕</span>
        {!compact && <span>New</span>}
      </span>
    );
  }

  // Check if this is a "calm" repeat (low impact + stable/decreasing trend)
  const isCalm = impactLevel === 'low' && (recurrence.trend === 'stable' || recurrence.trend === 'decreasing');
  const contextLabel = isCalm ? (recurrence.trend === 'stable' ? 'stable' : 'improving') : null;

  // Repeat occurrence
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-dark-700/50 ${
        compact ? 'text-[9px]' : 'text-[10px]'
      } ${className}`}
      title={`${recurrence.occurrences24h} occurrences in 24h, trend: ${recurrence.trend}${isCalm ? ' (expected behavior)' : ''}`}
    >
      {/* Repeat indicator */}
      <span className="text-dark-400">↻</span>
      <span className="text-dark-300">{recurrence.occurrences24h}×</span>

      {/* Trend arrow */}
      {recurrence.trend !== 'new' && (
        <span className={trendColorClass}>{trendIcon}</span>
      )}

      {/* Context label for calm repeats */}
      {!compact && contextLabel && (
        <span className="text-dark-500">({contextLabel})</span>
      )}
    </span>
  );
}

/**
 * Inline recurrence indicator for compact displays
 */
export function RecurrenceIndicator({ recurrence, className = '' }: { recurrence: SignalRecurrence; className?: string }) {
  if (!recurrence.isRepeat) {
    return null;
  }

  const trendIcon = getTrendIcon(recurrence.trend);
  const trendColorClass = getTrendColorClass(recurrence.trend);

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] ${className}`}
      title={`${recurrence.occurrences24h}× in 24h`}
    >
      <span className="text-dark-500">↻{recurrence.occurrences24h}</span>
      <span className={trendColorClass}>{trendIcon}</span>
    </span>
  );
}

export default RecurrenceBadge;
