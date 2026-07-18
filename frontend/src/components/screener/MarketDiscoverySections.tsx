/**
 * P4.1 — Market Discovery section cards derived from screener token data.
 * No invented metrics; slices use existing CoinGecko fields only.
 */

import type { ScreenerToken, ScreenerChainId } from '@/services/screener/types';
import { CHAIN_LABELS } from '@/services/screener/types';
import { SwapTokenAvatar } from '@/components/common/SwapTokenAvatar';
import { ShellPanel } from '@/components/ui/ShellPrimitives';
import { isExecutableSwapCta } from '@/utils/swapAvailability';

interface Props {
  tokens: ScreenerToken[];
  onSelect: (token: ScreenerToken) => void;
  className?: string;
}

const CHAIN_PILL: Record<ScreenerChainId, string> = {
  1: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  56: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/25',
  137: 'bg-purple-500/15 text-purple-300 border-purple-500/25',
  42161: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
};

interface SectionDef {
  id: string;
  title: string;
  caption: string;
  pick: (tokens: ScreenerToken[]) => ScreenerToken[];
}

const SECTIONS: SectionDef[] = [
  {
    id: 'trending',
    title: 'Trending',
    caption: 'By composite trending score',
    pick: (tokens) =>
      [...tokens]
        .filter((t) => (t.trendingScore ?? 0) > 0)
        .sort((a, b) => (b.trendingScore ?? 0) - (a.trendingScore ?? 0))
        .slice(0, 5),
  },
  {
    id: 'volume',
    title: 'Volume Leaders',
    caption: 'Highest 24h volume',
    pick: (tokens) => [...tokens].sort((a, b) => b.volume24h - a.volume24h).slice(0, 5),
  },
  {
    id: 'liquidity',
    title: 'Largest by Market Cap',
    caption: 'Ranked by reported market capitalization',
    pick: (tokens) => [...tokens].sort((a, b) => b.marketCap - a.marketCap).slice(0, 5),
  },
  {
    id: 'movers',
    title: 'Top Gainers',
    caption: 'Highest 24h price change',
    pick: (tokens) =>
      [...tokens]
        .filter((t) => t.priceChange24h > 0)
        .sort((a, b) => b.priceChange24h - a.priceChange24h)
        .slice(0, 5),
  },
  {
    id: 'risk',
    title: 'Risk Watch',
    caption: '24h drawdown ≥ 15%',
    pick: (tokens) =>
      [...tokens]
        .filter((t) => t.priceChange24h <= -15)
        .sort((a, b) => a.priceChange24h - b.priceChange24h)
        .slice(0, 5),
  },
];

export function MarketDiscoverySections({ tokens, onSelect, className = '' }: Props) {
  if (tokens.length === 0) return null;

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5 ${className}`}>
      {SECTIONS.map((section) => {
        const rows = section.pick(tokens);
        return (
          <ShellPanel key={section.id} className="p-3 sm:p-4 flex flex-col min-h-[180px]">
            <div className="mb-2">
              <p className="text-[10px] uppercase tracking-wider text-dark-500">{section.title}</p>
              <p className="text-[10px] text-dark-600 mt-0.5">{section.caption}</p>
            </div>
            {rows.length === 0 ? (
              <p className="text-xs text-dark-500 flex-1 flex items-center">No matches on this chain.</p>
            ) : (
              <ul className="space-y-1.5 flex-1">
                {rows.map((token) => {
                  const executable = isExecutableSwapCta({
                    chainId: token.chainId,
                    token: {
                      symbol: token.symbol,
                      address: token.contractAddress || undefined,
                      is_native: !token.contractAddress,
                    },
                  });
                  return (
                  <li key={token.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!executable) return;
                        onSelect(token);
                      }}
                      disabled={!executable}
                      className={`w-full flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 transition-colors text-left group ${
                        executable
                          ? 'hover:border-white/[0.08] hover:bg-black/20'
                          : 'opacity-60 cursor-default'
                      }`}
                      title={executable ? 'Open certified swap route' : 'View only — no certified swap route'}
                    >
                      <SwapTokenAvatar
                        symbol={token.symbol}
                        logoUrl={token.image}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-white truncate">
                            {token.symbol}
                          </span>
                          <span
                            className={`text-[9px] rounded-full border px-1.5 py-0.5 shrink-0 ${CHAIN_PILL[token.chainId]}`}
                          >
                            {CHAIN_LABELS[token.chainId]}
                          </span>
                          {!executable && (
                            <span className="text-[9px] text-dark-500 shrink-0">View only</span>
                          )}
                        </div>
                        <p className="text-[10px] text-dark-500 truncate">{token.name}</p>
                      </div>
                      <span
                        className={`text-[10px] tabular-nums shrink-0 ${
                          section.id === 'risk'
                            ? 'text-red-400'
                            : section.id === 'movers'
                              ? 'text-green-400'
                              : 'text-dark-400'
                        }`}
                      >
                        {section.id === 'trending' && token.trendingScore != null
                          ? `${Math.round(token.trendingScore)}`
                          : section.id === 'volume'
                            ? formatCompact(token.volume24h)
                            : section.id === 'liquidity'
                              ? formatCompact(token.marketCap)
                              : section.id === 'movers' || section.id === 'risk'
                                ? `${token.priceChange24h > 0 ? '+' : ''}${token.priceChange24h.toFixed(1)}%`
                                : formatPrice(token.currentPrice)}
                      </span>
                    </button>
                  </li>
                  );
                })}
              </ul>
            )}
          </ShellPanel>
        );
      })}
    </div>
  );
}

function formatCompact(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function formatPrice(price: number): string {
  if (price < 0.01) return `$${price.toFixed(4)}`;
  if (price < 1000) return `$${price.toFixed(2)}`;
  return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default MarketDiscoverySections;
