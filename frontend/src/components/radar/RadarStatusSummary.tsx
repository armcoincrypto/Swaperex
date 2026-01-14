/**
 * Radar Status Summary Component
 *
 * Shows a single-line status summary answering "Am I safe right now?"
 * Green / Yellow / Red based on signal impact levels.
 *
 * Radar Context & Guidance Upgrade - Step 3
 */

import { useMemo } from 'react';
import { useSignalHistoryStore } from '@/stores/signalHistoryStore';
import { useWatchlistStore } from '@/stores/watchlistStore';

interface RadarStatusSummaryProps {
  className?: string;
}

type StatusLevel = 'green' | 'yellow' | 'red';

interface StatusInfo {
  level: StatusLevel;
  icon: string;
  message: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
}

export function RadarStatusSummary({ className = '' }: RadarStatusSummaryProps) {
  const entries = useSignalHistoryStore((s) => s.entries);
  const watchedTokens = useWatchlistStore((s) => s.tokens);

  // Calculate status based on recent signals (last 24h)
  const status: StatusInfo = useMemo(() => {
    // Filter to recent entries only (last 24h)
    const recentCutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recentEntries = entries.filter((e) => e.timestamp > recentCutoff);

    // Count by impact level
    const highImpactCount = recentEntries.filter(
      (e) => e.impact?.level === 'high'
    ).length;
    const mediumImpactCount = recentEntries.filter(
      (e) => e.impact?.level === 'medium'
    ).length;

    // Determine status level
    if (highImpactCount > 0) {
      return {
        level: 'red' as StatusLevel,
        icon: '🔴',
        message: highImpactCount === 1
          ? '1 token shows high-risk behavior — review recommended'
          : `${highImpactCount} tokens show high-risk behavior — review recommended`,
        bgColor: 'bg-red-900/10',
        textColor: 'text-red-400',
        borderColor: 'border-red-900/30',
      };
    }

    if (mediumImpactCount > 0) {
      return {
        level: 'yellow' as StatusLevel,
        icon: '🟡',
        message: mediumImpactCount === 1
          ? '1 token has medium-risk indicators — monitoring closely'
          : `${mediumImpactCount} tokens have medium-risk indicators — monitoring closely`,
        bgColor: 'bg-yellow-900/10',
        textColor: 'text-yellow-400',
        borderColor: 'border-yellow-900/30',
      };
    }

    // Green status
    if (watchedTokens.length === 0) {
      return {
        level: 'green' as StatusLevel,
        icon: '🟢',
        message: 'Add tokens to your watchlist to start monitoring',
        bgColor: 'bg-dark-800/50',
        textColor: 'text-dark-400',
        borderColor: 'border-dark-700/50',
      };
    }

    return {
      level: 'green' as StatusLevel,
      icon: '🟢',
      message: 'No high-impact risks detected for your monitored tokens',
      bgColor: 'bg-green-900/10',
      textColor: 'text-green-400',
      borderColor: 'border-green-900/30',
    };
  }, [entries, watchedTokens.length]);

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border ${status.bgColor} ${status.borderColor} ${className}`}
    >
      <span className="text-base flex-shrink-0">{status.icon}</span>
      <span className={`text-xs ${status.textColor}`}>{status.message}</span>

      {/* Subtle monitoring indicator */}
      {watchedTokens.length > 0 && (
        <span className="ml-auto text-[10px] text-dark-600 flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
          Monitoring {watchedTokens.length} token{watchedTokens.length !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

/**
 * Compact inline version for tight spaces
 */
export function RadarStatusBadge({ className = '' }: { className?: string }) {
  const entries = useSignalHistoryStore((s) => s.entries);

  const status = useMemo(() => {
    const recentCutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recentEntries = entries.filter((e) => e.timestamp > recentCutoff);

    const hasHigh = recentEntries.some((e) => e.impact?.level === 'high');
    const hasMedium = recentEntries.some((e) => e.impact?.level === 'medium');

    if (hasHigh) return { icon: '🔴', label: 'High risk detected', color: 'text-red-400' };
    if (hasMedium) return { icon: '🟡', label: 'Medium risk', color: 'text-yellow-400' };
    return { icon: '🟢', label: 'All clear', color: 'text-green-400' };
  }, [entries]);

  return (
    <span className={`flex items-center gap-1 text-[10px] ${status.color} ${className}`}>
      <span>{status.icon}</span>
      <span>{status.label}</span>
    </span>
  );
}

export default RadarStatusSummary;
