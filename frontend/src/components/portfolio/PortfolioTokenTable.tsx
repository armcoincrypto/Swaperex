/**
 * Portfolio Token Table — P3.8 professional holdings table.
 * Presentation-only; same data sources and actions as before.
 */

import { useMemo, useCallback } from 'react';
import {
  usePortfolioStore,
  flattenPortfolioTokens,
  sortTokens,
  filterTokensBySearch,
  filterSmallBalances,
  formatUsdPrivate,
  getPortfolioChainBadgeLabel,
  type SortMode,
} from '@/stores/portfolioStore';
import { useWatchlistStore } from '@/stores/watchlistStore';
import type { TokenBalance } from '@/services/portfolioTypes';
import { PORTFOLIO_CHAIN_IDS } from '@/services/portfolioTypes';
import { SwapTokenAvatar } from '@/components/common/SwapTokenAvatar';
import {
  ShellEmptyState,
  ShellLoadingRows,
  ShellPanel,
} from '@/components/ui/ShellPrimitives';

interface PortfolioTokenTableProps {
  onSwapToken?: (symbol: string, chainId: number) => void;
  className?: string;
}

const CHAIN_PILL: Record<string, string> = {
  ethereum: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  bsc: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/25',
  polygon: 'bg-purple-500/15 text-purple-300 border-purple-500/25',
};

export function PortfolioTokenTable({ onSwapToken, className = '' }: PortfolioTokenTableProps) {
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const loading = usePortfolioStore((s) => s.loading);
  const sortMode = usePortfolioStore((s) => s.sortMode);
  const setSortMode = usePortfolioStore((s) => s.setSortMode);
  const searchQuery = usePortfolioStore((s) => s.searchQuery);
  const setSearchQuery = usePortfolioStore((s) => s.setSearchQuery);
  const hideSmallBalances = usePortfolioStore((s) => s.hideSmallBalances);
  const smallBalanceThreshold = usePortfolioStore((s) => s.smallBalanceThreshold);
  const privacyMode = usePortfolioStore((s) => s.privacyMode);

  const displayTokens = useMemo(() => {
    let tokens = flattenPortfolioTokens(portfolio);
    tokens = filterTokensBySearch(tokens, searchQuery);
    tokens = filterSmallBalances(tokens, smallBalanceThreshold, hideSmallBalances);
    tokens = sortTokens(tokens, sortMode);
    return tokens;
  }, [portfolio, searchQuery, hideSmallBalances, smallBalanceThreshold, sortMode]);

  const totalUsd = useMemo(() => {
    return displayTokens.reduce((sum, t) => {
      const v = parseFloat(t.usdValue || '0');
      return sum + (Number.isFinite(v) && v > 0 ? v : 0);
    }, 0);
  }, [displayTokens]);

  if (loading && !portfolio) {
    return (
      <div className={`space-y-4 ${className}`}>
        <ShellLoadingRows count={4} rowClassName="h-14 rounded-xl" />
      </div>
    );
  }

  if (!portfolio || displayTokens.length === 0) {
    return (
      <ShellEmptyState
        className={className}
        icon={
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
        }
        title={
          searchQuery
            ? `No tokens match "${searchQuery}"`
            : hideSmallBalances
              ? 'No tokens above threshold'
              : 'No tokens found across chains'
        }
      />
    );
  }

  return (
    <div className={`space-y-3 animate-fadeIn ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] text-dark-500 tabular-nums">
          {displayTokens.length} holding{displayTokens.length !== 1 ? 's' : ''}
        </div>
        <div className="flex items-center gap-2 flex-1 justify-end">
          <input
            id="portfolio-search"
            name="portfolio-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search assets…"
            className="w-32 sm:w-44 input text-xs py-1.5"
          />
          <select
            id="portfolio-sort"
            name="portfolio-sort"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="px-2 py-1.5 bg-electro-bgAlt/80 border border-white/[0.08] rounded-lg text-xs text-dark-200 focus:outline-none focus:ring-1 focus:ring-accent/30"
          >
            <option value="value">By Value</option>
            <option value="balance">By Balance</option>
            <option value="alpha">A-Z</option>
            <option value="chain">By Chain</option>
          </select>
        </div>
      </div>

      <ShellPanel className="overflow-hidden p-0">
        <div className="overflow-x-auto max-h-[min(70vh,520px)] overflow-y-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-electro-panel/95 backdrop-blur-md border-b border-white/[0.08]">
              <tr className="text-[10px] uppercase tracking-wider text-dark-500">
                <th className="text-left font-medium px-4 py-3">Asset</th>
                <th className="text-left font-medium px-3 py-3">Chain</th>
                <th className="text-right font-medium px-3 py-3">Balance</th>
                <th className="text-right font-medium px-3 py-3">Value</th>
                <th className="text-right font-medium px-3 py-3">Portfolio %</th>
                <th className="text-right font-medium px-4 py-3 w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayTokens.map((token, i) => (
                <PortfolioTokenRow
                  key={`${token.chain}-${token.address}-${i}`}
                  token={token}
                  privacyMode={privacyMode}
                  totalUsd={totalUsd}
                  onSwap={onSwapToken}
                />
              ))}
            </tbody>
          </table>
        </div>
      </ShellPanel>
    </div>
  );
}

function PortfolioTokenRow({
  token,
  privacyMode,
  totalUsd,
  onSwap,
}: {
  token: TokenBalance;
  privacyMode: boolean;
  totalUsd: number;
  onSwap?: (symbol: string, chainId: number) => void;
}) {
  const addToWatchlist = useWatchlistStore((s) => s.addToken);
  const hasInWatchlist = useWatchlistStore((s) => s.hasToken);
  const chainId =
    typeof PORTFOLIO_CHAIN_IDS[token.chain] === 'number'
      ? (PORTFOLIO_CHAIN_IDS[token.chain] as number)
      : 1;

  const isWatched = hasInWatchlist(chainId, token.address);
  const usd = parseFloat(token.usdValue || '0');
  const portfolioPct = totalUsd > 0 && usd > 0 ? (usd / totalUsd) * 100 : 0;
  const chainLabel = getPortfolioChainBadgeLabel(token.chain, token.symbol);
  const chainPill = CHAIN_PILL[token.chain] ?? 'bg-electro-panel/60 text-dark-300 border-white/[0.08]';

  const handleCopyAddress = useCallback(() => {
    if (token.address && !token.isNative) {
      navigator.clipboard.writeText(token.address);
    }
  }, [token.address, token.isNative]);

  const handleSwap = useCallback(() => {
    if (onSwap) onSwap(token.symbol, chainId);
  }, [onSwap, token.symbol, chainId]);

  const handleWatchlist = useCallback(() => {
    if (!isWatched) {
      addToWatchlist({ chainId, address: token.address, symbol: token.symbol });
    }
  }, [isWatched, addToWatchlist, chainId, token.address, token.symbol]);

  const explorerBase = getExplorerBase(chainId);

  return (
    <tr className="group border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <SwapTokenAvatar symbol={token.symbol} logoUrl={token.logoUrl ?? undefined} size="md" />
          <div className="min-w-0">
            <p className="font-medium text-white truncate">{token.symbol}</p>
            <p className="text-[11px] text-dark-500 truncate max-w-[140px]">{token.name}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <span
          className={`inline-flex text-[10px] font-medium rounded-full border px-2 py-0.5 ${chainPill}`}
        >
          {chainLabel}
        </span>
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-dark-200">
        {privacyMode ? '****' : formatTokenBalance(token.balanceFormatted)}
      </td>
      <td className="px-3 py-3 text-right tabular-nums">
        <span className="text-white font-medium">
          {token.usdValue
            ? formatUsdPrivate(token.usdValue, privacyMode)
            : parseFloat(token.balanceFormatted) === 0
              ? formatUsdPrivate(0, privacyMode)
              : '—'}
        </span>
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-dark-400">
        {privacyMode || portfolioPct <= 0 ? (privacyMode ? '****' : '—') : `${portfolioPct.toFixed(1)}%`}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
          {onSwap && (
            <button
              type="button"
              onClick={handleSwap}
              className="px-2 py-1 bg-accent/15 text-accent rounded-md text-[10px] font-semibold hover:bg-accent/25 transition-colors"
            >
              Swap
            </button>
          )}
          {!token.isNative && (
            <>
              <button
                type="button"
                onClick={handleCopyAddress}
                className="p-1.5 text-dark-500 hover:text-dark-300 transition-colors"
                title="Copy contract"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </button>
              {explorerBase && (
                <a
                  href={`${explorerBase}/token/${token.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-dark-500 hover:text-dark-300 transition-colors"
                  title="Explorer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              )}
              {!isWatched && (
                <button
                  type="button"
                  onClick={handleWatchlist}
                  className="p-1.5 text-dark-500 hover:text-yellow-400 transition-colors"
                  title="Watchlist"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                    />
                  </svg>
                </button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function formatTokenBalance(formatted: string): string {
  const num = parseFloat(formatted);
  if (num === 0) return '0';
  if (num < 0.0001) return '< 0.0001';
  if (num < 1) return num.toFixed(4);
  if (num < 1000) return num.toFixed(4);
  if (num < 1_000_000) return `${(num / 1_000).toFixed(2)}K`;
  return `${(num / 1_000_000).toFixed(2)}M`;
}

function getExplorerBase(chainId: number): string | null {
  switch (chainId) {
    case 1:
      return 'https://etherscan.io';
    case 56:
      return 'https://bscscan.com';
    case 137:
      return 'https://polygonscan.com';
    case 42161:
      return 'https://arbiscan.io';
    default:
      return null;
  }
}

export default PortfolioTokenTable;
