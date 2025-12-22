/**
 * Swap History Component
 *
 * Displays recent swap transactions from blockchain explorer.
 * READ-ONLY: No backend, fetches from Etherscan/BSCScan.
 *
 * PRODUCTION: Simple list, no analytics, no charts.
 */

import { useState, useEffect, useCallback } from 'react';
import { useWalletStore } from '@/stores/walletStore';
import {
  getRecentSwaps,
  formatTimeAgo,
  type Transaction,
} from '@/services/transactionHistory';

export function SwapHistory() {
  const { address, chainId, isConnected } = useWalletStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch swap history
  const fetchHistory = useCallback(async () => {
    if (!address || !isConnected) return;

    setIsLoading(true);
    setError(null);

    try {
      const swaps = await getRecentSwaps(address, chainId, 10);
      setTransactions(swaps);
    } catch (err) {
      console.error('[SwapHistory] Fetch failed:', err);
      setError('Failed to load history');
    } finally {
      setIsLoading(false);
    }
  }, [address, chainId, isConnected]);

  // Fetch on mount and chain change
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Not connected state
  if (!isConnected) {
    return null;
  }

  // Loading state
  if (isLoading && transactions.length === 0) {
    return (
      <div className="mt-8">
        <h2 className="text-xl font-bold mb-4">Recent Swaps</h2>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-dark-800 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error && transactions.length === 0) {
    return (
      <div className="mt-8">
        <h2 className="text-xl font-bold mb-4">Recent Swaps</h2>
        <div className="p-4 bg-dark-800 rounded-xl text-center">
          <p className="text-dark-400">{error}</p>
          <button
            onClick={fetchHistory}
            className="mt-2 text-primary-400 hover:text-primary-300 text-sm"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (transactions.length === 0) {
    return (
      <div className="mt-8">
        <h2 className="text-xl font-bold mb-4">Recent Swaps</h2>
        <div className="p-6 bg-dark-800 rounded-xl text-center">
          <SwapIcon />
          <p className="text-dark-400 mt-2">No swap history found</p>
          <p className="text-dark-500 text-sm mt-1">
            Your recent swaps will appear here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Recent Swaps</h2>
        <button
          onClick={fetchHistory}
          disabled={isLoading}
          className="text-sm text-primary-400 hover:text-primary-300 disabled:opacity-50"
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="space-y-2">
        {transactions.map((tx) => (
          <TransactionRow key={tx.hash} transaction={tx} />
        ))}
      </div>

      <div className="text-center text-xs text-dark-500 mt-4">
        Showing last {transactions.length} swap transactions
      </div>
    </div>
  );
}

// Transaction Row Component
function TransactionRow({ transaction }: { transaction: Transaction }) {
  return (
    <a
      href={transaction.explorerUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between p-4 bg-dark-800 rounded-xl hover:bg-dark-700 transition-colors"
    >
      <div className="flex items-center gap-3">
        {/* Status Icon */}
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center ${
            transaction.status === 'success'
              ? 'bg-green-900/30 text-green-400'
              : 'bg-red-900/30 text-red-400'
          }`}
        >
          {transaction.status === 'success' ? <CheckIcon /> : <XIcon />}
        </div>

        {/* Details */}
        <div>
          <div className="font-medium">
            {transaction.swapRouter || 'Swap'}
          </div>
          <div className="text-sm text-dark-400">
            {formatTimeAgo(transaction.timestamp)}
          </div>
        </div>
      </div>

      {/* Value & Link */}
      <div className="flex items-center gap-3">
        {transaction.valueFormatted !== '0' && (
          <span className="text-sm text-dark-300">
            {transaction.valueFormatted}
          </span>
        )}
        <ExternalLinkIcon />
      </div>
    </a>
  );
}

// Icons
function SwapIcon() {
  return (
    <svg className="w-12 h-12 mx-auto text-dark-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg className="w-4 h-4 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

export default SwapHistory;
