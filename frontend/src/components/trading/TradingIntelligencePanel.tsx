/**
 * Swap trading intelligence — delegates to Swap Intelligence Center.
 */

import type { AssetInfo } from '@/types/api';
import { SwapIntelligenceCenter } from '@/components/swap/intelligence/SwapIntelligenceCenter';

export interface TradingIntelligencePanelProps {
  activeChainId: number;
  onSelectPair: (from: AssetInfo, to: AssetInfo) => void;
  layout?: 'sidebar' | 'strip';
}

export function TradingIntelligencePanel({
  activeChainId,
  onSelectPair,
  layout = 'sidebar',
}: TradingIntelligencePanelProps) {
  return (
    <SwapIntelligenceCenter
      activeChainId={activeChainId}
      onSelectPair={onSelectPair}
      layout={layout}
    />
  );
}

export default TradingIntelligencePanel;
