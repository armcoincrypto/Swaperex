/**
 * Quick Actions Component
 *
 * Provides action buttons for signals and alerts:
 * - Open on DexScreener
 * - Add/Remove from watchlist
 * - Open swap (navigate to swap with token pre-filled)
 *
 * Step 2 - Quick Actions on Alert Cards
 */

import { useWatchlistStore } from '@/stores/watchlistStore';

interface QuickActionsProps {
  chainId: number;
  address: string;
  symbol?: string;
  /** Compact mode - show icons only */
  compact?: boolean;
  /** Show swap action */
  showSwap?: boolean;
  /** Called when swap is clicked */
  onSwapClick?: () => void;
  /** Custom className */
  className?: string;
}

// Chain ID to DexScreener chain slug mapping
const CHAIN_SLUGS: Record<number, string> = {
  1: 'ethereum',
  56: 'bsc',
  8453: 'base',
  42161: 'arbitrum',
  137: 'polygon',
  43114: 'avalanche',
  10: 'optimism',
};

/**
 * Build DexScreener URL for a token
 */
export function getDexScreenerUrl(chainId: number, address: string): string {
  const chainSlug = CHAIN_SLUGS[chainId] || 'ethereum';
  return `https://dexscreener.com/${chainSlug}/${address}`;
}

/**
 * Build block explorer URL for a token
 */
export function getExplorerUrl(chainId: number, address: string): string {
  switch (chainId) {
    case 1:
      return `https://etherscan.io/token/${address}`;
    case 56:
      return `https://bscscan.com/token/${address}`;
    case 8453:
      return `https://basescan.org/token/${address}`;
    case 42161:
      return `https://arbiscan.io/token/${address}`;
    case 137:
      return `https://polygonscan.com/token/${address}`;
    case 43114:
      return `https://snowtrace.io/token/${address}`;
    case 10:
      return `https://optimistic.etherscan.io/token/${address}`;
    default:
      return `https://etherscan.io/token/${address}`;
  }
}

export function QuickActions({
  chainId,
  address,
  symbol,
  compact = false,
  showSwap = true,
  onSwapClick,
  className = '',
}: QuickActionsProps) {
  const { addToken, removeToken, hasToken } = useWatchlistStore();
  const isWatching = hasToken(chainId, address);

  const handleToggleWatch = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isWatching) {
      removeToken(chainId, address);
    } else {
      addToken({
        chainId,
        address,
        symbol,
      });
    }
  };

  const handleOpenDexScreener = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(getDexScreenerUrl(chainId, address), '_blank', 'noopener,noreferrer');
  };

  const handleOpenExplorer = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(getExplorerUrl(chainId, address), '_blank', 'noopener,noreferrer');
  };

  const handleSwapClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSwapClick?.();
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        {/* DexScreener */}
        <button
          onClick={handleOpenDexScreener}
          className="p-1 rounded hover:bg-dark-600 transition-colors text-dark-400 hover:text-dark-200"
          title="View on DexScreener"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
            <path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z" />
            <path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z" />
          </svg>
        </button>

        {/* Watchlist Toggle */}
        <button
          onClick={handleToggleWatch}
          className={`p-1 rounded transition-colors ${
            isWatching
              ? 'text-yellow-400 hover:text-yellow-300'
              : 'text-dark-400 hover:text-dark-200 hover:bg-dark-600'
          }`}
          title={isWatching ? 'Remove from watchlist' : 'Add to watchlist'}
        >
          {isWatching ? '★' : '☆'}
        </button>

        {/* Swap */}
        {showSwap && onSwapClick && (
          <button
            onClick={handleSwapClick}
            className="p-1 rounded hover:bg-dark-600 transition-colors text-dark-400 hover:text-dark-200"
            title="Swap this token"
          >
            ⇄
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      {/* DexScreener */}
      <button
        onClick={handleOpenDexScreener}
        className="flex items-center gap-1 px-2 py-1 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-dark-100 rounded text-[10px] transition-colors"
      >
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
          <path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z" />
          <path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z" />
        </svg>
        DexScreener
      </button>

      {/* Explorer */}
      <button
        onClick={handleOpenExplorer}
        className="flex items-center gap-1 px-2 py-1 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-dark-100 rounded text-[10px] transition-colors"
      >
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
          <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm7.5-6.923c-.67.204-1.335.82-1.887 1.855A7.97 7.97 0 0 0 5.145 4H7.5V1.077zM4.09 4a9.267 9.267 0 0 1 .64-1.539 6.7 6.7 0 0 1 .597-.933A7.025 7.025 0 0 0 2.255 4H4.09zm-.582 3.5c.03-.877.138-1.718.312-2.5H1.674a6.958 6.958 0 0 0-.656 2.5h2.49zM4.847 5a12.5 12.5 0 0 0-.338 2.5H7.5V5H4.847zM8.5 5v2.5h2.99a12.495 12.495 0 0 0-.337-2.5H8.5zM4.51 8.5a12.5 12.5 0 0 0 .337 2.5H7.5V8.5H4.51zm3.99 0V11h2.653c.187-.765.306-1.608.338-2.5H8.5zM5.145 12c.138.386.295.744.468 1.068.552 1.035 1.218 1.65 1.887 1.855V12H5.145zm.182 2.472a6.696 6.696 0 0 1-.597-.933A9.268 9.268 0 0 1 4.09 12H2.255a7.024 7.024 0 0 0 3.072 2.472zM3.82 11a13.652 13.652 0 0 1-.312-2.5h-2.49c.062.89.291 1.733.656 2.5H3.82zm6.853 3.472A7.024 7.024 0 0 0 13.745 12H11.91a9.27 9.27 0 0 1-.64 1.539 6.688 6.688 0 0 1-.597.933zM8.5 12v2.923c.67-.204 1.335-.82 1.887-1.855.173-.324.33-.682.468-1.068H8.5zm3.68-1h2.146c.365-.767.594-1.61.656-2.5h-2.49a13.65 13.65 0 0 1-.312 2.5zm2.802-3.5a6.959 6.959 0 0 0-.656-2.5H12.18c.174.782.282 1.623.312 2.5h2.49zM11.27 2.461c.247.464.462.98.64 1.539h1.835a7.024 7.024 0 0 0-3.072-2.472c.218.284.418.598.597.933zM10.855 4a7.966 7.966 0 0 0-.468-1.068C9.835 1.897 9.17 1.282 8.5 1.077V4h2.355z" />
        </svg>
        Explorer
      </button>

      {/* Watchlist Toggle */}
      <button
        onClick={handleToggleWatch}
        className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${
          isWatching
            ? 'bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50'
            : 'bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-dark-100'
        }`}
      >
        {isWatching ? '★ Watching' : '☆ Watch'}
      </button>

      {/* Swap */}
      {showSwap && onSwapClick && (
        <button
          onClick={handleSwapClick}
          className="flex items-center gap-1 px-2 py-1 bg-primary-900/30 hover:bg-primary-900/50 text-primary-400 rounded text-[10px] transition-colors"
        >
          ⇄ Swap out
        </button>
      )}
    </div>
  );
}

export default QuickActions;
