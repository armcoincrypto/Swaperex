/**
 * Token Row Component
 *
 * Single row in the screener table with:
 * - Token info, price, change, volume, market cap
 * - Swap button, watchlist toggle, expand caret, copy address, explorer link
 */

import type { ScreenerToken, ScreenerChainId } from '@/services/screener/types';
import { useWatchlistStore } from '@/stores/watchlistStore';
import { NATIVE_TOKEN_ADDRESS } from '@/tokens';
import { TokenDetailsPanel } from './TokenDetailsPanel';

interface Props {
  token: ScreenerToken;
  isAdvanced: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSwap: (token: ScreenerToken) => void;
  onRunTokenCheck?: (token: ScreenerToken) => void;
}

const EXPLORER_URLS: Record<ScreenerChainId, string> = {
  1: 'https://etherscan.io',
  56: 'https://bscscan.com',
  137: 'https://polygonscan.com',
  42161: 'https://arbiscan.io',
};

export function TokenRow({ token, isAdvanced, isExpanded, onToggleExpand, onSwap, onRunTokenCheck }: Props) {
  const { addToken, removeToken, hasToken } = useWatchlistStore();
  const addr = token.contractAddress || NATIVE_TOKEN_ADDRESS;
  const isWatched = hasToken(token.chainId, addr);

  const toggleWatchlist = () => {
    if (isWatched) {
      removeToken(token.chainId, addr);
    } else {
      addToken({
        chainId: token.chainId,
        address: addr,
        symbol: token.symbol,
      });
    }
  };

  const explorerUrl = token.contractAddress
    ? `${EXPLORER_URLS[token.chainId]}/token/${token.contractAddress}`
    : EXPLORER_URLS[token.chainId];

  return (
    <>
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 border-t border-dark-800 hover:bg-dark-800/30 transition-colors">
        {/* Token Info */}
        <div className="flex items-center gap-3 min-w-0">
          {token.image ? (
            <img
              src={token.image}
              alt={token.symbol}
              className="w-8 h-8 rounded-full flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
              {token.symbol[0]}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-medium">{token.symbol}</span>
              {isAdvanced && token.trendingScore != null && token.trendingScore >= 70 && (
                <span className="text-[10px] bg-orange-900/40 text-orange-400 px-1 rounded" title="High trending score">
                  HOT
                </span>
              )}
            </div>
            <div className="text-xs text-dark-400 truncate">{token.name}</div>
          </div>
        </div>

        {/* Price */}
        <div className="flex items-center text-sm">
          {formatPrice(token.currentPrice)}
        </div>

        {/* 24h Change */}
        <div className={`flex items-center text-sm ${
          token.priceChange24h > 0 ? 'text-green-400' :
          token.priceChange24h < 0 ? 'text-red-400' : 'text-dark-400'
        }`}>
          {token.priceChange24h > 0 ? '+' : ''}{token.priceChange24h.toFixed(2)}%
        </div>

        {/* Volume */}
        <div className="flex items-center text-sm text-dark-300">
          {formatCompact(token.volume24h)}
        </div>

        {/* Market Cap */}
        <div className="flex items-center text-sm text-dark-300">
          {formatCompact(token.marketCap)}
        </div>

        {/* Actions */}
        {isAdvanced ? (
          <div className="flex items-center gap-1.5 justify-end">
            {/* Watchlist */}
            <button
              onClick={toggleWatchlist}
              className={`p-1.5 rounded transition-colors ${isWatched ? 'text-yellow-400' : 'text-dark-500 hover:text-dark-300'}`}
              title={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
            >
              <svg className="w-4 h-4" fill={isWatched ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>

            {/* Copy address */}
            {token.contractAddress && (
              <button
                onClick={() => navigator.clipboard.writeText(token.contractAddress!)}
                className="p-1.5 text-dark-500 hover:text-dark-300 rounded transition-colors"
                title="Copy contract address"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            )}

            {/* Explorer link */}
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-dark-500 hover:text-dark-300 rounded transition-colors"
              title="View on explorer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>

            {/* Expand */}
            <button
              onClick={onToggleExpand}
              className={`p-1.5 text-dark-500 hover:text-dark-300 rounded transition-all ${isExpanded ? 'rotate-90' : ''}`}
              title="Token details"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Swap */}
            <button
              onClick={() => onSwap(token)}
              className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-xs font-medium rounded-lg transition-colors"
            >
              Swap
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end">
            <button
              onClick={() => onSwap(token)}
              className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-xs font-medium rounded-lg transition-colors"
            >
              Trade
            </button>
          </div>
        )}
      </div>

      {/* Details panel */}
      {isExpanded && isAdvanced && (
        <TokenDetailsPanel
          tokenId={token.id}
          symbol={token.symbol}
          contractAddress={token.contractAddress}
          chainId={token.chainId}
          onRunTokenCheck={onRunTokenCheck ? () => onRunTokenCheck(token) : undefined}
        />
      )}
    </>
  );
}

function formatPrice(price: number): string {
  if (price === 0) return '$0';
  if (price < 0.0001) return `$${price.toExponential(2)}`;
  if (price < 0.01) return `$${price.toFixed(6)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  if (price < 1000) return `$${price.toFixed(2)}`;
  return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatCompact(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export default TokenRow;
