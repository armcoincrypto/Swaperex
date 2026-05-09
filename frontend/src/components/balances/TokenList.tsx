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
import { useWalletStore } from '@/stores/walletStore';
import { useBalances } from '@/hooks/useBalances';
import { BalanceCard } from './BalanceCard';
import { formatUsd } from '@/utils/format';
import type { TokenBalance } from '@/types/api';
import { CHAINS } from '@/config/chains';
import { SWAP_SURFACE_COPY } from '@/constants/swapSurfaceCopy';

interface TokenListProps {
  onSwapToken?: (symbol: string) => void;
  showSwapButtons?: boolean;
}

// Stablecoin symbols for sorting priority
const STABLECOINS = ['USDT', 'USDC', 'BUSD', 'DAI', 'FDUSD', 'TUSD'];

// Minimum balance to display (filter dust)
const MIN_DISPLAY_BALANCE = 0.0001;

export function TokenList({ onSwapToken, showSwapButtons = false }: TokenListProps) {
  const address = useWalletStore((s) => s.address);
  const isConnected = useWalletStore((s) => s.isConnected);
  // `autoRefresh: false` — `<SwapInterface>` already owns the polling cycle; this
  // sidebar only consumes the shared balance state to avoid duplicate RPC fan-out.
  const {
    currentChainBalances,
    isLoading,
    totalUsdValue,
    refresh,
    hideZeroBalances,
    setHideZeroBalances,
    balancesPendingForCurrentChain,
    currentChainUnsupported,
    currentChainKey,
    currentChainFetchStatus,
  } = useBalances(false);

  // Sort and filter balances
  const sortedBalances = useMemo(() => {
    if (!currentChainBalances) return [];

    const allBalances: TokenBalance[] = [
      currentChainBalances.native_balance,
      ...currentChainBalances.token_balances,
    ].filter(Boolean);

    // Filter balances based on hideZeroBalances setting
    const filtered = allBalances.filter((b) => {
      const balance = parseFloat(b.balance);

      // Always filter dust
      if (balance < MIN_DISPLAY_BALANCE && balance > 0) return false;

      // If hiding zeros, skip zero balances (except custom tokens)
      if (hideZeroBalances && balance === 0) {
        // Custom tokens always show even with zero balance
        return (b as TokenBalance & { isCustom?: boolean }).isCustom === true;
      }

      return true;
    });

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
  }, [currentChainBalances, hideZeroBalances]);

  const showConnectPrompt = !isConnected || !address;

  // Truly disconnected — never show this when an address exists
  if (showConnectPrompt) {
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

  // Connected but this chain is not in our balance RPC map
  if (currentChainUnsupported) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Your Tokens</h2>
        <div className="p-6 bg-dark-800 rounded-xl text-center border border-amber-800/30">
          <p className="text-amber-200/90 text-sm">
            Balances for this network are not available in the sidebar yet.
          </p>
          <p className="text-dark-500 text-xs mt-2">
            Switch to Ethereum, BSC, or Polygon to see token balances here, or use your wallet for amounts.
          </p>
        </div>
      </div>
    );
  }

  // Loading / waiting for first row for this chain (avoid fake empty state)
  if (balancesPendingForCurrentChain) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Your Tokens</h2>
          <div className="text-sm text-dark-400">Loading balances…</div>
        </div>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-dark-800 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // Fetch failed for this chain — RPC/read issue; swaps and wallet are still valid
  if (currentChainKey && currentChainFetchStatus === 'error') {
    const networkName =
      currentChainKey in CHAINS
        ? CHAINS[currentChainKey as keyof typeof CHAINS].name
        : currentChainKey;
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Your Tokens</h2>
        <div className="p-6 bg-dark-800 rounded-xl text-center border border-amber-800/25">
          <p className="text-dark-200 text-xs font-semibold uppercase tracking-wide">
            {SWAP_SURFACE_COPY.tokenListNetworkIssueTitle}
          </p>
          <p className="text-dark-300 text-sm leading-relaxed mt-2">
            {SWAP_SURFACE_COPY.tokenListBalancesUnavailable(networkName)}
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-3 text-sm text-primary-400 hover:text-primary-300"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Settled but no row (should be rare)
  if (!currentChainBalances && currentChainKey) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Your Tokens</h2>
        <div className="p-6 bg-dark-800 rounded-xl text-center border border-amber-800/25">
          <p className="text-dark-200 text-xs font-semibold uppercase tracking-wide">
            {SWAP_SURFACE_COPY.tokenListNetworkIssueTitle}
          </p>
          <p className="text-dark-300 text-sm mt-2">{SWAP_SURFACE_COPY.tokenListNetworkIssueDetail}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-3 text-sm text-primary-400 hover:text-primary-300"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!currentChainBalances) {
    return null;
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
    <div className="space-y-4 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Your Tokens</h2>
        <div className="flex items-center gap-3">
          {/* Hide Zero Toggle */}
          <label className="flex items-center gap-2 text-sm text-dark-400 cursor-pointer">
            <input
              id="hide-zero-balances"
              name="hide-zero-balances"
              type="checkbox"
              checked={hideZeroBalances}
              onChange={(e) => setHideZeroBalances(e.target.checked)}
              className="w-4 h-4 rounded border-dark-600 bg-dark-700 text-primary-500 focus:ring-primary-500"
            />
            <span>Hide zero</span>
          </label>
          <button
            onClick={refresh}
            disabled={isLoading}
            className="flex items-center gap-1 text-sm text-primary-400 hover:text-primary-300 disabled:opacity-50"
          >
            {isLoading && <LoadingSpinner />}
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
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
        Balances update automatically every 60s
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
