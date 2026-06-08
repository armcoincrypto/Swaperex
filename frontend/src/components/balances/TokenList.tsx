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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white">{children}</h2>
  );
}

function PanelShell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-white/[0.08] bg-electro-panel/50 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

function SidebarAutoUpdateFooter() {
  return (
    <p className="text-center text-[11px] leading-snug text-dark-500/90">
      Auto-updates quietly · every 60s
    </p>
  );
}

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
    totalUsdValue,
    refresh,
    hideZeroBalances,
    currentChainUnsupported,
    currentChainKey,
    currentChainFetchStatus,
  } = useBalances(false);

  /**
   * First paint only — keep showing cached rows while background refresh sets
   * chainStatus to `loading` (avoids 60s skeleton flicker).
   */
  const showInitialBalanceSkeleton =
    isConnected &&
    !!address &&
    !!currentChainKey &&
    !currentChainBalances &&
    currentChainFetchStatus !== 'error' &&
    currentChainFetchStatus !== 'ok';

  // Sort and filter balances
  const sortedBalances = useMemo(() => {
    if (!currentChainBalances) return [];

    const allBalances: TokenBalance[] = [
      currentChainBalances.native_balance,
      ...currentChainBalances.token_balances,
    ].filter(Boolean);

    // Filter balances based on hideZeroBalances setting (store default: true)
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
        <SectionTitle>Your Tokens</SectionTitle>
        <PanelShell className="p-8 text-center">
          <WalletIcon />
          <p className="text-dark-400 mt-2">
            Connect your wallet to view balances
          </p>
        </PanelShell>
      </div>
    );
  }

  // Connected but this chain is not in our balance RPC map
  if (currentChainUnsupported) {
    return (
      <div className="space-y-4">
        <SectionTitle>Your Tokens</SectionTitle>
        <PanelShell className="p-6 text-center border-amber-800/30">
          <p className="text-amber-200/90 text-sm">
            Balances for this network are not available in the sidebar yet.
          </p>
          <p className="text-dark-500 text-xs mt-2">
            Switch to Ethereum, BSC, or Polygon to see token balances here, or use your wallet for amounts.
          </p>
        </PanelShell>
      </div>
    );
  }

  // Initial load only — never replace settled rows during quiet background refresh
  if (showInitialBalanceSkeleton) {
    return (
      <div className="space-y-4">
        <SectionTitle>Your Tokens</SectionTitle>
        <div className="animate-pulse space-y-2.5" aria-busy="true" aria-label="Loading token balances">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[4.25rem] rounded-xl border border-white/[0.06] bg-electro-panel/40"
            />
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
        <SectionTitle>Your Tokens</SectionTitle>
        <PanelShell className="p-6 text-center border-amber-800/25">
          <p className="text-dark-200 text-xs font-semibold uppercase tracking-wide">
            {SWAP_SURFACE_COPY.tokenListNetworkIssueTitle}
          </p>
          <p className="text-dark-300 text-sm leading-relaxed mt-2">
            {SWAP_SURFACE_COPY.tokenListBalancesUnavailable(networkName)}
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-3 min-h-[2.25rem] text-sm text-primary-400 hover:text-primary-300"
          >
            Retry
          </button>
        </PanelShell>
      </div>
    );
  }

  // Settled but no row (should be rare)
  if (!currentChainBalances && currentChainKey) {
    return (
      <div className="space-y-4">
        <SectionTitle>Your Tokens</SectionTitle>
        <PanelShell className="p-6 text-center border-amber-800/25">
          <p className="text-dark-200 text-xs font-semibold uppercase tracking-wide">
            {SWAP_SURFACE_COPY.tokenListNetworkIssueTitle}
          </p>
          <p className="text-dark-300 text-sm mt-2">{SWAP_SURFACE_COPY.tokenListNetworkIssueDetail}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-3 min-h-[2.25rem] text-sm text-primary-400 hover:text-primary-300"
          >
            Retry
          </button>
        </PanelShell>
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
        <SectionTitle>Your Tokens</SectionTitle>
        <PanelShell className="p-8 text-center">
          <EmptyIcon />
          <p className="text-dark-400 mt-2">No tokens found on this chain</p>
          <p className="text-dark-500 text-sm mt-1">Deposit tokens to get started</p>
        </PanelShell>
        <SidebarAutoUpdateFooter />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fadeIn">
      <SectionTitle>Your Tokens</SectionTitle>

      {totalUsdValue && parseFloat(totalUsdValue) > 0 && (
        <PanelShell className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-dark-500">Total Balance</div>
          <div className="text-2xl font-bold tabular-nums mt-1">{formatUsd(totalUsdValue)}</div>
        </PanelShell>
      )}

      <div className="space-y-2.5">
        {sortedBalances.map((balance, index) => (
          <BalanceCard
            key={`${balance.chain || 'unknown'}-${balance.symbol}-${index}`}
            balance={balance}
            onSwap={onSwapToken}
            showSwapButton={showSwapButtons}
          />
        ))}
      </div>

      <SidebarAutoUpdateFooter />
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

export default TokenList;
