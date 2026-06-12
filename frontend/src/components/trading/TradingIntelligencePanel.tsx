/**
 * Swap trading intelligence slot — unified route discovery rail.
 */

import type { AssetInfo } from '@/types/api';
import { RouteDiscoveryRail } from './RouteDiscoveryRail';

export interface TradingIntelligencePanelProps {
  activeChainId: number;
  onSelectPair: (from: AssetInfo, to: AssetInfo) => void;
  /** `sidebar` stacks in the aside; `strip` sits below the swap card when disconnected. */
  layout?: 'sidebar' | 'strip';
  fromAsset?: AssetInfo | null;
  toAsset?: AssetInfo | null;
}

export function TradingIntelligencePanel({
  activeChainId,
  onSelectPair,
  layout = 'sidebar',
  fromAsset,
  toAsset,
}: TradingIntelligencePanelProps) {
  return (
    <RouteDiscoveryRail
      activeChainId={activeChainId}
      onSelectPair={onSelectPair}
      layout={layout}
      fromAsset={fromAsset}
      toAsset={toAsset}
    />
  );
}

export default TradingIntelligencePanel;
