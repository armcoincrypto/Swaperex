/**
 * Wallet Scan V2 Component
 *
 * Premium wallet scanner with enhanced UX:
 * - Clear explanations for empty states
 * - Beautiful token cards with badges
 * - Selection presets and local filters
 * - Sticky action bar
 *
 * Read-only scan - no transactions, no approvals, no signatures.
 *
 * Radar: Wallet Scan V2
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import { useWalletStore } from '@/stores/walletStore';
import { useWatchlistStore } from '@/stores/watchlistStore';
import { trackScanStarted, trackScanCompleted, trackScanAddSelected } from '@/services/metrics';

const API_BASE = import.meta.env.VITE_SIGNALS_API_URL || 'http://207.180.212.142:4001';
const MAX_WATCHLIST_SIZE = 20;

// Types matching backend V2 response
interface WalletToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  priceUsd: number | null;
  valueUsd: number | null;
  logoUrl: string | null;
  verified: boolean;
  isNative: boolean;
}

interface ScanStats {
  providerTokens: number;
  afterChainFilter: number;
  afterSpamFilter: number;
  belowMinValue: number;
  finalTokens: number;
}

interface ScanResponse {
  chainId: number;
  wallet: string;
  provider: string;
  fetchedAt: number;
  minValueUsd: number;
  tokens: WalletToken[];
  stats: ScanStats;
  warnings: string[];
  cached: boolean;
}

interface WalletScanProps {
  className?: string;
  debug?: boolean;
}

type ScanState = 'idle' | 'scanning' | 'results' | 'error';
type SortMode = 'value' | 'alpha' | 'balance';

// Chain info
const CHAIN_INFO: Record<number, { name: string; symbol: string; color: string }> = {
  1: { name: 'Ethereum', symbol: 'ETH', color: 'bg-blue-600' },
  56: { name: 'BNB Chain', symbol: 'BNB', color: 'bg-yellow-500' },
  137: { name: 'Polygon', symbol: 'MATIC', color: 'bg-purple-500' },
  42161: { name: 'Arbitrum', symbol: 'ARB', color: 'bg-blue-400' },
  10: { name: 'Optimism', symbol: 'OP', color: 'bg-red-500' },
  43114: { name: 'Avalanche', symbol: 'AVAX', color: 'bg-red-600' },
};

export function WalletScan({ className = '', debug = false }: WalletScanProps) {
  const isConnected = useWalletStore((s) => s.isConnected);
  const walletAddress = useWalletStore((s) => s.address);
  const chainId = useWalletStore((s) => s.chainId) || 56;
  const watchlistTokens = useWatchlistStore((s) => s.tokens);
  const addToken = useWatchlistStore((s) => s.addToken);
  const hasToken = useWatchlistStore((s) => s.hasToken);

  // Scan state
  const [state, setState] = useState<ScanState>('idle');
  const [scanData, setScanData] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addedCount, setAddedCount] = useState(0);

  // Local filters
  const [minUsdFilter, setMinUsdFilter] = useState<number>(0);
  const [showLowValue, setShowLowValue] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('value');

  const availableSlots = MAX_WATCHLIST_SIZE - watchlistTokens.length;
  const chainInfo = CHAIN_INFO[chainId] || { name: `Chain ${chainId}`, symbol: '???', color: 'bg-gray-500' };

  // Process tokens: filter already-watched, apply local filters
  const processedTokens = useMemo(() => {
    if (!scanData?.tokens) return { display: [], alreadyWatched: 0, belowLocalMin: 0 };

    let alreadyWatched = 0;
    let belowLocalMin = 0;

    const filtered = scanData.tokens.filter((token) => {
      // Already in watchlist
      if (hasToken(chainId, token.address)) {
        alreadyWatched++;
        return false;
      }

      // Local min value filter (if not showing low value)
      if (!showLowValue && minUsdFilter > 0 && token.valueUsd !== null && token.valueUsd < minUsdFilter) {
        belowLocalMin++;
        return false;
      }

      return true;
    });

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      if (sortMode === 'alpha') {
        return a.symbol.localeCompare(b.symbol);
      }
      if (sortMode === 'balance') {
        return parseFloat(b.balance) - parseFloat(a.balance);
      }
      // Default: value desc
      if (a.valueUsd !== null && b.valueUsd !== null) return b.valueUsd - a.valueUsd;
      if (a.valueUsd !== null) return -1;
      if (b.valueUsd !== null) return 1;
      return 0;
    });

    return { display: sorted, alreadyWatched, belowLocalMin };
  }, [scanData, chainId, hasToken, minUsdFilter, showLowValue, sortMode]);

  // Track scan start time
  const scanStartTime = useRef<number>(0);

  // Scan wallet
  const handleScan = useCallback(async () => {
    if (!isConnected || !walletAddress) return;

    setState('scanning');
    setError(null);
    setScanData(null);
    setSelected(new Set());
    setAddedCount(0);

    // Track scan started
    scanStartTime.current = Date.now();
    trackScanStarted(walletAddress, chainId);

    try {
      const response = await fetch(
        `${API_BASE}/api/v1/wallet-tokens?chainId=${chainId}&wallet=${walletAddress}`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Scan failed: ${response.status}`);
      }

      const data: ScanResponse = await response.json();
      setScanData(data);
      setState('results');

      // Calculate already watched count
      const alreadyWatched = data.tokens.filter((t) => hasToken(chainId, t.address)).length;

      // Track scan completed
      trackScanCompleted(walletAddress, chainId, {
        providerTokens: data.stats.providerTokens,
        finalTokens: data.stats.finalTokens,
        belowMin: data.stats.belowMinValue,
        alreadyWatched,
        durationMs: Date.now() - scanStartTime.current,
      });

      // Auto-select top new tokens
      const newTokens = data.tokens.filter((t) => !hasToken(chainId, t.address));
      const autoCount = Math.min(newTokens.length, availableSlots, 5);
      const autoSelect = new Set<string>();
      for (let i = 0; i < autoCount; i++) {
        autoSelect.add(newTokens[i].address);
      }
      setSelected(autoSelect);
    } catch (err: any) {
      console.error('[WalletScan] Error:', err);
      setError(err.message || 'Scan failed. Please try again.');
      setState('error');
    }
  }, [isConnected, walletAddress, chainId, hasToken, availableSlots]);

  // Selection handlers
  const toggleSelection = useCallback((address: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(address)) {
        next.delete(address);
      } else if (next.size < availableSlots) {
        next.add(address);
      }
      return next;
    });
  }, [availableSlots]);

  const selectAllNew = useCallback(() => {
    const maxCount = Math.min(processedTokens.display.length, availableSlots);
    const newSelection = new Set<string>();
    for (let i = 0; i < maxCount; i++) {
      newSelection.add(processedTokens.display[i].address);
    }
    setSelected(newSelection);
  }, [processedTokens.display, availableSlots]);

  const selectTop = useCallback((count: number) => {
    const maxCount = Math.min(count, processedTokens.display.length, availableSlots);
    const newSelection = new Set<string>();
    for (let i = 0; i < maxCount; i++) {
      newSelection.add(processedTokens.display[i].address);
    }
    setSelected(newSelection);
  }, [processedTokens.display, availableSlots]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  // Add to watchlist
  const handleAddToWatchlist = useCallback(() => {
    let added = 0;
    const selectedCount = selected.size;

    for (const token of processedTokens.display) {
      if (selected.has(token.address)) {
        const success = addToken({
          chainId,
          address: token.address,
          symbol: token.symbol,
          label: token.name,
        });
        if (success) added++;
      }
    }

    // Track add selected
    if (walletAddress) {
      trackScanAddSelected(walletAddress, chainId, selectedCount, added);
    }

    setAddedCount(added);
    setState('idle');
    setScanData(null);
    setSelected(new Set());

    setTimeout(() => setAddedCount(0), 3000);
  }, [processedTokens.display, selected, chainId, addToken, walletAddress]);

  // Reset
  const handleReset = useCallback(() => {
    setState('idle');
    setScanData(null);
    setSelected(new Set());
    setError(null);
  }, []);

  // Format helpers
  const formatUsd = (value: number | null): string => {
    if (value === null) return '—';
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
    if (value >= 1) return `$${value.toFixed(2)}`;
    return `$${value.toFixed(4)}`;
  };

  const formatPrice = (price: number | null): string => {
    if (price === null) return '';
    if (price >= 1) return `$${price.toFixed(2)}`;
    if (price >= 0.01) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(6)}`;
  };

  // Determine empty state reason
  const getEmptyReason = (): { title: string; subtitle: string; actions: JSX.Element | null } => {
    if (!scanData) {
      return { title: 'No scan data', subtitle: '', actions: null };
    }

    const { stats } = scanData;
    const { alreadyWatched, belowLocalMin } = processedTokens;

    // Case 1: Provider returned nothing
    if (stats.providerTokens === 0) {
      return {
        title: 'Provider returned no tokens',
        subtitle: 'This wallet may be empty on this chain, or the provider is unavailable.',
        actions: (
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleScan}
              className="px-3 py-1.5 bg-dark-700 text-dark-300 rounded text-xs hover:bg-dark-600"
            >
              Try Again
            </button>
          </div>
        ),
      };
    }

    // Case 2: All tokens filtered as spam
    if (stats.afterSpamFilter === 0) {
      return {
        title: 'All tokens were filtered',
        subtitle: `${stats.providerTokens} tokens found, but all appear to be spam or invalid.`,
        actions: null,
      };
    }

    // Case 3: All below min value (backend filter)
    if (stats.finalTokens === 0 && stats.belowMinValue > 0) {
      return {
        title: `All tokens below $${scanData.minValueUsd} minimum`,
        subtitle: `${stats.belowMinValue} tokens were excluded by value filter.`,
        actions: null,
      };
    }

    // Case 4: All already watched
    if (alreadyWatched > 0 && processedTokens.display.length === 0 && belowLocalMin === 0) {
      return {
        title: 'All tokens already in watchlist',
        subtitle: `${alreadyWatched} tokens are already being tracked.`,
        actions: (
          <button
            onClick={handleReset}
            className="mt-3 px-3 py-1.5 bg-dark-700 text-dark-300 rounded text-xs hover:bg-dark-600"
          >
            Done
          </button>
        ),
      };
    }

    // Case 5: Local filter hiding tokens
    if (belowLocalMin > 0 && processedTokens.display.length === 0) {
      return {
        title: 'Tokens hidden by filters',
        subtitle: `${belowLocalMin} tokens below your $${minUsdFilter} filter.`,
        actions: (
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setMinUsdFilter(0)}
              className="px-3 py-1.5 bg-primary-600/20 text-primary-400 rounded text-xs hover:bg-primary-600/30"
            >
              Show all values
            </button>
            <button
              onClick={() => setShowLowValue(true)}
              className="px-3 py-1.5 bg-dark-700 text-dark-300 rounded text-xs hover:bg-dark-600"
            >
              Include low-value
            </button>
          </div>
        ),
      };
    }

    // Fallback
    return {
      title: 'No tokens to display',
      subtitle: 'Try adjusting filters or scanning again.',
      actions: (
        <button
          onClick={handleReset}
          className="mt-3 px-3 py-1.5 bg-dark-700 text-dark-300 rounded text-xs hover:bg-dark-600"
        >
          Done
        </button>
      ),
    };
  };

  return (
    <div className={`bg-dark-800 rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-dark-700/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔎</span>
            <h3 className="text-sm font-medium text-dark-200">Wallet Scan</h3>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Chain badge */}
            <span className={`px-2 py-0.5 ${chainInfo.color} text-white text-[10px] rounded font-medium`}>
              {chainInfo.name}
            </span>
            {/* Provider badge (debug mode) */}
            {debug && scanData && (
              <span className="px-2 py-0.5 bg-dark-600 text-dark-400 text-[10px] rounded">
                {scanData.provider}
              </span>
            )}
            {/* Cached badge (debug mode) */}
            {debug && scanData?.cached && (
              <span className="px-2 py-0.5 bg-amber-900/30 text-amber-400 text-[10px] rounded">
                Cached
              </span>
            )}
          </div>
        </div>
        <p className="text-[10px] text-dark-500">
          Read-only scan — no approvals, no transactions, no signatures.
        </p>
      </div>

      {/* Success toast */}
      {addedCount > 0 && (
        <div className="mx-4 mt-4 px-3 py-2 bg-green-900/20 border border-green-700/30 rounded-lg text-green-400 text-xs text-center">
          ✓ Added {addedCount} token{addedCount !== 1 ? 's' : ''} to Watchlist
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        {/* Disconnected state */}
        {!isConnected && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-dark-700 flex items-center justify-center mb-3">
              <span className="text-2xl opacity-50">👛</span>
            </div>
            <p className="text-dark-400 text-sm mb-1">Connect wallet to scan</p>
            <p className="text-dark-500 text-xs">Discover tokens in your wallet</p>
          </div>
        )}

        {/* Idle state - scan button */}
        {isConnected && state === 'idle' && (
          <>
            <p className="text-xs text-dark-400 mb-4">
              Discover tokens in your wallet and add them to your watchlist for monitoring.
            </p>

            <button
              onClick={handleScan}
              disabled={availableSlots === 0}
              className={`w-full py-3.5 rounded-lg text-sm font-medium transition-all ${
                availableSlots === 0
                  ? 'bg-dark-700 text-dark-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-primary-600 to-primary-500 text-white hover:from-primary-500 hover:to-primary-400 shadow-lg shadow-primary-900/20'
              }`}
            >
              {availableSlots === 0 ? (
                'Watchlist full (20/20)'
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <span>Scan My Wallet</span>
                  <span className="text-primary-200 text-xs">
                    ({availableSlots} slot{availableSlots !== 1 ? 's' : ''} available)
                  </span>
                </span>
              )}
            </button>

            {/* Connected wallet info */}
            {walletAddress && (
              <div className="mt-4 pt-3 border-t border-dark-700/50">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-dark-500">Connected:</span>
                  <span className="text-dark-400 font-mono">
                    {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Scanning state - skeleton */}
        {state === 'scanning' && (
          <div className="py-4">
            <div className="flex items-center justify-center mb-4">
              <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-center text-dark-300 text-sm mb-1">Fetching token balances...</p>
            <p className="text-center text-dark-500 text-xs">This may take a few seconds</p>

            {/* Skeleton rows */}
            <div className="mt-4 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-dark-700/30 rounded-lg animate-pulse">
                  <div className="w-4 h-4 rounded bg-dark-600" />
                  <div className="w-8 h-8 rounded-full bg-dark-600" />
                  <div className="flex-1">
                    <div className="w-20 h-3 bg-dark-600 rounded mb-1" />
                    <div className="w-32 h-2 bg-dark-600/50 rounded" />
                  </div>
                  <div className="w-16 h-4 bg-dark-600 rounded" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error state */}
        {state === 'error' && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-red-900/20 flex items-center justify-center mb-3">
              <span className="text-2xl">⚠️</span>
            </div>
            <p className="text-red-400 text-sm mb-1">Scan failed</p>
            <p className="text-dark-500 text-xs mb-4 max-w-xs">{error}</p>
            <div className="flex gap-2">
              <button
                onClick={handleScan}
                className="px-4 py-2 bg-primary-600/20 text-primary-400 rounded-lg text-xs hover:bg-primary-600/30"
              >
                Try Again
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-dark-700 text-dark-400 rounded-lg text-xs hover:bg-dark-600"
              >
                Cancel
              </button>
            </div>
            {debug && (
              <details className="mt-4 text-left w-full">
                <summary className="text-dark-500 text-[10px] cursor-pointer">Debug details</summary>
                <pre className="mt-2 p-2 bg-dark-900 rounded text-[10px] text-dark-400 overflow-auto">
                  {error}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* Results state */}
        {state === 'results' && scanData && (
          <div>
            {/* Summary bar */}
            {scanData.stats.providerTokens > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-3 text-[10px]">
                <span className="text-dark-400">
                  Found {scanData.stats.finalTokens} token{scanData.stats.finalTokens !== 1 ? 's' : ''}
                </span>
                {processedTokens.display.length > 0 && processedTokens.display.length !== scanData.stats.finalTokens && (
                  <>
                    <span className="text-dark-600">·</span>
                    <span className="text-primary-400">
                      {processedTokens.display.length} new
                    </span>
                  </>
                )}
                {processedTokens.alreadyWatched > 0 && (
                  <>
                    <span className="text-dark-600">·</span>
                    <span className="text-dark-500">
                      {processedTokens.alreadyWatched} watched
                    </span>
                  </>
                )}
                {(scanData.stats.belowMinValue > 0 || processedTokens.belowLocalMin > 0) && (
                  <>
                    <span className="text-dark-600">·</span>
                    <span className="text-dark-500">
                      {scanData.stats.belowMinValue + processedTokens.belowLocalMin} below min
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Empty state with reason */}
            {processedTokens.display.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-12 h-12 rounded-full bg-dark-700 flex items-center justify-center mb-3">
                  <span className="text-2xl opacity-50">📭</span>
                </div>
                <p className="text-dark-300 text-sm mb-1">{getEmptyReason().title}</p>
                <p className="text-dark-500 text-xs max-w-xs">{getEmptyReason().subtitle}</p>
                {getEmptyReason().actions}
              </div>
            ) : (
              <>
                {/* Filters row */}
                <div className="flex items-center justify-between mb-3 pb-3 border-b border-dark-700/50">
                  <div className="flex items-center gap-2">
                    {/* Min USD buttons */}
                    <div className="flex items-center gap-1">
                      {[0, 0.5, 2, 10].map((val) => (
                        <button
                          key={val}
                          onClick={() => setMinUsdFilter(val)}
                          className={`px-2 py-1 text-[10px] rounded transition-colors ${
                            minUsdFilter === val
                              ? 'bg-primary-600/30 text-primary-400'
                              : 'bg-dark-700 text-dark-400 hover:bg-dark-600'
                          }`}
                        >
                          {val === 0 ? 'All' : `≥$${val}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sort dropdown */}
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                    className="px-2 py-1 bg-dark-700 text-dark-400 text-[10px] rounded border-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="value">By value</option>
                    <option value="alpha">A-Z</option>
                    <option value="balance">By balance</option>
                  </select>
                </div>

                {/* Selection controls */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-dark-400">
                    {selected.size} of {processedTokens.display.length} selected
                  </span>
                  <div className="flex items-center gap-2 text-[10px]">
                    <button
                      onClick={selectAllNew}
                      className="text-primary-400 hover:text-primary-300"
                    >
                      All new
                    </button>
                    <span className="text-dark-600">|</span>
                    <button
                      onClick={() => selectTop(5)}
                      className="text-primary-400 hover:text-primary-300"
                    >
                      Top 5
                    </button>
                    <span className="text-dark-600">|</span>
                    <button
                      onClick={clearSelection}
                      className="text-dark-500 hover:text-dark-400"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Capacity warning */}
                {selected.size >= availableSlots && availableSlots < processedTokens.display.length && (
                  <div className="mb-3 px-3 py-2 bg-amber-900/20 border border-amber-700/30 rounded-lg text-amber-400 text-[10px]">
                    Watchlist limit reached. {availableSlots} slot{availableSlots !== 1 ? 's' : ''} available.
                  </div>
                )}

                {/* Token list */}
                <div className="space-y-2 max-h-72 overflow-y-auto mb-4 pr-1">
                  {processedTokens.display.map((token) => (
                    <TokenCard
                      key={token.address}
                      token={token}
                      selected={selected.has(token.address)}
                      disabled={!selected.has(token.address) && selected.size >= availableSlots}
                      onToggle={() => toggleSelection(token.address)}
                      formatUsd={formatUsd}
                      formatPrice={formatPrice}
                    />
                  ))}
                </div>

                {/* Sticky action bar */}
                <div className="flex gap-2 pt-3 border-t border-dark-700/50">
                  <button
                    onClick={handleReset}
                    className="flex-1 py-2.5 bg-dark-700 text-dark-400 rounded-lg text-xs hover:bg-dark-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddToWatchlist}
                    disabled={selected.size === 0}
                    className={`flex-1 py-2.5 rounded-lg text-xs font-medium transition-all ${
                      selected.size === 0
                        ? 'bg-dark-700 text-dark-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-primary-600 to-primary-500 text-white hover:from-primary-500 hover:to-primary-400'
                    }`}
                  >
                    Add {selected.size} to Watchlist
                  </button>
                </div>
              </>
            )}

            {/* Debug stats */}
            {debug && (
              <details className="mt-4">
                <summary className="text-dark-500 text-[10px] cursor-pointer">Debug stats</summary>
                <pre className="mt-2 p-2 bg-dark-900 rounded text-[10px] text-dark-400 overflow-auto">
                  {JSON.stringify({ stats: scanData.stats, warnings: scanData.warnings, processedTokens: { alreadyWatched: processedTokens.alreadyWatched, belowLocalMin: processedTokens.belowLocalMin, display: processedTokens.display.length } }, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Footer disclaimer */}
      {isConnected && state !== 'scanning' && (
        <div className="px-4 pb-4">
          <p className="text-[10px] text-dark-600 text-center">
            Radar is informational only, not financial advice.
          </p>
        </div>
      )}
    </div>
  );
}

// Token Card Component
interface TokenCardProps {
  token: WalletToken;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  formatUsd: (value: number | null) => string;
  formatPrice: (price: number | null) => string;
}

function TokenCard({ token, selected, disabled, onToggle, formatUsd, formatPrice }: TokenCardProps) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
        selected
          ? 'bg-primary-900/30 border border-primary-700/50 ring-1 ring-primary-600/20'
          : disabled
          ? 'bg-dark-700/30 opacity-50 cursor-not-allowed border border-transparent'
          : 'bg-dark-700/50 hover:bg-dark-700 border border-transparent hover:border-dark-600'
      }`}
    >
      {/* Checkbox */}
      <div
        className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          selected
            ? 'bg-primary-600 border-primary-600'
            : disabled
            ? 'border-dark-600'
            : 'border-dark-500'
        }`}
      >
        {selected && (
          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
          </svg>
        )}
      </div>

      {/* Token logo */}
      {token.logoUrl ? (
        <img
          src={token.logoUrl}
          alt={token.symbol}
          className="w-8 h-8 rounded-full flex-shrink-0 bg-dark-600"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
          }}
        />
      ) : null}
      <div
        className={`w-8 h-8 rounded-full bg-gradient-to-br from-dark-600 to-dark-700 flex items-center justify-center flex-shrink-0 ${
          token.logoUrl ? 'hidden' : ''
        }`}
      >
        <span className="text-[10px] font-medium text-dark-400">
          {token.symbol.slice(0, 2).toUpperCase()}
        </span>
      </div>

      {/* Token info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm text-dark-200 font-medium">{token.symbol}</span>
          {token.isNative && (
            <span className="px-1 py-0.5 bg-blue-900/30 text-blue-400 text-[8px] rounded font-medium">
              NATIVE
            </span>
          )}
          {token.verified && (
            <span className="px-1 py-0.5 bg-green-900/30 text-green-400 text-[8px] rounded font-medium">
              ✓
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-dark-500">
          <span className="truncate">{token.name}</span>
          <span>·</span>
          <span>{parseFloat(token.balance).toFixed(4)}</span>
        </div>
      </div>

      {/* Value */}
      <div className="text-right flex-shrink-0">
        <div className={`text-sm font-medium ${token.valueUsd !== null ? 'text-dark-200' : 'text-dark-500'}`}>
          {formatUsd(token.valueUsd)}
        </div>
        {token.priceUsd !== null && (
          <div className="text-[10px] text-dark-500">
            {formatPrice(token.priceUsd)}
          </div>
        )}
      </div>
    </button>
  );
}

// Compact button export
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
