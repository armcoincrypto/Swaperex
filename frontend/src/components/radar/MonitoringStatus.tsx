/**
 * Monitoring Status Indicator
 *
 * Shows subtle activity status: number of monitored tokens and last scan time.
 * Creates trust and sense of protection.
 *
 * UX Clarity Improvement
 */

import { useState, useEffect } from 'react';
import { useWatchlistStore } from '@/stores/watchlistStore';
import { getLastPollTime, isMonitorRunning } from '@/services/watchlistMonitor';

function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return 'Not yet';

  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 120) return '1 minute ago';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 7200) return '1 hour ago';
  return `${Math.floor(seconds / 3600)} hours ago`;
}

export function MonitoringStatus({ className = '' }: { className?: string }) {
  const tokens = useWatchlistStore((s) => s.tokens);
  const [lastPoll, setLastPoll] = useState(getLastPollTime());
  const [, forceUpdate] = useState(0);

  // Update last poll time periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setLastPoll(getLastPollTime());
      forceUpdate((n) => n + 1); // Force re-render for time ago
    }, 10000); // Every 10 seconds

    return () => clearInterval(interval);
  }, []);

  const tokenCount = tokens.length;
  const isActive = isMonitorRunning() && tokenCount > 0;

  return (
    <div className={`text-[11px] text-dark-500 ${className}`}>
      <span className={isActive ? 'text-green-500' : 'text-dark-600'}>●</span>
      {' '}
      {tokenCount > 0 ? (
        <>
          Monitoring {tokenCount} token{tokenCount !== 1 ? 's' : ''}
          {lastPoll > 0 && (
            <span className="text-dark-600"> · Last scan {formatTimeAgo(lastPoll)}</span>
          )}
        </>
      ) : (
        <span className="text-dark-600">No tokens monitored — add to Watchlist to start</span>
      )}
    </div>
  );
}

export default MonitoringStatus;
