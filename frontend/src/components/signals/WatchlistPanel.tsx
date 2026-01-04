/**
 * Watchlist Panel Component
 *
 * Displays watched tokens with quick actions.
 * Priority 11.1 - Watchlist + Auto-Monitor
 */

import { useWatchlistStore, getChainName, formatAddress } from '@/stores/watchlistStore';
import { pollSingleToken } from '@/services/watchlistMonitor';
import { useState } from 'react';

interface WatchlistPanelProps {
  className?: string;
}

export function WatchlistPanel({ className = '' }: WatchlistPanelProps) {
  const { tokens, removeToken, clear } = useWatchlistStore();
  const [checkingToken, setCheckingToken] = useState<string | null>(null);

  const handleCheckNow = async (chainId: number, address: string) => {
    setCheckingToken(address);
    try {
      await pollSingleToken(chainId, address);
    } finally {
      setTimeout(() => setCheckingToken(null), 500);
    }
  };

  if (tokens.length === 0) {
    return (
      <div className={`bg-dark-800/50 rounded-lg p-4 ${className}`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">⭐</span>
          <h3 className="text-sm font-medium text-dark-300">Watchlist</h3>
        </div>
        <p className="text-[11px] text-dark-500">
          No tokens watched. Use ☆ to add tokens for auto-monitoring.
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

      {/* Token List */}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {tokens.map((token) => (
          <div
            key={`${token.chainId}-${token.address}`}
            className="flex items-center gap-2 px-2 py-1.5 bg-dark-700/50 rounded-lg group"
          >
            {/* Chain Badge */}
            <span className="px-1.5 py-0.5 bg-dark-600 text-dark-300 text-[10px] rounded font-medium">
              {getChainName(token.chainId)}
            </span>

            {/* Token Info */}
            <div className="flex-1 min-w-0">
              <span className="text-dark-200 text-xs font-mono">
                {token.symbol || formatAddress(token.address)}
              </span>
              {token.symbol && (
                <span className="text-dark-500 text-[10px] ml-1">
                  {formatAddress(token.address)}
                </span>
              )}
            </div>

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
        ))}
      </div>

      {/* Monitor Status */}
      <div className="mt-3 pt-2 border-t border-dark-700/50 text-[10px] text-dark-500">
        Auto-monitoring every 60s
      </div>
    </div>
  );
}

export default WatchlistPanel;
