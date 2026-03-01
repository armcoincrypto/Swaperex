/**
 * Portfolio Token Table
 *
 * Multi-chain token table with search, sort, chain grouping.
 * Uses portfolioStore for sort/filter preferences.
 * Shows token logo, symbol, name, chain badge, balance, USD value, actions.
 */

import { useMemo, useCallback } from 'react';
import {
  usePortfolioStore,
  flattenPortfolioTokens,
  sortTokens,
  filterTokensBySearch,
  filterSmallBalances,
  formatUsdPrivate,
  getPortfolioChainLabel,
  type SortMode,
} from '@/stores/portfolioStore';
import { useWatchlistStore } from '@/stores/watchlistStore';
import type { TokenBalance } from '@/services/portfolioTypes';
import { PORTFOLIO_CHAIN_IDS } from '@/services/portfolioTypes';

interface PortfolioTokenTableProps {
  onSwapToken?: (symbol: string, chainId: number) => void;
  className?: string;
}

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

  // Flatten, filter, sort
  const displayTokens = useMemo(() => {
    let tokens = flattenPortfolioTokens(portfolio);
    tokens = filterTokensBySearch(tokens, searchQuery);
    tokens = filterSmallBalances(tokens, smallBalanceThreshold, hideSmallBalances);
    tokens = sortTokens(tokens, sortMode);
    return tokens;
  }, [portfolio, searchQuery, hideSmallBalances, smallBalanceThreshold, sortMode]);

  // Loading skeleton
  if (loading && !portfolio) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Your Tokens</h2>
        </div>
        <div className="animate-pulse space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-dark-800 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (!portfolio || displayTokens.length === 0) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Your Tokens</h2>
        </div>
        <div className="p-8 bg-dark-800 rounded-xl text-center">
          <svg className="w-10 h-10 mx-auto text-dark-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <p className="text-dark-400 text-sm">
            {searchQuery
              ? `No tokens match "${searchQuery}"`
              : hideSmallBalances
              ? 'No tokens above threshold'
              : 'No tokens found across chains'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-3 animate-fadeIn ${className}`}>
      {/* Header with search + sort */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold whitespace-nowrap">Your Tokens</h2>

        <div className="flex items-center gap-2 flex-1 justify-end">
          {/* Search */}
          <input
            id="portfolio-search"
            name="portfolio-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-32 sm:w-40 px-2.5 py-1.5 bg-dark-800 border border-dark-700 rounded-lg text-xs text-dark-200 placeholder-dark-500 focus:outline-none focus:border-primary-500"
          />

          {/* Sort */}
          <select
            id="portfolio-sort"
            name="portfolio-sort"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="px-2 py-1.5 bg-dark-800 border border-dark-700 rounded-lg text-xs text-dark-200 focus:outline-none focus:border-primary-500"
          >
            <option value="value">By Value</option>
            <option value="balance">By Balance</option>
            <option value="alpha">A-Z</option>
            <option value="chain">By Chain</option>
          </select>
        </div>
      </div>

      {/* Token count */}
      <div className="text-[11px] text-dark-500">
        {displayTokens.length} token{displayTokens.length !== 1 ? 's' : ''} across{' '}
        {(() => { const c = new Set(displayTokens.map((t) => t.chain)).size; return `${c} chain${c !== 1 ? 's' : ''}`; })()}
      </div>

      {/* Token rows */}
      <div className="space-y-1.5">
        {displayTokens.map((token, i) => (
          <PortfolioTokenRow
            key={`${token.chain}-${token.address}-${i}`}
            token={token}
            privacyMode={privacyMode}
            onSwap={onSwapToken}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Token Row ─────────────────────────────────────────────────────

function PortfolioTokenRow({
  token,
  privacyMode,
  onSwap,
}: {
  token: TokenBalance;
  privacyMode: boolean;
  onSwap?: (symbol: string, chainId: number) => void;
}) {
  const addToWatchlist = useWatchlistStore((s) => s.addToken);
  const hasInWatchlist = useWatchlistStore((s) => s.hasToken);
  const chainId = typeof PORTFOLIO_CHAIN_IDS[token.chain] === 'number'
    ? PORTFOLIO_CHAIN_IDS[token.chain] as number
    : 1;

  const isWatched = hasInWatchlist(chainId, token.address);

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
      addToWatchlist({
        chainId,
        address: token.address,
        symbol: token.symbol,
      });
    }
  }, [isWatched, addToWatchlist, chainId, token.address, token.symbol]);

  const explorerBase = getExplorerBase(chainId);

  return (
    <div className="flex items-center justify-between p-3 bg-dark-800 rounded-xl hover:bg-dark-700/50 transition-colors group">
      {/* Left: logo + symbol + chain */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Token Logo */}
        <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center overflow-hidden flex-shrink-0">
          {token.logoUrl ? (
            <img
              src={token.logoUrl}
              alt={token.symbol}
              className="w-8 h-8 rounded-full"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <span className="text-xs font-bold text-dark-400">
              {token.symbol.slice(0, 2)}
            </span>
          )}
        </div>

        {/* Symbol + Name + Chain */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-sm truncate">{token.symbol}</span>
            <span className="px-1.5 py-0.5 bg-dark-700 text-dark-400 text-[9px] font-medium rounded">
              {getPortfolioChainLabel(token.chain)}
            </span>
          </div>
          <div className="text-[11px] text-dark-500 truncate">{token.name}</div>
        </div>
      </div>

      {/* Middle: balance + USD */}
      <div className="text-right mx-3 flex-shrink-0">
        <div className="text-sm font-medium">
          {privacyMode ? '****' : formatTokenBalance(token.balanceFormatted)}
        </div>
        <div className="text-[11px] text-dark-400">
          {token.usdValue
            ? formatUsdPrivate(token.usdValue, privacyMode)
            : parseFloat(token.balanceFormatted) === 0
            ? formatUsdPrivate(0, privacyMode)
            : <span className="text-dark-600" title="Price unavailable">—</span>}
          {token.usdPrice && !privacyMode && (
            <span className="text-dark-600 ml-1">
              @${parseFloat(token.usdPrice).toFixed(
                parseFloat(token.usdPrice) < 1 ? 4 : 2
              )}
            </span>
          )}
        </div>
      </div>

      {/* Right: actions (visible on hover) */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {onSwap && (
          <button
            onClick={handleSwap}
            className="px-2 py-1 bg-primary-600/20 text-primary-400 rounded text-[11px] font-medium hover:bg-primary-600/30 transition-colors"
            title="Swap"
          >
            Swap
          </button>
        )}
        {!token.isNative && (
          <>
            <button
              onClick={handleCopyAddress}
              className="p-1.5 text-dark-500 hover:text-dark-300 transition-colors"
              title="Copy contract address"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            {explorerBase && (
              <a
                href={`${explorerBase}/token/${token.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 text-dark-500 hover:text-dark-300 transition-colors"
                title="View on explorer"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
            {!isWatched && (
              <button
                onClick={handleWatchlist}
                className="p-1.5 text-dark-500 hover:text-yellow-400 transition-colors"
                title="Add to watchlist"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────

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
    case 1: return 'https://etherscan.io';
    case 56: return 'https://bscscan.com';
    case 137: return 'https://polygonscan.com';
    case 42161: return 'https://arbiscan.io';
    default: return null;
  }
}

export default PortfolioTokenTable;
