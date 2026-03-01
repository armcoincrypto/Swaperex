/**
 * Wallet Scan Component
 *
 * Entry point for scanning a wallet and auto-adding tokens to watchlist.
 * Currently a stub/placeholder for future implementation.
 *
 * Step 5 - Wallet Scan Entry Point
 */

import { useState } from 'react';
import { useWalletStore } from '@/stores/walletStore';
import { useWatchlistStore } from '@/stores/watchlistStore';

interface WalletScanProps {
  className?: string;
}

export function WalletScan({ className = '' }: WalletScanProps) {
  const isConnected = useWalletStore((s) => s.isConnected);
  const walletAddress = useWalletStore((s) => s.address);
  const tokensCount = useWatchlistStore((s) => s.tokens.length);

  const [scanning, setScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [foundTokens, setFoundTokens] = useState(0);

  // Stub scan function - placeholder for actual implementation
  const handleScan = async () => {
    if (!isConnected || !walletAddress) return;

    setScanning(true);
    setScanComplete(false);
    setFoundTokens(0);

    // Simulate scanning delay (placeholder)
    // In real implementation, this would:
    // 1. Fetch wallet token holdings from an API (Alchemy, Moralis, etc.)
    // 2. Filter for tokens with significant value
    // 3. Add them to the watchlist
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Placeholder result
    const mockFoundCount = 0;
    setFoundTokens(mockFoundCount);
    setScanning(false);
    setScanComplete(true);

    // Reset after 5 seconds
    setTimeout(() => {
      setScanComplete(false);
    }, 5000);
  };

  return (
    <div className={`bg-dark-800 rounded-xl p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🔎</span>
        <h3 className="text-sm font-medium text-dark-200">Wallet Scan</h3>
        <span className="px-1.5 py-0.5 bg-primary-900/30 text-primary-400 text-[10px] rounded font-medium">
          Coming Soon
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-dark-400 mb-4">
        Automatically detect tokens in your wallet and add them to your watchlist for monitoring.
      </p>

      {/* Scan Button / Status */}
      {!isConnected ? (
        <div className="flex items-center justify-center py-4 text-dark-500 text-xs">
          <span>Connect your wallet to scan</span>
        </div>
      ) : scanning ? (
        <div className="flex items-center justify-center gap-2 py-4">
          <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-dark-300 text-xs">Scanning wallet...</span>
        </div>
      ) : scanComplete ? (
        <div className="text-center py-4">
          <div className="text-green-400 text-sm mb-1">Scan complete</div>
          <div className="text-dark-500 text-xs">
            {foundTokens > 0
              ? `Found ${foundTokens} tokens to watch`
              : 'No new tokens found'}
          </div>
        </div>
      ) : (
        <button
          onClick={handleScan}
          disabled={tokensCount >= 20}
          className={`w-full py-3 rounded-lg text-sm font-medium transition-colors ${
            tokensCount >= 20
              ? 'bg-dark-700 text-dark-500 cursor-not-allowed'
              : 'bg-primary-600/20 text-primary-400 hover:bg-primary-600/30 border border-primary-600/30'
          }`}
        >
          {tokensCount >= 20 ? (
            'Watchlist full (20/20)'
          ) : (
            <>
              <span>Scan My Wallet</span>
              <span className="ml-2 text-dark-500 text-xs">
                ({20 - tokensCount} slots available)
              </span>
            </>
          )}
        </button>
      )}

      {/* Info Footer */}
      <div className="mt-4 pt-3 border-t border-dark-700/50 text-[10px] text-dark-500">
        <div className="flex items-center gap-1 mb-1">
          <span>ℹ️</span>
          <span>This feature is in development</span>
        </div>
        <p>
          Future versions will automatically detect ERC-20 tokens, filter by value,
          and add them to your watchlist with one click.
        </p>
      </div>

      {/* Connected Wallet Info */}
      {isConnected && walletAddress && (
        <div className="mt-3 flex items-center justify-between text-[10px]">
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
