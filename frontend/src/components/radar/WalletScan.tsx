/**
 * Wallet Scan Component
 *
 * Scans the connected wallet for held tokens and adds them to the watchlist.
 * Uses balanceStore data (already fetched on wallet connect) to find tokens
 * with non-zero balances, then adds them to the watchlist for auto-monitoring.
 */

import { useState } from 'react';
import { useWalletStore } from '@/stores/walletStore';
import { useWatchlistStore } from '@/stores/watchlistStore';
import { useBalanceStore, ERC20_TOKENS, CHAIN_NAME_TO_ID } from '@/stores/balanceStore';

interface WalletScanProps {
  className?: string;
}

/** Supported chains for scanning */
const SCAN_CHAINS = ['ethereum', 'bsc', 'polygon'];

export function WalletScan({ className = '' }: WalletScanProps) {
  const isConnected = useWalletStore((s) => s.isConnected);
  const walletAddress = useWalletStore((s) => s.address);
  const tokensCount = useWatchlistStore((s) => s.tokens.length);
  const addToken = useWatchlistStore((s) => s.addToken);
  const hasToken = useWatchlistStore((s) => s.hasToken);
  const balances = useBalanceStore((s) => s.balances);
  const fetchBalances = useBalanceStore((s) => s.fetchBalances);
  const isLoadingBalances = useBalanceStore((s) => s.isLoading);

  const [scanning, setScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [foundTokens, setFoundTokens] = useState(0);
  const [addedTokens, setAddedTokens] = useState(0);
  const [skippedTokens, setSkippedTokens] = useState(0);

  const handleScan = async () => {
    if (!isConnected || !walletAddress) return;

    setScanning(true);
    setScanComplete(false);
    setFoundTokens(0);
    setAddedTokens(0);
    setSkippedTokens(0);

    try {
      // If balances haven't been fetched yet, fetch them now
      const hasBalanceData = Object.keys(balances).length > 0;
      if (!hasBalanceData) {
        await fetchBalances(walletAddress, SCAN_CHAINS);
      }

      // Get fresh reference to balances after potential fetch
      const currentBalances = useBalanceStore.getState().balances;

      let found = 0;
      let added = 0;
      let skipped = 0;

      // Iterate through all chains and find tokens with non-zero balances
      for (const chainName of SCAN_CHAINS) {
        const chainBalance = currentBalances[chainName];
        if (!chainBalance) continue;

        const cId = CHAIN_NAME_TO_ID[chainName];
        if (!cId) continue;

        const erc20List = ERC20_TOKENS[chainName] || [];

        for (const tokenBalance of chainBalance.token_balances) {
          if (parseFloat(tokenBalance.balance) <= 0) continue;

          found++;

          // Look up the contract address from the known token list
          const tokenInfo = erc20List.find((t) => t.symbol === tokenBalance.symbol);
          if (!tokenInfo) continue;

          // Skip if already in watchlist
          if (hasToken(cId, tokenInfo.address)) {
            skipped++;
            continue;
          }

          // Add to watchlist
          const success = addToken({
            chainId: cId,
            address: tokenInfo.address,
            symbol: tokenBalance.symbol,
            label: tokenBalance.name,
          });

          if (success) {
            added++;
          } else {
            // Watchlist full
            break;
          }
        }
      }

      setFoundTokens(found);
      setAddedTokens(added);
      setSkippedTokens(skipped);
    } catch (err) {
      console.error('[WalletScan] Scan failed:', err);
    }

    setScanning(false);
    setScanComplete(true);

    // Reset after 8 seconds
    setTimeout(() => {
      setScanComplete(false);
    }, 8000);
  };

  return (
    <div className={`bg-dark-800 rounded-xl p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🔎</span>
        <h3 className="text-sm font-medium text-dark-200">Wallet Scan</h3>
      </div>

      {/* Description */}
      <p className="text-xs text-dark-400 mb-4">
        Detect tokens in your wallet and add them to your watchlist for automatic monitoring.
      </p>

      {/* Scan Button / Status */}
      {!isConnected ? (
        <div className="flex items-center justify-center py-4 text-dark-500 text-xs">
          <span>Connect your wallet to scan</span>
        </div>
      ) : scanning || isLoadingBalances ? (
        <div className="flex items-center justify-center gap-2 py-4">
          <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-dark-300 text-xs">
            {isLoadingBalances ? 'Fetching balances...' : 'Scanning wallet...'}
          </span>
        </div>
      ) : scanComplete ? (
        <div className="text-center py-4">
          {addedTokens > 0 ? (
            <>
              <div className="text-green-400 text-sm mb-1">
                Added {addedTokens} token{addedTokens !== 1 ? 's' : ''} to watchlist
              </div>
              <div className="text-dark-500 text-xs">
                {foundTokens} held token{foundTokens !== 1 ? 's' : ''} found
                {skippedTokens > 0 && `, ${skippedTokens} already watched`}
              </div>
            </>
          ) : foundTokens > 0 ? (
            <>
              <div className="text-dark-300 text-sm mb-1">All tokens already watched</div>
              <div className="text-dark-500 text-xs">
                {foundTokens} token{foundTokens !== 1 ? 's' : ''} found, all in watchlist
              </div>
            </>
          ) : (
            <>
              <div className="text-dark-400 text-sm mb-1">No tokens found</div>
              <div className="text-dark-500 text-xs">
                No ERC-20 token balances detected
              </div>
            </>
          )}
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
          <span>Scans ETH, BSC, and Polygon for known tokens</span>
        </div>
        <p>
          Detects popular ERC-20 tokens with non-zero balances and adds them
          to your watchlist for automatic signal monitoring.
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
