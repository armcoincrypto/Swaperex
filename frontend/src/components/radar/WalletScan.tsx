/**
 * Wallet Scan Component
 *
 * Scan wallet for tokens and add them to watchlist.
 * Read-only scan - no transactions, no approvals.
 *
 * Radar: Wallet Scan MVP
 */

import { useState, useCallback } from 'react';
import { useWalletStore } from '@/stores/walletStore';
import { useWatchlistStore } from '@/stores/watchlistStore';

const API_BASE = import.meta.env.VITE_SIGNALS_API_URL || 'http://207.180.212.142:4001';
const MAX_WATCHLIST_SIZE = 20;

interface WalletToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceFormatted: string;
  priceUsd: number | null;
  valueUsd: number | null;
  logo: string | null;
  source: string;
}

interface WalletScanProps {
  className?: string;
}

type ScanState = 'idle' | 'scanning' | 'results' | 'error';

export function WalletScan({ className = '' }: WalletScanProps) {
  const isConnected = useWalletStore((s) => s.isConnected);
  const walletAddress = useWalletStore((s) => s.address);
  const chainId = useWalletStore((s) => s.chainId) || 56; // Default to BSC
  const watchlistTokens = useWatchlistStore((s) => s.tokens);
  const addToken = useWatchlistStore((s) => s.addToken);
  const hasToken = useWatchlistStore((s) => s.hasToken);

  const [state, setState] = useState<ScanState>('idle');
  const [tokens, setTokens] = useState<WalletToken[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [addedCount, setAddedCount] = useState(0);

  const availableSlots = MAX_WATCHLIST_SIZE - watchlistTokens.length;

  // Scan wallet for tokens
  const handleScan = useCallback(async () => {
    if (!isConnected || !walletAddress) return;

    setState('scanning');
    setError(null);
    setTokens([]);
    setSelected(new Set());
    setAddedCount(0);

    try {
      const response = await fetch(
        `${API_BASE}/api/v1/wallet-tokens?chainId=${chainId}&wallet=${walletAddress}`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Scan failed: ${response.status}`);
      }

      const data = await response.json();

      if (!data.tokens || data.tokens.length === 0) {
        setTokens([]);
        setState('results');
        return;
      }

      // Filter out tokens already in watchlist
      const newTokens = data.tokens.filter(
        (t: WalletToken) => !hasToken(chainId, t.address)
      );

      setTokens(newTokens);
      setState('results');

      // Auto-select top tokens up to available slots
      const autoSelect = new Set<string>();
      for (let i = 0; i < Math.min(newTokens.length, availableSlots, 10); i++) {
        autoSelect.add(newTokens[i].address);
      }
      setSelected(autoSelect);
    } catch (err: any) {
      console.error('[WalletScan] Error:', err);
      setError(err.message || 'Scan failed. Please try again.');
      setState('error');
    }
  }, [isConnected, walletAddress, chainId, hasToken, availableSlots]);

  // Toggle token selection
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

  // Select presets
  const selectTop = useCallback((count: number) => {
    const maxCount = Math.min(count, tokens.length, availableSlots);
    const newSelection = new Set<string>();
    for (let i = 0; i < maxCount; i++) {
      newSelection.add(tokens[i].address);
    }
    setSelected(newSelection);
  }, [tokens, availableSlots]);

  const selectAll = useCallback(() => {
    const maxCount = Math.min(tokens.length, availableSlots);
    const newSelection = new Set<string>();
    for (let i = 0; i < maxCount; i++) {
      newSelection.add(tokens[i].address);
    }
    setSelected(newSelection);
  }, [tokens, availableSlots]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  // Add selected tokens to watchlist
  const handleAddToWatchlist = useCallback(() => {
    let added = 0;

    for (const token of tokens) {
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

    setAddedCount(added);
    setState('idle');
    setTokens([]);
    setSelected(new Set());

    // Show success briefly
    setTimeout(() => setAddedCount(0), 3000);
  }, [tokens, selected, chainId, addToken]);

  // Reset to idle
  const handleReset = useCallback(() => {
    setState('idle');
    setTokens([]);
    setSelected(new Set());
    setError(null);
  }, []);

  // Format USD value
  const formatUsd = (value: number | null): string => {
    if (value === null) return 'Price unavailable';
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
    if (value >= 1) return `$${value.toFixed(2)}`;
    return `$${value.toFixed(4)}`;
  };

  // Get chain name
  const getChainName = (id: number): string => {
    const chains: Record<number, string> = {
      1: 'Ethereum',
      56: 'BNB Chain',
      137: 'Polygon',
      42161: 'Arbitrum',
      10: 'Optimism',
      43114: 'Avalanche',
    };
    return chains[id] || `Chain ${id}`;
  };

  return (
    <div className={`bg-dark-800 rounded-xl p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🔎</span>
        <h3 className="text-sm font-medium text-dark-200">Wallet Scan</h3>
        {chainId && (
          <span className="px-1.5 py-0.5 bg-dark-700 text-dark-400 text-[10px] rounded">
            {getChainName(chainId)}
          </span>
        )}
      </div>

      {/* Trust messaging */}
      <p className="text-[10px] text-dark-500 mb-3">
        Read-only scan. No approvals. No transactions.
      </p>

      {/* Success toast */}
      {addedCount > 0 && (
        <div className="mb-3 px-3 py-2 bg-green-900/20 border border-green-700/30 rounded-lg text-green-400 text-xs text-center">
          ✓ Added {addedCount} tokens to Watchlist
        </div>
      )}

      {/* State: Not connected */}
      {!isConnected && (
        <div className="flex items-center justify-center py-6 text-dark-500 text-xs">
          <span>Connect wallet to scan</span>
        </div>
      )}

      {/* State: Idle - Show scan button */}
      {isConnected && state === 'idle' && (
        <>
          <p className="text-xs text-dark-400 mb-4">
            Discover tokens in your wallet and add them to your watchlist for monitoring.
          </p>

          <button
            onClick={handleScan}
            disabled={availableSlots === 0}
            className={`w-full py-3 rounded-lg text-sm font-medium transition-colors ${
              availableSlots === 0
                ? 'bg-dark-700 text-dark-500 cursor-not-allowed'
                : 'bg-primary-600/20 text-primary-400 hover:bg-primary-600/30 border border-primary-600/30'
            }`}
          >
            {availableSlots === 0 ? (
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
      )}

      {/* State: Scanning */}
      {state === 'scanning' && (
        <div className="flex flex-col items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mb-3" />
          <span className="text-dark-300 text-sm">Scanning wallet...</span>
          <span className="text-dark-500 text-xs mt-1">This may take a few seconds</span>
        </div>
      )}

      {/* State: Error */}
      {state === 'error' && (
        <div className="text-center py-6">
          <div className="text-red-400 text-sm mb-2">Scan failed</div>
          <div className="text-dark-500 text-xs mb-4">{error}</div>
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-dark-700 text-dark-300 rounded-lg text-xs hover:bg-dark-600 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* State: Results */}
      {state === 'results' && (
        <div>
          {tokens.length === 0 ? (
            <div className="text-center py-6">
              <div className="text-dark-400 text-sm mb-2">No new tokens found</div>
              <div className="text-dark-500 text-xs mb-4">
                All your tokens are already in the watchlist, or no tokens meet the minimum value.
              </div>
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-dark-700 text-dark-300 rounded-lg text-xs hover:bg-dark-600 transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Selection controls */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-dark-400">
                  {tokens.length} tokens found
                </span>
                <div className="flex items-center gap-2 text-[10px]">
                  <button
                    onClick={selectAll}
                    className="text-primary-400 hover:text-primary-300"
                  >
                    All
                  </button>
                  <span className="text-dark-600">|</span>
                  <button
                    onClick={() => selectTop(10)}
                    className="text-primary-400 hover:text-primary-300"
                  >
                    Top 10
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

              {/* Selection warning */}
              {selected.size > availableSlots && (
                <div className="mb-3 px-2 py-1.5 bg-yellow-900/20 border border-yellow-700/30 rounded text-yellow-400 text-[10px]">
                  Only {availableSlots} slots available. First {availableSlots} will be added.
                </div>
              )}

              {/* Token list */}
              <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
                {tokens.map((token) => (
                  <button
                    key={token.address}
                    onClick={() => toggleSelection(token.address)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                      selected.has(token.address)
                        ? 'bg-primary-900/30 border border-primary-700/50'
                        : 'bg-dark-700/50 hover:bg-dark-700 border border-transparent'
                    }`}
                  >
                    {/* Checkbox */}
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                        selected.has(token.address)
                          ? 'bg-primary-600 border-primary-600'
                          : 'border-dark-500'
                      }`}
                    >
                      {selected.has(token.address) && (
                        <span className="text-white text-xs">✓</span>
                      )}
                    </div>

                    {/* Token logo */}
                    {token.logo ? (
                      <img
                        src={token.logo}
                        alt={token.symbol}
                        className="w-6 h-6 rounded-full flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-dark-600 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] text-dark-400">
                          {token.symbol.slice(0, 2)}
                        </span>
                      </div>
                    )}

                    {/* Token info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-dark-200 font-medium truncate">
                          {token.symbol}
                        </span>
                        <span className="text-[10px] text-dark-500 truncate">
                          {token.name}
                        </span>
                      </div>
                      <div className="text-[10px] text-dark-500">
                        {token.balanceFormatted} {token.symbol}
                      </div>
                    </div>

                    {/* Value */}
                    <div className="text-right flex-shrink-0">
                      <div
                        className={`text-xs ${
                          token.valueUsd !== null ? 'text-dark-300' : 'text-dark-500'
                        }`}
                      >
                        {formatUsd(token.valueUsd)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleReset}
                  className="flex-1 py-2 bg-dark-700 text-dark-400 rounded-lg text-xs hover:bg-dark-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddToWatchlist}
                  disabled={selected.size === 0}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    selected.size === 0
                      ? 'bg-dark-700 text-dark-500 cursor-not-allowed'
                      : 'bg-primary-600 text-white hover:bg-primary-500'
                  }`}
                >
                  Add {selected.size} to Watchlist
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Connected wallet info */}
      {isConnected && walletAddress && state === 'idle' && (
        <div className="mt-4 pt-3 border-t border-dark-700/50">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-dark-500">Connected:</span>
            <span className="text-dark-400 font-mono">
              {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </span>
          </div>
          <p className="text-[10px] text-dark-600 mt-2">
            Radar is informational only, not financial advice.
          </p>
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
