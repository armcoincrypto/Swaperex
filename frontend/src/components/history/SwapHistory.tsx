/**
 * Swap History Component
 *
 * Displays recent swap transactions from blockchain explorer + local history.
 * READ-ONLY for blockchain data, fetches from Etherscan/BSCScan.
 * Local history enables Quick Repeat functionality.
 *
 * PRODUCTION: Simple list with Quick Repeat, no analytics, no charts.
 */

import { useState, useEffect, useCallback } from 'react';
import { useWalletStore } from '@/stores/walletStore';
import { useSwapHistoryStore, type SwapRecord } from '@/stores/swapHistoryStore';
import {
  getRecentSwaps,
  formatTimeAgo,
  type Transaction,
} from '@/services/transactionHistory';

interface SwapHistoryProps {
  onRepeatSwap?: (record: SwapRecord) => void;
}

export function SwapHistory({ onRepeatSwap }: SwapHistoryProps = {}) {
  const { address, chainId, isConnected } = useWalletStore();
  const { getRecentRecords } = useSwapHistoryStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showLocalHistory, setShowLocalHistory] = useState(true);

  // Get local swap records for current chain
  const localRecords = getRecentRecords(10).filter((r) => r.chainId === chainId);
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

  // Empty state - check both local and blockchain
  const hasLocalRecords = localRecords.length > 0;
  const hasBlockchainTx = transactions.length > 0;

  if (!hasLocalRecords && !hasBlockchainTx) {
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
        <div className="flex items-center gap-3">
          {/* Toggle for local vs blockchain history */}
          {hasLocalRecords && (
            <div className="flex gap-1 p-1 bg-dark-800 rounded-lg">
              <button
                onClick={() => setShowLocalHistory(true)}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  showLocalHistory
                    ? 'bg-primary-600 text-white'
                    : 'text-dark-400 hover:text-white'
                }`}
              >
                Quick Repeat
              </button>
              <button
                onClick={() => setShowLocalHistory(false)}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  !showLocalHistory
                    ? 'bg-primary-600 text-white'
                    : 'text-dark-400 hover:text-white'
                }`}
              >
                Blockchain
              </button>
            </div>
          )}
          <button
            onClick={fetchHistory}
            disabled={isLoading}
            className="text-sm text-primary-400 hover:text-primary-300 disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Local History with Quick Repeat */}
      {showLocalHistory && hasLocalRecords && (
        <div className="space-y-2">
          {localRecords.map((record) => (
            <LocalSwapRow
              key={record.id}
              record={record}
              onRepeat={onRepeatSwap}
            />
          ))}
          <div className="text-center text-xs text-dark-500 mt-4">
            Click repeat to prefill a new swap with same tokens
          </div>
        </div>
      )}

      {/* Blockchain History */}
      {(!showLocalHistory || !hasLocalRecords) && hasBlockchainTx && (
        <div className="space-y-2">
          {transactions.map((tx) => (
            <TransactionRow key={tx.hash} transaction={tx} />
          ))}
          <div className="text-center text-xs text-dark-500 mt-4">
            Showing last {transactions.length} swap transactions
          </div>
        </div>
      )}
    </div>
  );
}

// Local Swap Row with Quick Repeat
function LocalSwapRow({
  record,
  onRepeat,
}: {
  record: SwapRecord;
  onRepeat?: (record: SwapRecord) => void;
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-dark-800 rounded-xl hover:bg-dark-700/50 transition-colors">
      <div className="flex items-center gap-3">
        {/* Status Icon */}
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center ${
            record.status === 'success'
              ? 'bg-green-900/30 text-green-400'
              : record.status === 'pending'
              ? 'bg-yellow-900/30 text-yellow-400'
              : 'bg-red-900/30 text-red-400'
          }`}
        >
          {record.status === 'success' ? <CheckIcon /> : record.status === 'pending' ? <ClockIcon /> : <XIcon />}
        </div>

        {/* Swap Details */}
        <div>
          <div className="font-medium flex items-center gap-2">
            <span>{record.fromAmount}</span>
            <span className="text-primary-400">{record.fromAsset.symbol}</span>
            <ArrowRightIcon />
            <span>{parseFloat(record.toAmount).toFixed(4)}</span>
            <span className="text-primary-400">{record.toAsset.symbol}</span>
          </div>
          <div className="text-sm text-dark-400 flex items-center gap-2">
            <span>{formatTimeAgo(record.timestamp)}</span>
            <span className="text-dark-600">via {record.provider}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Repeat Button */}
        {onRepeat && record.status === 'success' && (
          <button
            onClick={() => onRepeat(record)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600/20 text-primary-400 rounded-lg hover:bg-primary-600/30 transition-colors text-sm font-medium"
            title="Repeat this swap"
          >
            <RepeatIcon />
            <span>Repeat</span>
          </button>
        )}
        {/* Explorer Link */}
        <a
          href={record.explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 text-dark-400 hover:text-white transition-colors"
          title="View on explorer"
        >
          <ExternalLinkIcon />
        </a>
      </div>
    </div>
  );
}

// Transaction Row Component (Blockchain history)
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

function RepeatIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg className="w-4 h-4 text-dark-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export default SwapHistory;
