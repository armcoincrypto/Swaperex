/**
 * Swap Intelligence Center — premium sidebar / strip for route discovery,
 * token safety, trade prep, and market context. Presentation-only.
 */

import type { AssetInfo } from '@/types/api';
import { useWallet } from '@/hooks/useWallet';
import { useSwapStore } from '@/stores/swapStore';
import { RouteDiscoveryRail } from '@/components/trading/RouteDiscoveryRail';
import { TokenSafetyPanel } from './TokenSafetyPanel';
import { TradePreparationPanel } from './TradePreparationPanel';
import { MarketContextPanel } from './MarketContextPanel';

export interface SwapIntelligenceCenterProps {
  activeChainId: number;
  onSelectPair: (from: AssetInfo, to: AssetInfo) => void;
  layout?: 'sidebar' | 'strip';
}

function CenterHeader() {
  return (
    <div className="px-0.5 pb-1">
      <p className="text-[10px] uppercase tracking-wider text-dark-500">Swap Intelligence</p>
      <p className="text-sm font-semibold text-white">Trading workspace</p>
    </div>
  );
}

export function SwapIntelligenceCenter({
  activeChainId,
  onSelectPair,
  layout = 'sidebar',
}: SwapIntelligenceCenterProps) {
  const { isConnected, isWrongChain, chainId } = useWallet();
  const fromAsset = useSwapStore((s) => s.fromAsset);
  const toAsset = useSwapStore((s) => s.toAsset);
  const slippage = useSwapStore((s) => s.slippage);
  const quote = useSwapStore((s) => s.quote);
  const isQuoting = useSwapStore((s) => s.isQuoting);

  const hasActiveQuote = !!(quote?.success && quote.to_amount);

  const sections = (
    <div className="space-y-3">
      <CenterHeader />
      <RouteDiscoveryRail
        activeChainId={activeChainId}
        onSelectPair={onSelectPair}
        layout="sidebar"
        fromAsset={fromAsset}
        toAsset={toAsset}
        variant="premium"
      />
      {isConnected && (
        <>
          <TokenSafetyPanel token={toAsset} chainId={activeChainId} />
          <TradePreparationPanel
            isConnected={isConnected}
            isWrongChain={isWrongChain}
            walletChainId={chainId}
            activeChainId={activeChainId}
            fromAsset={fromAsset}
            toAsset={toAsset}
            slippage={slippage}
            hasActiveQuote={hasActiveQuote}
            isQuoting={isQuoting}
          />
        </>
      )}
      <MarketContextPanel activeChainId={activeChainId} />
    </div>
  );

  if (layout === 'strip') {
    return (
      <div className="w-full max-w-md lg:max-w-xl 2xl:max-w-2xl mx-auto">{sections}</div>
    );
  }

  return sections;
}

export default SwapIntelligenceCenter;
