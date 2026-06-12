import type { AssetInfo } from '@/types/api';
import {
  getPopularActivityFeed,
  routeIntelToAssets,
} from '@/constants/tradingIntelligence';
import { SwapTokenAvatar } from '@/components/common/SwapTokenAvatar';
import { ShellPanel } from '@/components/ui/ShellPrimitives';
import { RouteIntelBadgePill } from './RouteIntelBadge';
import { getTokenBySymbol } from '@/tokens';

interface Props {
  activeChainId: number;
  onSelectPair: (from: AssetInfo, to: AssetInfo) => void;
}

export function PopularActivityCard({ activeChainId, onSelectPair }: Props) {
  const feed = getPopularActivityFeed(activeChainId);

  if (feed.length === 0) return null;

  return (
    <ShellPanel className="p-3 sm:p-4">
      <div className="flex items-baseline justify-between gap-2 mb-0.5">
        <h3 className="text-sm font-semibold text-white">Popular Activity</h3>
        <span className="text-[9px] text-dark-500 uppercase tracking-wide">Not live trades</span>
      </div>
      <p className="text-[10px] text-dark-500 mb-3">
        Frequently chosen audited routes — not wallet or network telemetry.
      </p>
      <ul className="space-y-1.5">
        {feed.map((intel) => {
          const fromLogo = getTokenBySymbol(intel.route.fromSymbol, intel.route.chainId)?.logoURI;
          const toLogo = getTokenBySymbol(intel.route.toSymbol, intel.route.chainId)?.logoURI;
          return (
            <li key={`${intel.route.chainId}-${intel.pairLabel}`}>
              <button
                type="button"
                onClick={() => {
                  const assets = routeIntelToAssets(intel);
                  if (assets) onSelectPair(assets.from, assets.to);
                }}
                className="w-full flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-electro-panel/40 hover:bg-electro-panel/65 px-2.5 py-2 transition-colors text-left"
              >
                <div className="flex items-center -space-x-1 shrink-0">
                  <SwapTokenAvatar symbol={intel.route.fromSymbol} logoUrl={fromLogo} size="sm" />
                  <SwapTokenAvatar symbol={intel.route.toSymbol} logoUrl={toLogo} size="sm" />
                </div>
                <span className="text-sm font-medium text-white flex-1 min-w-0 truncate">
                  {intel.pairLabel}
                </span>
                <RouteIntelBadgePill badge={intel.badge} />
              </button>
            </li>
          );
        })}
      </ul>
    </ShellPanel>
  );
}
