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
  };
  cached: boolean;
  cacheAge?: number;
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
  const scanStartTime = useRef<number>(0);

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

      // Track scan completed
      trackWalletScanCompleted(walletAddress, chainId, {
        providerTokens: result.stats.totalTokens,
        finalTokens,
        belowMin,
        alreadyWatched,
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

  const handleLowerMinFilter = () => {
    const currentIndex = MIN_USD_OPTIONS.findIndex((o) => o.value === minUsdFilter);
    if (currentIndex > 0) {
      setMinUsdFilter(MIN_USD_OPTIONS[currentIndex - 1].value);
    }
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
        /* Scanning */
        <div className="flex flex-col items-center justify-center gap-2 py-6">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-dark-300 text-xs">Scanning wallet...</span>
          <span className="text-dark-500 text-[10px]">This may take a few seconds</span>
        </div>
      ) : scanResult ? (
        /* Scan Results */
        <div>
          {/* Stats Bar */}
          <div className="flex items-center justify-between mb-3 text-[10px] text-dark-500">
            <span>
              Found {scanResult.tokens.length} tokens
              {scanResult.cached && ` (cached ${scanResult.cacheAge}s ago)`}
            </span>
            <span>{scanResult.stats.scanDurationMs}ms</span>
          </div>

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
            /* Empty State */
            <div className="py-4 text-center">
              <div className="text-dark-500 text-sm mb-2">No tokens to add</div>
              <div className="text-[10px] text-dark-600 space-y-1">
                {alreadyWatchedCount > 0 && (
                  <div>
                    {alreadyWatchedCount} already in watchlist
                  </div>
                )}
                {belowMinCount > 0 && (
                  <div className="flex items-center justify-center gap-2">
                    <span>{belowMinCount} below ${minUsdFilter} filter</span>
                    <button
                      onClick={handleLowerMinFilter}
                      className="text-primary-400 hover:text-primary-300"
                    >
                      Lower filter ↓
                    </button>
                  </div>
                )}
                {scanResult.tokens.length === 0 && (
                  <div>No token transfers found in recent history</div>
                )}
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
