import type { AssetInfo } from '@/types/api';
import {
  getTrendingPairs,
  routeIntelToAssets,
  type TradingRouteIntel,
} from '@/constants/tradingIntelligence';
import { SwapTokenAvatar } from '@/components/common/SwapTokenAvatar';
import { ShellPanel } from '@/components/ui/ShellPrimitives';
import { RouteIntelBadgePill } from './RouteIntelBadge';
import { getTokenBySymbol } from '@/tokens';

interface Props {
  activeChainId: number;
  onSelectPair: (from: AssetInfo, to: AssetInfo) => void;
}

function TrendingPairTile({
  intel,
  onSelect,
}: {
  intel: TradingRouteIntel;
  onSelect: () => void;
}) {
  const fromLogo = getTokenBySymbol(intel.route.fromSymbol, intel.route.chainId)?.logoURI;
  const toLogo = getTokenBySymbol(intel.route.toSymbol, intel.route.chainId)?.logoURI;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="snap-start shrink-0 w-[11.5rem] lg:w-auto text-left rounded-xl border border-white/[0.08] bg-electro-panel/60 hover:bg-electro-panel/80 hover:border-white/[0.12] p-3 transition-all duration-200"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <RouteIntelBadgePill badge={intel.badge} />
        <span className="text-[9px] text-dark-500 truncate">{intel.route.chainLabel}</span>
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center -space-x-1.5">
          <SwapTokenAvatar symbol={intel.route.fromSymbol} logoUrl={fromLogo} size="sm" />
          <SwapTokenAvatar symbol={intel.route.toSymbol} logoUrl={toLogo} size="sm" />
        </div>
        <span className="text-sm font-semibold text-white truncate">{intel.pairLabel}</span>
      </div>
    </button>
  );
}

export function TrendingPairsCard({ activeChainId, onSelectPair }: Props) {
  const pairs = getTrendingPairs(activeChainId);

  if (pairs.length === 0) return null;

  return (
    <ShellPanel className="p-3 sm:p-4">
      <h3 className="text-sm font-semibold text-white mb-0.5">Trending Pairs</h3>
      <p className="text-[10px] text-dark-500 mb-3">Audited commission routes · tap to pre-fill</p>
      <div className="flex lg:grid lg:grid-cols-2 gap-2 overflow-x-auto pb-0.5 lg:overflow-visible snap-x snap-mandatory scrollbar-thin">
        {pairs.map((intel) => (
          <TrendingPairTile
            key={`${intel.route.chainId}-${intel.pairLabel}`}
            intel={intel}
            onSelect={() => {
              const assets = routeIntelToAssets(intel);
              if (assets) onSelectPair(assets.from, assets.to);
            }}
          />
        ))}
      </div>
    </ShellPanel>
  );
}
