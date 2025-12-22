/**
 * Token List Component
 *
 * Displays list of token balances for current chain.
 * Sorted: Native token first, stablecoins second, others by balance.
 *
 * PRODUCTION: No charts, no PnL, no analytics. Just accurate balances.
 * Includes swap buttons per asset for better UX.
 */

import { useMemo } from 'react';
import { useBalances } from '@/hooks/useBalances';
import { BalanceCard } from './BalanceCard';
import { formatUsd } from '@/utils/format';
import type { TokenBalance } from '@/types/api';

interface TokenListProps {
  onSwapToken?: (symbol: string) => void;
  showSwapButtons?: boolean;
}

// Stablecoin symbols for sorting priority
const STABLECOINS = ['USDT', 'USDC', 'BUSD', 'DAI', 'FDUSD', 'TUSD'];

// Minimum balance to display (filter dust)
const MIN_DISPLAY_BALANCE = 0.0001;

export function TokenList({ onSwapToken, showSwapButtons = false }: TokenListProps) {
  const { currentChainBalances, isLoading, totalUsdValue, refresh } = useBalances();

  // Sort and filter balances
  const sortedBalances = useMemo(() => {
    if (!currentChainBalances) return [];

    const allBalances: TokenBalance[] = [
      currentChainBalances.native_balance,
      ...currentChainBalances.token_balances,
    ].filter(Boolean);

    // Filter out dust balances
    const filtered = allBalances.filter(
      (b) => parseFloat(b.balance) >= MIN_DISPLAY_BALANCE
    );

    // Sort: Native first, stables second, others by balance descending
    return filtered.sort((a, b) => {
      // Native token always first
      if (a.symbol === currentChainBalances.native_balance?.symbol) return -1;
      if (b.symbol === currentChainBalances.native_balance?.symbol) return 1;

      // Stablecoins second
      const aIsStable = STABLECOINS.includes(a.symbol.toUpperCase());
      const bIsStable = STABLECOINS.includes(b.symbol.toUpperCase());
      if (aIsStable && !bIsStable) return -1;
      if (!aIsStable && bIsStable) return 1;

      // Sort by balance (descending)
      return parseFloat(b.balance) - parseFloat(a.balance);
    });
  }, [currentChainBalances]);

  // Loading state
  if (isLoading && !currentChainBalances) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Your Tokens</h2>
          <div className="text-sm text-dark-400">Loading...</div>
        </div>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-dark-800 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // Not connected state
  if (!currentChainBalances) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Your Tokens</h2>
        <div className="p-8 bg-dark-800 rounded-xl text-center">
          <WalletIcon />
          <p className="text-dark-400 mt-2">
            Connect your wallet to view balances
          </p>
        </div>
      </div>
    );
  }

  // Empty state (connected but no tokens)
  if (sortedBalances.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Your Tokens</h2>
          <button
            onClick={refresh}
            disabled={isLoading}
            className="text-sm text-primary-400 hover:text-primary-300 disabled:opacity-50"
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <div className="p-8 bg-dark-800 rounded-xl text-center">
          <EmptyIcon />
          <p className="text-dark-400 mt-2">
            No tokens found on this chain
          </p>
          <p className="text-dark-500 text-sm mt-1">
            Deposit tokens to get started
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Your Tokens</h2>
        <button
          onClick={refresh}
          disabled={isLoading}
          className="flex items-center gap-1 text-sm text-primary-400 hover:text-primary-300 disabled:opacity-50"
        >
          {isLoading && <LoadingSpinner />}
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Total Value (only show if we have USD values) */}
      {totalUsdValue && parseFloat(totalUsdValue) > 0 && (
        <div className="p-4 bg-dark-800 rounded-xl">
          <div className="text-sm text-dark-400">Total Balance</div>
          <div className="text-2xl font-bold">{formatUsd(totalUsdValue)}</div>
        </div>
      )}

      {/* Token List */}
      <div className="space-y-2">
        {sortedBalances.map((balance, index) => (
          <BalanceCard
            key={`${balance.chain || 'unknown'}-${balance.symbol}-${index}`}
            balance={balance}
            onSwap={onSwapToken}
            showSwapButton={showSwapButtons}
          />
        ))}
      </div>

      {/* Last updated hint */}
      <div className="text-center text-xs text-dark-500">
        Balances update automatically every 30s
      </div>
    </div>
  );
}

// Icons
function WalletIcon() {
  return (
    <svg className="w-12 h-12 mx-auto text-dark-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  );
}

function EmptyIcon() {
  return (
    <svg className="w-12 h-12 mx-auto text-dark-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default TokenList;
