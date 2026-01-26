/**
 * Watchlist Panel Component
 *
 * Displays watched tokens with quick actions.
 * Priority 11.1 - Watchlist + Auto-Monitor
 * Step 1 - Token Metadata Layer
 * Phase 3 - Dashboard improvements
 */

import { useState, useEffect, useMemo } from 'react';
import { useWatchlistStore, type WatchlistSource } from '@/stores/watchlistStore';
import { useSignalHistoryStore } from '@/stores/signalHistoryStore';
import { pollSingleToken, getLastPollTime } from '@/services/watchlistMonitor';
import { TokenDisplay } from '@/components/common/TokenDisplay';
import { prefetchTokenMeta } from '@/services/tokenMeta';
import { formatTimeAgo } from '@/utils/time';

interface WatchlistPanelProps {
  className?: string;
}

/** Get friendly display label for watchlist source */
function getSourceLabel(source?: WatchlistSource): { text: string; icon: string; className: string } {
  switch (source) {
    case 'wallet_scan':
      return { text: 'From wallet', icon: '🔎', className: 'bg-blue-900/20 text-blue-400' };
    case 'token_check':
      return { text: 'Checked it', icon: '🔍', className: 'bg-purple-900/20 text-purple-400' };
    case 'manual':
    default:
      return { text: 'You added', icon: '✋', className: 'bg-dark-600/50 text-dark-400' };
  }
}

/** Get severity status for a token based on recent signals */
function getTokenSeverity(
  chainId: number,
  address: string,
  historyEntries: Array<{ chainId: number; token: string; impact?: { level: string } }>
): 'high' | 'medium' | 'low' | null {
  // Check for alerts in last 24h for this token
  const tokenAlerts = historyEntries.filter(
    (e) => e.chainId === chainId && e.token.toLowerCase() === address.toLowerCase()
  );

  if (tokenAlerts.length === 0) return null;

  // Return highest severity
  if (tokenAlerts.some((e) => e.impact?.level === 'high')) return 'high';
  if (tokenAlerts.some((e) => e.impact?.level === 'medium')) return 'medium';
  return 'low';
}

export function WatchlistPanel({ className = '' }: WatchlistPanelProps) {
  const { tokens, removeToken, clear } = useWatchlistStore();
  const historyEntries = useSignalHistoryStore((s) => s.entries);
  const [checkingToken, setCheckingToken] = useState<string | null>(null);
  const [lastPollTime, setLastPollTime] = useState<number>(0);

  // Update last poll time periodically
  useEffect(() => {
    const updatePollTime = () => setLastPollTime(getLastPollTime());
    updatePollTime();
    const interval = setInterval(updatePollTime, 10000); // Update every 10s
    return () => clearInterval(interval);
  }, []);

  // Prefetch metadata for all watchlist tokens
  useEffect(() => {
    if (tokens.length > 0) {
      prefetchTokenMeta(tokens.map((t) => ({
        chainId: t.chainId,
        address: t.address,
        symbol: t.symbol,
      })));
    }
  }, [tokens]);

  // Sort tokens by severity (high risk first, then medium, then safe)
  const sortedTokens = useMemo(() => {
    return [...tokens].sort((a, b) => {
      const severityA = getTokenSeverity(a.chainId, a.address, historyEntries);
      const severityB = getTokenSeverity(b.chainId, b.address, historyEntries);

      const severityOrder = { high: 0, medium: 1, low: 2, null: 3 };
      const orderA = severityOrder[severityA ?? 'null'];
      const orderB = severityOrder[severityB ?? 'null'];

      return orderA - orderB;
    });
  }, [tokens, historyEntries]);

  const handleCheckNow = async (chainId: number, address: string) => {
    setCheckingToken(address);
    try {
      await pollSingleToken(chainId, address);
    } finally {
      setTimeout(() => setCheckingToken(null), 500);
    }
  };

  // Format last poll time
  const lastCheckedText = lastPollTime > 0
    ? `Last checked ${formatTimeAgo(lastPollTime)}`
    : 'Not checked yet';

  if (tokens.length === 0) {
    return (
      <div className={`bg-dark-800/50 rounded-lg p-4 ${className}`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">⭐</span>
          <h3 className="text-sm font-medium text-dark-300">Watchlist</h3>
          <span className="text-[10px] text-dark-500">(Auto-monitor)</span>
        </div>
        <p className="text-[11px] text-dark-500">
          No tokens watched. Use ☆ to add tokens for automatic signal monitoring.
        </p>
      </div>
    );
  }

  return (
    <div className={`bg-dark-800/50 rounded-lg p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">⭐</span>
          <h3 className="text-sm font-medium text-dark-300">Watchlist</h3>
          <span className="text-[10px] text-dark-500">(Auto-monitor)</span>
          <span className="px-1.5 py-0.5 bg-dark-700 text-dark-400 text-[10px] rounded">
            {tokens.length}/20
          </span>
        </div>
        {tokens.length > 0 && (
          <button
            onClick={clear}
            className="text-[10px] text-dark-600 hover:text-dark-400 transition-colors"
          >
            clear all
          </button>
        )}
      </div>

      {/* Clarity line */}
      <p className="text-[10px] text-dark-500 mb-2">
        Monitored for risk signals. Use Wallet Scan to discover tokens.
      </p>

      {/* Token List */}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {sortedTokens.map((token) => {
          const sourceInfo = getSourceLabel(token.source);
          const severity = getTokenSeverity(token.chainId, token.address, historyEntries);

          return (
            <div
              key={`${token.chainId}-${token.address}`}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg group transition-colors ${
                severity === 'high'
                  ? 'bg-red-900/20 border border-red-800/30'
                  : severity === 'medium'
                  ? 'bg-yellow-900/20 border border-yellow-800/30'
                  : 'bg-dark-700/50'
              }`}
            >
              {/* Severity Indicator */}
              {severity && (
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    severity === 'high' ? 'bg-red-500' :
                    severity === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'
                  }`}
                  title={`${severity} risk signal detected`}
                />
              )}

              {/* Token Display with Logo/Name/Price */}
              <TokenDisplay
                chainId={token.chainId}
                address={token.address}
                symbol={token.symbol}
                showPrice
                showChain
                compact
                className="flex-1 min-w-0"
              />

              {/* Source Badge - friendly text */}
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded hidden sm:inline-flex items-center gap-1 ${sourceInfo.className}`}
                title={`How this token was added`}
              >
                <span>{sourceInfo.icon}</span>
                <span>{sourceInfo.text}</span>
              </span>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Check Now */}
                <button
                  onClick={() => handleCheckNow(token.chainId, token.address)}
                  disabled={checkingToken === token.address}
                  className={`px-2 py-1 rounded text-[10px] transition-colors ${
                    checkingToken === token.address
                      ? 'bg-primary-900/50 text-primary-400'
                      : 'bg-dark-600 text-dark-300 hover:bg-dark-500'
                  }`}
                  title="Check signals now"
                >
                  {checkingToken === token.address ? '...' : '↻'}
                </button>

                {/* Remove */}
                <button
                  onClick={() => removeToken(token.chainId, token.address)}
                  className="px-2 py-1 bg-dark-600 text-dark-400 rounded text-[10px] hover:bg-red-900/30 hover:text-red-400 transition-colors"
                  title="Remove from watchlist"
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Monitor Status with Last Checked */}
      <div className="mt-3 pt-2 border-t border-dark-700/50 flex items-center justify-between text-[10px] text-dark-500">
        <span>Auto-monitoring every 60s</span>
        <span className="text-dark-600">{lastCheckedText}</span>
      </div>
    </div>
  );
}

export default WatchlistPanel;
