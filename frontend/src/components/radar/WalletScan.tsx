/**
 * Wallet Scan V3 Component
 *
 * Scans connected wallet for tokens and provides insights.
 * Features:
 * - Real-time progress states
 * - Instant payoff insights cards
 * - One-click "Add Top 5" to watchlist
 * - Clear explanations for empty states
 */

import { useState, useCallback } from 'react';
import { useWalletStore } from '@/stores/walletStore';
import { useWatchlistStore } from '@/stores/watchlistStore';
import {
  scanWallet,
  trackAddSelected,
  type WalletScanResponse,
  type DiscoveredToken,
  type ScanInsights,
  CHAIN_INFO,
  formatUsd,
  formatPercent,
  getPercentColor,
  shortAddress,
} from '@/services/walletScanService';

interface WalletScanProps {
  className?: string;
}

// Scan progress stages
type ScanStage = 'idle' | 'connecting' | 'fetching' | 'pricing' | 'filtering' | 'complete' | 'error';

const STAGE_LABELS: Record<ScanStage, string> = {
  idle: 'Ready to scan',
  connecting: 'Connecting to provider...',
  fetching: 'Fetching token balances...',
  pricing: 'Getting prices...',
  filtering: 'Filtering spam tokens...',
  complete: 'Scan complete',
  error: 'Scan failed',
};

// Skeleton loader for tokens
function TokenSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 bg-dark-700/50 rounded-lg animate-pulse">
      <div className="w-8 h-8 bg-dark-600 rounded-full" />
      <div className="flex-1">
        <div className="h-3 bg-dark-600 rounded w-20 mb-1" />
        <div className="h-2 bg-dark-600 rounded w-16" />
      </div>
      <div className="text-right">
        <div className="h-3 bg-dark-600 rounded w-14 mb-1" />
        <div className="h-2 bg-dark-600 rounded w-10" />
      </div>
    </div>
  );
}

// Insight card component
function InsightCard({
  title,
  icon,
  children,
  className = '',
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-dark-700/50 rounded-lg p-3 ${className}`}>
      <div className="flex items-center gap-1.5 text-xs text-dark-400 mb-2">
        <span>{icon}</span>
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

// Token row component
function TokenRow({
  token,
  selected,
  onToggle,
  showCheckbox = true,
}: {
  token: DiscoveredToken;
  selected: boolean;
  onToggle: () => void;
  showCheckbox?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors cursor-pointer ${
        selected ? 'bg-primary-600/20 border border-primary-600/30' : 'bg-dark-700/30 hover:bg-dark-700/50'
      }`}
      onClick={onToggle}
    >
      {showCheckbox && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="w-4 h-4 rounded border-dark-500 bg-dark-700 text-primary-500 focus:ring-primary-500 focus:ring-offset-0"
          onClick={(e) => e.stopPropagation()}
        />
      )}
      {token.logo ? (
        <img src={token.logo} alt={token.symbol} className="w-7 h-7 rounded-full" />
      ) : (
        <div className="w-7 h-7 rounded-full bg-dark-600 flex items-center justify-center text-xs font-medium">
          {token.symbol.slice(0, 2)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-dark-100 truncate">{token.symbol}</div>
        <div className="text-[10px] text-dark-500 truncate">{token.name}</div>
      </div>
      <div className="text-right">
        <div className="text-sm font-medium text-dark-200">
          {token.valueUsd ? formatUsd(token.valueUsd) : '-'}
        </div>
        {token.percentChange24h !== undefined && (
          <div className={`text-[10px] ${getPercentColor(token.percentChange24h)}`}>
            {formatPercent(token.percentChange24h)}
          </div>
        )}
      </div>
    </div>
  );
}

// Empty state component
function EmptyState({
  reason,
  chainSuggestion,
  onSwitchChain,
}: {
  reason: string;
  chainSuggestion?: string;
  onSwitchChain?: () => void;
}) {
  return (
    <div className="text-center py-6">
      <div className="text-4xl mb-3">📭</div>
      <div className="text-sm text-dark-300 mb-2">{reason}</div>
      {chainSuggestion && (
        <div className="text-xs text-dark-500 mb-3">{chainSuggestion}</div>
      )}
      {onSwitchChain && (
        <button
          onClick={onSwitchChain}
          className="text-xs text-primary-400 hover:text-primary-300"
        >
          Try another chain
        </button>
      )}
    </div>
  );
}

// Insights panel component
function InsightsPanel({ insights }: { insights: ScanInsights }) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-4">
      {/* Biggest Position */}
      {insights.biggestPosition && (
        <InsightCard title="Biggest Position" icon="👑">
          <div className="flex items-center gap-2">
            {insights.biggestPosition.token.logo ? (
              <img
                src={insights.biggestPosition.token.logo}
                alt={insights.biggestPosition.token.symbol}
                className="w-6 h-6 rounded-full"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-dark-600 flex items-center justify-center text-[10px]">
                {insights.biggestPosition.token.symbol.slice(0, 2)}
              </div>
            )}
            <div>
              <div className="text-sm font-medium text-dark-100">
                {insights.biggestPosition.token.symbol}
              </div>
              <div className="text-[10px] text-dark-500">
                {insights.biggestPosition.reason}
              </div>
            </div>
          </div>
        </InsightCard>
      )}

      {/* Most Volatile */}
      {insights.mostVolatile && (
        <InsightCard title="Most Active" icon="📈">
          <div className="flex items-center gap-2">
            {insights.mostVolatile.token.logo ? (
              <img
                src={insights.mostVolatile.token.logo}
                alt={insights.mostVolatile.token.symbol}
                className="w-6 h-6 rounded-full"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-dark-600 flex items-center justify-center text-[10px]">
                {insights.mostVolatile.token.symbol.slice(0, 2)}
              </div>
            )}
            <div>
              <div className="text-sm font-medium text-dark-100">
                {insights.mostVolatile.token.symbol}
              </div>
              <div className={`text-[10px] ${getPercentColor(insights.mostVolatile.token.percentChange24h)}`}>
                {insights.mostVolatile.reason}
              </div>
            </div>
          </div>
        </InsightCard>
      )}

      {/* New Tokens */}
      {insights.newTokens && insights.newTokens.count > 0 && (
        <InsightCard title="New Tokens" icon="✨">
          <div className="text-sm font-medium text-dark-100">
            {insights.newTokens.count} token{insights.newTokens.count > 1 ? 's' : ''}
          </div>
          <div className="text-[10px] text-dark-500">
            Recently acquired
          </div>
        </InsightCard>
      )}

      {/* Unpriced Tokens */}
      {insights.unpricedTokens && insights.unpricedTokens.count > 0 && (
        <InsightCard title="Unpriced" icon="❓">
          <div className="text-sm font-medium text-dark-100">
            {insights.unpricedTokens.count} token{insights.unpricedTokens.count > 1 ? 's' : ''}
          </div>
          <div className="text-[10px] text-dark-500">
            {insights.unpricedTokens.reason}
          </div>
        </InsightCard>
      )}
    </div>
  );
}

export function WalletScan({ className = '' }: WalletScanProps) {
  const isConnected = useWalletStore((s) => s.isConnected);
  const walletAddress = useWalletStore((s) => s.address);
  const currentChainId = useWalletStore((s) => s.chainId);

  const watchlistTokens = useWatchlistStore((s) => s.tokens);
  const addToken = useWatchlistStore((s) => s.addToken);
  const hasToken = useWatchlistStore((s) => s.hasToken);

  // Scan state
  const [stage, setStage] = useState<ScanStage>('idle');
  const [scanResult, setScanResult] = useState<WalletScanResponse | null>(null);
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [lastScanTime, setLastScanTime] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // UI state
  const [showAllTokens, setShowAllTokens] = useState(false);

  // Chain info
  const chainInfo = CHAIN_INFO[currentChainId] || { name: `Chain ${currentChainId}`, symbol: 'ETH', color: '#888' };
  const watchlistFull = watchlistTokens.length >= 20;
  const availableSlots = 20 - watchlistTokens.length;

  // Filter tokens that are already in watchlist
  const getFilteredTokens = useCallback(
    (tokens: DiscoveredToken[]): DiscoveredToken[] => {
      return tokens.filter((t) => !hasToken(t.chainId, t.address));
    },
    [hasToken],
  );

  // Handle scan
  const handleScan = useCallback(async () => {
    if (!isConnected || !walletAddress) return;

    setStage('connecting');
    setErrorMessage(null);
    setScanResult(null);
    setSelectedTokens(new Set());

    try {
      // Simulate progress stages for UX
      setTimeout(() => setStage('fetching'), 300);
      setTimeout(() => setStage('pricing'), 800);
      setTimeout(() => setStage('filtering'), 1500);

      const result = await scanWallet({
        chainId: currentChainId,
        wallet: walletAddress,
        minUsd: 1,
        strict: false,
        provider: 'auto',
      });

      setScanResult(result);
      setLastScanTime(Date.now());

      if (result.error) {
        setStage('error');
        setErrorMessage(result.error);
      } else {
        setStage('complete');

        // Auto-select top 5 tokens that aren't in watchlist
        const filtered = getFilteredTokens(result.tokens);
        const topFive = filtered.slice(0, Math.min(5, availableSlots));
        setSelectedTokens(new Set(topFive.map((t) => t.address)));
      }
    } catch (err) {
      setStage('error');
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error occurred');
    }
  }, [isConnected, walletAddress, currentChainId, getFilteredTokens, availableSlots]);

  // Handle add selected tokens
  const handleAddSelected = useCallback(async () => {
    if (!scanResult) return;

    const tokensToAdd = scanResult.tokens.filter((t) => selectedTokens.has(t.address));
    let addedCount = 0;

    for (const token of tokensToAdd) {
      const success = addToken({
        chainId: token.chainId,
        address: token.address,
        symbol: token.symbol,
      });
      if (success) addedCount++;
    }

    // Track the addition for metrics
    await trackAddSelected(selectedTokens.size, addedCount, {
      minUsd: 1,
      provider: scanResult.provider,
      strict: false,
      chainId: currentChainId,
      filteredSpam: scanResult.stats.spamFiltered,
    });

    // Clear selection and update state
    setSelectedTokens(new Set());

    // Show success feedback
    if (addedCount > 0) {
      // Force re-render to update "already watching" state
      setScanResult({ ...scanResult });
    }
  }, [scanResult, selectedTokens, addToken, currentChainId]);

  // Toggle token selection
  const toggleToken = useCallback((address: string) => {
    setSelectedTokens((prev) => {
      const next = new Set(prev);
      if (next.has(address)) {
        next.delete(address);
      } else if (next.size < availableSlots) {
        next.add(address);
      }
      return next;
    });
  }, [availableSlots]);

  // Select/deselect all
  const toggleSelectAll = useCallback(() => {
    if (!scanResult) return;

    const filtered = getFilteredTokens(scanResult.tokens);
    const allSelected = filtered.every((t) => selectedTokens.has(t.address));

    if (allSelected) {
      setSelectedTokens(new Set());
    } else {
      const toSelect = filtered.slice(0, availableSlots);
      setSelectedTokens(new Set(toSelect.map((t) => t.address)));
    }
  }, [scanResult, selectedTokens, getFilteredTokens, availableSlots]);

  // Get display tokens
  const displayTokens = scanResult ? getFilteredTokens(scanResult.tokens) : [];
  const visibleTokens = showAllTokens ? displayTokens : displayTokens.slice(0, 5);
  const hasMoreTokens = displayTokens.length > 5;

  // Get empty state reason
  const getEmptyReason = (): string => {
    if (!scanResult) return '';

    if (scanResult.error) {
      if (scanResult.error.includes('rate')) return 'Provider rate-limited. Try again in a moment.';
      if (scanResult.error.includes('API')) return 'Provider API error. Please try again.';
      return scanResult.error;
    }

    if (scanResult.stats.tokensDiscovered === 0) {
      return 'No token transfers found on this chain.';
    }

    if (scanResult.stats.spamFiltered === scanResult.stats.tokensDiscovered) {
      return 'All tokens were filtered as spam.';
    }

    if (displayTokens.length === 0 && scanResult.tokens.length > 0) {
      return 'All discovered tokens are already in your watchlist.';
    }

    if (scanResult.stats.tokensFiltered === 0) {
      return 'No tokens above minimum value threshold ($1).';
    }

    return 'No tokens found.';
  };

  return (
    <div className={`bg-dark-800 rounded-xl p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔎</span>
          <h3 className="text-sm font-medium text-dark-200">Wallet Scan</h3>
        </div>
        {lastScanTime && stage === 'complete' && (
          <div className="flex items-center gap-1.5 text-[10px] text-dark-500">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span>{scanResult?.cached ? 'Cached' : 'Fresh'}</span>
          </div>
        )}
      </div>

      {/* Chain indicator */}
      <div className="flex items-center gap-2 mb-4 p-2 bg-dark-700/50 rounded-lg">
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: chainInfo.color }}
        />
        <span className="text-xs text-dark-300">Scanning on {chainInfo.name}</span>
        {scanResult && scanResult.stats.tokensFiltered > 0 && (
          <span className="ml-auto text-xs text-dark-500">
            {formatUsd(scanResult.insights?.totalValueUsd || 0)} total
          </span>
        )}
      </div>

      {/* Not connected state */}
      {!isConnected ? (
        <div className="flex items-center justify-center py-8 text-dark-500 text-xs">
          <span>Connect your wallet to scan for tokens</span>
        </div>
      ) : stage === 'idle' || stage === 'error' ? (
        /* Idle / Error state - show scan button */
        <>
          {errorMessage && (
            <div className="mb-3 p-2 bg-red-900/20 border border-red-900/30 rounded-lg text-xs text-red-400">
              {errorMessage}
            </div>
          )}
          <button
            onClick={handleScan}
            disabled={watchlistFull}
            className={`w-full py-3 rounded-lg text-sm font-medium transition-all ${
              watchlistFull
                ? 'bg-dark-700 text-dark-500 cursor-not-allowed'
                : 'bg-primary-600/20 text-primary-400 hover:bg-primary-600/30 border border-primary-600/30 hover:scale-[1.01]'
            }`}
          >
            {watchlistFull ? (
              'Watchlist full (20/20)'
            ) : (
              <>
                <span>Scan My Wallet</span>
                <span className="ml-2 text-dark-500 text-xs">
                  ({availableSlots} slots available)
                </span>
              </>
            )}
          </button>
        </>
      ) : stage !== 'complete' ? (
        /* Scanning state - show progress */
        <div className="py-6">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-dark-300 text-sm">{STAGE_LABELS[stage]}</span>
          </div>
          {/* Skeleton loaders */}
          <div className="space-y-2">
            <TokenSkeleton />
            <TokenSkeleton />
            <TokenSkeleton />
          </div>
        </div>
      ) : displayTokens.length === 0 ? (
        /* Empty state */
        <EmptyState
          reason={getEmptyReason()}
          chainSuggestion={scanResult?.insights?.chainSuggestion}
          onSwitchChain={() => setStage('idle')}
        />
      ) : (
        /* Results state */
        <>
          {/* Insights */}
          {scanResult?.insights && (
            <InsightsPanel insights={scanResult.insights} />
          )}

          {/* Token list header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-dark-400">
                {displayTokens.length} token{displayTokens.length !== 1 ? 's' : ''} found
              </span>
              {selectedTokens.size > 0 && (
                <span className="text-xs text-primary-400">
                  ({selectedTokens.size} selected)
                </span>
              )}
            </div>
            <button
              onClick={toggleSelectAll}
              className="text-[10px] text-dark-500 hover:text-dark-300"
            >
              {displayTokens.every((t) => selectedTokens.has(t.address))
                ? 'Deselect all'
                : 'Select all'}
            </button>
          </div>

          {/* Token list */}
          <div className="space-y-1.5 mb-3">
            {visibleTokens.map((token) => (
              <TokenRow
                key={token.address}
                token={token}
                selected={selectedTokens.has(token.address)}
                onToggle={() => toggleToken(token.address)}
              />
            ))}
          </div>

          {/* Show more button */}
          {hasMoreTokens && (
            <button
              onClick={() => setShowAllTokens(!showAllTokens)}
              className="w-full py-2 text-xs text-dark-400 hover:text-dark-300 transition-colors"
            >
              {showAllTokens
                ? 'Show less'
                : `Show ${displayTokens.length - 5} more tokens`}
            </button>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleAddSelected}
              disabled={selectedTokens.size === 0}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                selectedTokens.size === 0
                  ? 'bg-dark-700 text-dark-500 cursor-not-allowed'
                  : 'bg-primary-600 text-white hover:bg-primary-500'
              }`}
            >
              Add {selectedTokens.size > 0 ? selectedTokens.size : ''} to Watchlist
            </button>
            <button
              onClick={handleScan}
              className="px-4 py-2.5 rounded-lg text-sm font-medium bg-dark-700 text-dark-300 hover:bg-dark-600 transition-colors"
            >
              Rescan
            </button>
          </div>
        </>
      )}

      {/* Connected wallet info */}
      {isConnected && walletAddress && (
        <div className="mt-3 pt-3 border-t border-dark-700/50 flex items-center justify-between text-[10px]">
          <span className="text-dark-500">Connected:</span>
          <span className="text-dark-400 font-mono">{shortAddress(walletAddress)}</span>
        </div>
      )}

      {/* Stats footer (only show after scan) */}
      {scanResult && stage === 'complete' && (
        <div className="mt-2 flex items-center justify-between text-[10px] text-dark-600">
          <span>Provider: {scanResult.provider}</span>
          <span>{scanResult.stats.durationMs}ms</span>
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline scan button for header areas
 */
interface WalletScanButtonProps {
  onClick?: () => void;
  className?: string;
}

export function WalletScanButton({ onClick, className = '' }: WalletScanButtonProps) {
  const isConnected = useWalletStore((s) => s.isConnected);

  if (!isConnected) return null;

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-dark-300 rounded-lg text-xs transition-colors ${className}`}
    >
      <span>🔎</span>
      <span>Scan Wallet</span>
    </button>
  );
}

export default WalletScan;
