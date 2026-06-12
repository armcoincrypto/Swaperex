/**
 * Sidebar / below-fold trading intelligence — lazy-loaded, display-only.
 */

import type { AssetInfo } from '@/types/api';
import { isCommissionRequiredMode } from '@/config';
import { TrendingPairsCard } from './TrendingPairsCard';
import { PopularActivityCard } from './PopularActivityCard';

export interface TradingIntelligencePanelProps {
  activeChainId: number;
  onSelectPair: (from: AssetInfo, to: AssetInfo) => void;
  /** `sidebar` stacks vertically; `strip` is compact horizontal-first for mobile below swap */
  layout?: 'sidebar' | 'strip';
}

export function TradingIntelligencePanel({
  activeChainId,
  onSelectPair,
  layout = 'sidebar',
}: TradingIntelligencePanelProps) {
  if (!isCommissionRequiredMode()) return null;
  if (activeChainId !== 1 && activeChainId !== 56) return null;

  if (layout === 'strip') {
    return (
      <div className="w-full max-w-md lg:max-w-xl 2xl:max-w-2xl mx-auto space-y-3">
        <TrendingPairsCard activeChainId={activeChainId} onSelectPair={onSelectPair} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <TrendingPairsCard activeChainId={activeChainId} onSelectPair={onSelectPair} />
      <PopularActivityCard activeChainId={activeChainId} onSelectPair={onSelectPair} />
    </div>
  );
}

export default TradingIntelligencePanel;
