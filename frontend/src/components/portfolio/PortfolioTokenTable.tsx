/**
 * Portfolio Token Table
 *
 * Multi-chain token table with search, sort, chain grouping.
 * Uses portfolioStore for sort/filter preferences.
 * Shows token logo, symbol, name, chain badge, balance, USD value, actions.
 */

import { useMemo, useCallback, useState } from 'react';
import {
  usePortfolioStore,
  flattenPortfolioTokens,
  sortTokens,
  filterTokensBySearch,
  filterSmallBalances,
  filterZeroBalances,
  formatUsdPrivate,
  getPortfolioChainBadgeLabel,
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
  const hideZeroBalances = usePortfolioStore((s) => s.hideZeroBalances);
  const setHideZeroBalances = usePortfolioStore((s) => s.setHideZeroBalances);
  const privacyMode = usePortfolioStore((s) => s.privacyMode);

  // Flatten, filter, sort
  const displayTokens = useMemo(() => {
    let tokens = flattenPortfolioTokens(portfolio);
    tokens = filterTokensBySearch(tokens, searchQuery);
    tokens = filterZeroBalances(tokens, hideZeroBalances);
    tokens = filterSmallBalances(tokens, smallBalanceThreshold, hideSmallBalances);
    tokens = sortTokens(tokens, sortMode);
    return tokens;
  }, [portfolio, searchQuery, hideSmallBalances, smallBalanceThreshold, hideZeroBalances, sortMode]);

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
              : hideZeroBalances
              ? 'No tokens with non-zero balance'
              : hideSmallBalances
              ? 'No tokens above threshold'
              : 'No tokens found across chains'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-2 animate-fadeIn ${className}`}>
      {/* Header: title + search + sort + hide zero */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">Your Tokens</h2>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search..."
          className="w-28 sm:w-36 px-2 py-1 bg-dark-800 border border-dark-700 rounded text-xs focus:outline-none focus:border-primary-500"
        />
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="px-2 py-1 bg-dark-800 border border-dark-700 rounded text-xs focus:outline-none focus:border-primary-500"
        >
          <option value="value">By Value</option>
          <option value="balance">By Balance</option>
          <option value="alpha">A–Z</option>
          <option value="chain">By Chain</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-dark-400 cursor-pointer">
          <input
            type="checkbox"
            checked={hideZeroBalances}
            onChange={(e) => setHideZeroBalances(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-dark-600 bg-dark-700 text-primary-500"
          />
          Hide zero
        </label>
      </div>

      {/* Token list */}
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
  const [logoError, setLogoError] = useState(false);
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

  const badge = getPortfolioChainBadgeLabel(token.chain, token.symbol);
  const showName = (() => {
    const name = token.name?.trim();
    if (!name) return false;
    const sameAsSymbol = name.toLowerCase() === token.symbol.toLowerCase();
    const sameAsBadge = badge && name.toLowerCase() === badge.toLowerCase();
    return !sameAsSymbol && !sameAsBadge;
  })();

  const usdDisplay = token.usdValue ? formatUsdPrivate(token.usdValue, privacyMode) : parseFloat(token.balanceFormatted) === 0 ? formatUsdPrivate(0, privacyMode) : '—';
  const priceSuffix = token.usdPrice && !privacyMode ? ` @$${parseFloat(token.usdPrice).toFixed(parseFloat(token.usdPrice) < 1 ? 4 : 2)}` : '';

  return (
    <div
      className="grid gap-3 py-2 px-3 bg-dark-800 rounded-lg hover:bg-dark-700/50 transition-colors group items-center"
      style={{ gridTemplateColumns: 'auto minmax(0, 1fr) auto auto' }}
    >
      {/* Col 1: Logo — fixed width */}
      <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center overflow-hidden shrink-0">
        {token.logoUrl && !logoError ? (
          <img src={token.logoUrl} alt="" role="presentation" className="w-8 h-8 rounded-full object-cover" onError={() => setLogoError(true)} />
        ) : (
          <span className="text-[10px] font-bold text-dark-400">{token.symbol.slice(0, 2)}</span>
        )}
      </div>

      {/* Col 2: Symbol + badge + name — truncates, never pushes value */}
      <div className="min-w-0 overflow-hidden">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-medium text-sm shrink-0">{token.symbol}</span>
          <span className="px-1.5 py-0.5 bg-dark-700 text-dark-400 text-[9px] font-medium rounded shrink-0">{badge}</span>
        </div>
        {showName && <div className="text-[11px] text-dark-500 truncate">{token.name}</div>}
      </div>

      {/* Col 3: Balance + USD — single line, NEVER wrap; explicit flex-row + nowrap */}
      <div className="flex flex-row items-baseline gap-2 whitespace-nowrap flex-nowrap justify-end min-w-[160px] shrink-0">
        <span className="inline-flex whitespace-nowrap text-sm font-medium">{privacyMode ? '****' : formatTokenBalance(token.balanceFormatted)}</span>
        <span className="inline-flex whitespace-nowrap text-[11px] text-dark-400">{usdDisplay}{priceSuffix}</span>
      </div>

      {/* Col 4: Swap + secondary actions */}
      <div className="flex items-center gap-1 shrink-0">
        {onSwap && parseFloat(token.balanceFormatted || '0') > 0 && (
          <button onClick={handleSwap} className="px-2 py-1 bg-primary-600/20 text-primary-400 rounded text-[11px] font-medium hover:bg-primary-600/30 shrink-0">
            Swap
          </button>
        )}
        {!token.isNative && (
          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={handleCopyAddress} className="p-1 text-dark-500 hover:text-dark-300" title="Copy address">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            </button>
            {explorerBase && (
              <a href={`${explorerBase}/token/${token.address}`} target="_blank" rel="noopener noreferrer" className="p-1 text-dark-500 hover:text-dark-300" title="Explorer">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
            )}
            {!isWatched && (
              <button onClick={handleWatchlist} className="p-1 text-dark-500 hover:text-yellow-400" title="Watchlist">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
              </button>
            )}
          </div>
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
