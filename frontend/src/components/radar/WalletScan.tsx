/**
 * Wallet Scan Component
 *
 * Scans connected wallet for tokens and allows adding them to watchlist.
 * Uses backend API to discover tokens via block explorer APIs.
 */

import { useState, useRef, useMemo } from 'react';
import { useWalletStore } from '@/stores/walletStore';
import { useWatchlistStore } from '@/stores/watchlistStore';
import {
  trackWalletScanStarted,
  trackWalletScanCompleted,
  trackWalletScanAddSelected,
} from '@/services/metrics';

const API_BASE = import.meta.env.VITE_SIGNALS_API_URL || 'http://207.180.212.142:4001';

// Chain name mapping for display
const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  56: 'BNB Chain',
  137: 'Polygon',
  42161: 'Arbitrum',
  8453: 'Base',
};

// Minimum USD value filter options
const MIN_USD_OPTIONS = [
  { value: 0.01, label: '$0.01' },
  { value: 1, label: '$1' },
  { value: 10, label: '$10' },
  { value: 100, label: '$100' },
];

interface ScannedToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceFormatted: string;
  usdValue: number | null;
  usdPrice: number | null;
}

interface ScanResult {
  address: string;
  chainId: number;
  chainName: string;
  tokens: ScannedToken[];
  nativeBalance: ScannedToken;
  stats: {
    totalTokens: number;
    tokensWithValue: number;
    filteredSpam: number;
    scanDurationMs: number;
    // Expanded stats from backend
    providerTransfers: number;
    tokensDiscovered: number;
    tokensWithBalance: number;
    tokensPriced: number;
    tokensMissingPrice: number;
  };
  provider?: 'moralis' | '1inch' | 'covalent' | 'explorer';
  warnings: string[];
  cached: boolean;
  cacheAge?: number;
}

// Provider error detection helpers
const PROVIDER_ERRORS = ['provider_not_configured', 'provider_denied', 'provider_timeout', 'provider_error', 'unavailable'];

function hasProviderError(warnings: string[]): boolean {
  return warnings.some(w => PROVIDER_ERRORS.some(e => w.toLowerCase().includes(e.replace('_', ' ')) || w.toLowerCase().includes(e)));
}

function getProviderErrorMessage(warnings: string[]): string | null {
  const providerWarning = warnings.find(w =>
    w.toLowerCase().includes('provider') ||
    w.toLowerCase().includes('covalent') ||
    w.toLowerCase().includes('1inch') ||
    w.toLowerCase().includes('unavailable') ||
    w.toLowerCase().includes('configured')
  );
  if (!providerWarning) return null;

  if (providerWarning.toLowerCase().includes('unavailable')) {
    return 'Scan service temporarily unavailable. Please try again in a moment.';
  }
  if (providerWarning.toLowerCase().includes('not configured')) {
    return 'Wallet scan provider is not configured. Try again later or add tokens manually.';
  }
  if (providerWarning.toLowerCase().includes('denied') || providerWarning.toLowerCase().includes('rate limit')) {
    return 'Scan temporarily unavailable. Your wallet is safe; no transactions were made.';
  }
  if (providerWarning.toLowerCase().includes('timeout')) {
    return 'Scan timed out. Please try again in a moment.';
  }
  return 'Scan temporarily unavailable. Try again later or add tokens manually.';
}

interface WalletScanProps {
  className?: string;
}

export function WalletScan({ className = '' }: WalletScanProps) {
  const isConnected = useWalletStore((s) => s.isConnected);
  const walletAddress = useWalletStore((s) => s.address);
  const chainId = useWalletStore((s) => s.chainId);
  const { tokens: watchlistTokens, addToken, hasToken } = useWatchlistStore();
  const tokensCount = watchlistTokens.length;

  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [minUsdFilter, setMinUsdFilter] = useState(1);
  const [showDetails, setShowDetails] = useState(false);
  const scanStartTime = useRef<number>(0);
  const scanInProgress = useRef<boolean>(false);

  // Filter tokens based on minUsd and not already in watchlist
  const availableTokens = useMemo(() => {
    if (!scanResult) return [];

    return scanResult.tokens.filter((token) => {
      // Skip if already in watchlist
      if (hasToken(chainId, token.address)) return false;

      // Skip if below min USD value (if we have price data)
      if (token.usdValue !== null && token.usdValue < minUsdFilter) return false;

      return true;
    });
  }, [scanResult, chainId, minUsdFilter, hasToken]);

  // Count already watched tokens
  const alreadyWatchedCount = useMemo(() => {
    if (!scanResult) return 0;
    return scanResult.tokens.filter((t) => hasToken(chainId, t.address)).length;
  }, [scanResult, chainId, hasToken]);

  // Count below min filter
  const belowMinCount = useMemo(() => {
    if (!scanResult) return 0;
    return scanResult.tokens.filter((t) => {
      if (hasToken(chainId, t.address)) return false;
      return t.usdValue !== null && t.usdValue < minUsdFilter;
    }).length;
  }, [scanResult, chainId, minUsdFilter, hasToken]);

  const handleScan = async () => {
    if (!isConnected || !walletAddress) return;

    // Prevent double-scan
    if (scanInProgress.current) return;
    scanInProgress.current = true;

    // Track scan started
    scanStartTime.current = Date.now();
    trackWalletScanStarted(walletAddress, chainId);

    setScanning(true);
    setError(null);
    setScanResult(null);
    setSelectedTokens(new Set());

    try {
      const response = await fetch(
        `${API_BASE}/api/v1/wallet/tokens?address=${walletAddress}&chainId=${chainId}&minUsd=0.01`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Scan failed');
      }

      const result: ScanResult = await response.json();
      setScanResult(result);

      const durationMs = Date.now() - scanStartTime.current;

      // Calculate stats for tracking
      const alreadyWatched = result.tokens.filter((t) => hasToken(chainId, t.address)).length;
      const belowMin = result.tokens.filter((t) => {
        if (hasToken(chainId, t.address)) return false;
        return t.usdValue !== null && t.usdValue < minUsdFilter;
      }).length;
      const finalTokens = result.tokens.length - alreadyWatched - belowMin;

      // Track scan completed with expanded stats
      trackWalletScanCompleted(walletAddress, chainId, {
        providerTokens: result.stats.providerTransfers || result.stats.totalTokens,
        finalTokens,
        belowMin,
        alreadyWatched,
        filteredSpam: result.stats.filteredSpam,
        durationMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scan failed';
      setError(message);

      // Track failed scan
      trackWalletScanCompleted(walletAddress, chainId, {
        providerTokens: 0,
        finalTokens: 0,
        belowMin: 0,
        alreadyWatched: 0,
        durationMs: Date.now() - scanStartTime.current,
      });
    } finally {
      setScanning(false);
      scanInProgress.current = false;
    }
  };

  const handleToggleToken = (address: string) => {
    const newSelected = new Set(selectedTokens);
    if (newSelected.has(address)) {
      newSelected.delete(address);
    } else {
      newSelected.add(address);
    }
    setSelectedTokens(newSelected);
  };

  const handleSelectAll = () => {
    const maxToSelect = 20 - tokensCount;
    const newSelected = new Set<string>();
    for (const token of availableTokens.slice(0, maxToSelect)) {
      newSelected.add(token.address);
    }
    setSelectedTokens(newSelected);
  };

  const handleSelectTop5 = () => {
    const maxToSelect = Math.min(5, 20 - tokensCount);
    const newSelected = new Set<string>();
    for (const token of availableTokens.slice(0, maxToSelect)) {
      newSelected.add(token.address);
    }
    setSelectedTokens(newSelected);
  };

  const handleAddSelected = () => {
    if (!walletAddress || selectedTokens.size === 0) return;

    let addedCount = 0;
    for (const address of selectedTokens) {
      const token = availableTokens.find((t) => t.address === address);
      if (token) {
        const success = addToken({
          chainId,
          address: token.address,
          symbol: token.symbol,
        });
        if (success) addedCount++;
      }
    }

    // Track add selected
    trackWalletScanAddSelected(walletAddress, chainId, {
      selectedCount: selectedTokens.size,
      addedCount,
    });

    // Clear selection and refresh available tokens
    setSelectedTokens(new Set());
  };

  const handleRescan = () => {
    setScanResult(null);
    setSelectedTokens(new Set());
    handleScan();
  };

  const slotsAvailable = 20 - tokensCount;
  const canAddMore = slotsAvailable > 0;

  return (
    <div className={`bg-dark-800 rounded-xl p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔎</span>
          <h3 className="text-sm font-medium text-dark-200">Wallet Scan</h3>
        </div>
        {scanResult && (
          <button
            onClick={handleRescan}
            className="text-[10px] text-primary-400 hover:text-primary-300"
          >
            ↻ Rescan
          </button>
        )}
      </div>

      {/* Description */}
      {!scanResult && (
        <p className="text-xs text-dark-400 mb-4">
          Discover tokens in your wallet and add them to your watchlist for monitoring.
        </p>
      )}

      {/* Error State */}
      {error && (
        <div className="mb-4 px-3 py-2 bg-red-900/20 border border-red-700/30 rounded-lg text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Not Connected */}
      {!isConnected ? (
        <div className="flex items-center justify-center py-4 text-dark-500 text-xs">
          <span>Connect your wallet to scan</span>
        </div>
      ) : scanning ? (
        /* Scanning - Skeleton Loading */
        <div className="space-y-3 py-2">
          <div className="flex items-center justify-between mb-2">
            <div className="h-3 w-24 bg-dark-700 rounded animate-pulse" />
            <div className="h-3 w-12 bg-dark-700 rounded animate-pulse" />
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-2 bg-dark-700/50 rounded-lg">
              <div className="w-4 h-4 bg-dark-600 rounded animate-pulse" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-4 w-16 bg-dark-600 rounded animate-pulse" />
                  <div className="h-3 w-24 bg-dark-700 rounded animate-pulse" />
                </div>
                <div className="h-3 w-20 bg-dark-700 rounded animate-pulse" />
              </div>
            </div>
          ))}
          <div className="text-center pt-2">
            <span className="text-dark-400 text-xs">Scanning {CHAIN_NAMES[chainId] || 'chain'}...</span>
          </div>
        </div>
      ) : scanResult ? (
        /* Scan Results */
        <div>
          {/* Provider Error Banner */}
          {hasProviderError(scanResult.warnings) && (
            <div className="mb-3 px-3 py-2 bg-yellow-900/20 border border-yellow-700/30 rounded-lg">
              <div className="text-xs text-yellow-400 mb-1">
                {getProviderErrorMessage(scanResult.warnings)}
              </div>
              <div className="text-[10px] text-dark-500">
                Your wallet is safe - no transactions were made.
              </div>
            </div>
          )}

          {/* Stats Bar */}
          <div className="flex items-center justify-between mb-2 text-[10px] text-dark-500">
            <span>
              Found {scanResult.tokens.length} tokens
              {scanResult.provider && ` via ${scanResult.provider}`}
              {scanResult.cached && ` (cached ${scanResult.cacheAge}s ago)`}
            </span>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-dark-500 hover:text-dark-400 transition-colors"
            >
              {showDetails ? '▼' : '▶'} Details
            </button>
          </div>

          {/* Scan Details (collapsed by default) */}
          {showDetails && (
            <div className="mb-3 p-2 bg-dark-700/30 rounded-lg text-[10px] space-y-1">
              <div className="flex justify-between text-dark-400">
                <span>Provider:</span>
                <span className="text-dark-300">{scanResult.provider || 'explorer'}</span>
              </div>
              <div className="flex justify-between text-dark-400">
                <span>Tokens scanned:</span>
                <span className="text-dark-300">{scanResult.stats.providerTransfers || 0}</span>
              </div>
              <div className="flex justify-between text-dark-400">
                <span>Tokens discovered:</span>
                <span className="text-dark-300">{scanResult.stats.tokensDiscovered || 0}</span>
              </div>
              <div className="flex justify-between text-dark-400">
                <span>With balance:</span>
                <span className="text-dark-300">{scanResult.stats.tokensWithBalance || 0}</span>
              </div>
              <div className="flex justify-between text-dark-400">
                <span>Priced:</span>
                <span className="text-dark-300">{scanResult.stats.tokensPriced || 0}</span>
              </div>
              {scanResult.stats.filteredSpam > 0 && (
                <div className="flex justify-between text-dark-400">
                  <span>Spam filtered:</span>
                  <span className="text-yellow-500">{scanResult.stats.filteredSpam}</span>
                </div>
              )}
              <div className="flex justify-between text-dark-400">
                <span>Scan time:</span>
                <span className="text-dark-300">{scanResult.stats.scanDurationMs}ms</span>
              </div>
              {/* Warnings */}
              {scanResult.warnings && scanResult.warnings.length > 0 && (
                <div className="pt-1 mt-1 border-t border-dark-600/50">
                  {scanResult.warnings.map((warning, i) => (
                    <div key={i} className="text-yellow-500/80 flex items-center gap-1">
                      <span>⚠</span>
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Filter Bar */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] text-dark-500">Min value:</span>
            <select
              value={minUsdFilter}
              onChange={(e) => setMinUsdFilter(Number(e.target.value))}
              className="px-2 py-1 bg-dark-700 border border-dark-600 rounded text-xs text-dark-300"
            >
              {MIN_USD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {availableTokens.length > 0 && canAddMore && (
              <div className="flex gap-1 ml-auto">
                <button
                  onClick={handleSelectTop5}
                  className="px-2 py-1 bg-dark-700 hover:bg-dark-600 text-dark-300 text-[10px] rounded"
                >
                  Top 5
                </button>
                <button
                  onClick={handleSelectAll}
                  className="px-2 py-1 bg-dark-700 hover:bg-dark-600 text-dark-300 text-[10px] rounded"
                >
                  All
                </button>
              </div>
            )}
          </div>

          {/* Token List */}
          {availableTokens.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto mb-3">
              {availableTokens.map((token) => (
                <label
                  key={token.address}
                  className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                    selectedTokens.has(token.address)
                      ? 'bg-primary-900/30 border border-primary-600/30'
                      : 'bg-dark-700/50 hover:bg-dark-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedTokens.has(token.address)}
                    onChange={() => handleToggleToken(token.address)}
                    disabled={!canAddMore && !selectedTokens.has(token.address)}
                    className="w-4 h-4 rounded border-dark-600 bg-dark-700 text-primary-500 focus:ring-primary-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-dark-200 text-sm">{token.symbol}</span>
                      <span className="text-dark-500 text-[10px] truncate">{token.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-dark-400">
                      <span>{token.balanceFormatted}</span>
                      {token.usdValue !== null && (
                        <span className="text-dark-500">
                          (${token.usdValue.toFixed(2)})
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          ) : (
            /* Empty State - Enhanced UX */
            <div className="py-4">
              <div className="text-center mb-4">
                <div className="text-dark-400 text-sm mb-1">No tokens to add</div>
                {scanResult.tokens.length > 0 && (
                  <div className="text-[10px] text-dark-500">
                    {alreadyWatchedCount > 0 && `${alreadyWatchedCount} already watched`}
                    {alreadyWatchedCount > 0 && belowMinCount > 0 && ' · '}
                    {belowMinCount > 0 && `${belowMinCount} below $${minUsdFilter}`}
                  </div>
                )}
              </div>

              {/* Smart Actions */}
              <div className="space-y-2">
                {/* Lower min value quick buttons */}
                {belowMinCount > 0 && (
                  <div className="p-3 bg-dark-700/30 rounded-lg">
                    <div className="text-[10px] text-dark-400 mb-2">Show smaller holdings:</div>
                    <div className="flex gap-1.5">
                      {MIN_USD_OPTIONS.filter(o => o.value < minUsdFilter).map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setMinUsdFilter(opt.value)}
                          className="flex-1 px-2 py-1.5 bg-dark-600 hover:bg-dark-500 text-dark-300 text-[10px] rounded transition-colors"
                        >
                          {opt.label}
                        </button>
                      ))}
                      <button
                        onClick={() => setMinUsdFilter(0.01)}
                        className="flex-1 px-2 py-1.5 bg-primary-600/20 hover:bg-primary-600/30 text-primary-400 text-[10px] rounded border border-primary-600/30 transition-colors"
                      >
                        All
                      </button>
                    </div>
                  </div>
                )}

                {/* No transfers hint */}
                {scanResult.tokens.length === 0 && (
                  <div className="p-3 bg-dark-700/30 rounded-lg text-center">
                    <div className="text-dark-400 text-xs mb-1">No token history on {CHAIN_NAMES[chainId] || 'this chain'}</div>
                    <div className="text-[10px] text-dark-500">
                      Try a different chain or add tokens manually
                    </div>
                  </div>
                )}

                {/* Add manually CTA */}
                <button
                  onClick={() => {
                    // Scroll to token check input
                    const tokenInput = document.querySelector('[data-token-input]');
                    if (tokenInput) {
                      tokenInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      (tokenInput as HTMLInputElement).focus();
                    }
                  }}
                  className="w-full py-2 bg-dark-700/50 hover:bg-dark-700 text-dark-300 text-xs rounded-lg border border-dark-600/50 transition-colors"
                >
                  + Add token manually
                </button>
              </div>
            </div>
          )}

          {/* Add Button */}
          {selectedTokens.size > 0 && (
            <button
              onClick={handleAddSelected}
              disabled={!canAddMore}
              className="w-full py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Add {selectedTokens.size} token{selectedTokens.size !== 1 ? 's' : ''} to Watchlist
            </button>
          )}
        </div>
      ) : (
        /* Initial State - Scan Button */
        <button
          onClick={handleScan}
          disabled={!canAddMore}
          className={`w-full py-3 rounded-lg text-sm font-medium transition-colors ${
            !canAddMore
              ? 'bg-dark-700 text-dark-500 cursor-not-allowed'
              : 'bg-primary-600/20 text-primary-400 hover:bg-primary-600/30 border border-primary-600/30'
          }`}
        >
          {!canAddMore ? (
            'Watchlist full (20/20)'
          ) : (
            <>
              <span>Scan My Wallet</span>
              <span className="ml-2 text-dark-500 text-xs">
                ({slotsAvailable} slots available)
              </span>
            </>
          )}
        </button>
      )}

      {/* Connected Wallet Info */}
      {isConnected && walletAddress && (
        <div className="mt-3 pt-3 border-t border-dark-700/50 flex items-center justify-between text-[10px]">
          <span className="text-dark-500">Connected:</span>
          <span className="text-dark-400 font-mono">
            {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
          </span>
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
