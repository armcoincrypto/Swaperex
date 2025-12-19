/**
 * Token List Component
 *
 * Displays list of token balances.
 */

import { useBalances } from '@/hooks/useBalances';
import { BalanceCard } from './BalanceCard';
import { formatUsd } from '@/utils/format';

export function TokenList() {
  const { currentChainBalances, isLoading, totalUsdValue, refresh } = useBalances();

  if (isLoading && !currentChainBalances) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-dark-800 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!currentChainBalances) {
    return (
      <div className="text-center py-8 text-dark-400">
        Connect your wallet to view balances
      </div>
    );
  }

  const allBalances = [
    currentChainBalances.native_balance,
    ...currentChainBalances.token_balances,
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
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

      {/* Total Value */}
      {totalUsdValue && (
        <div className="p-4 bg-dark-800 rounded-xl">
          <div className="text-sm text-dark-400">Total Balance</div>
          <div className="text-2xl font-bold">{formatUsd(totalUsdValue)}</div>
        </div>
      )}

      {/* Token List */}
      <div className="space-y-2">
        {allBalances.map((balance) => (
          <BalanceCard key={`${balance.chain}-${balance.symbol}`} balance={balance} />
        ))}
      </div>

      {allBalances.length === 0 && (
        <div className="text-center py-8 text-dark-400">
          No tokens found on this chain
        </div>
      )}
    </div>
  );
}

export default TokenList;
