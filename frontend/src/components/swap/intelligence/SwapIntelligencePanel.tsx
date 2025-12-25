/**
 * Swap Intelligence Panel
 *
 * Combined intelligence display showing all swap metrics.
 * Displayed before swap confirmation.
 */

import { useState } from 'react';
import type { SwapIntelligence } from '@/services/dex/types';
import { SafetyScore } from './SafetyScore';
import { PriceImpactBadge } from './PriceImpactBadge';
import { LiquidityWarning } from './LiquidityWarning';
import { RouteComparison } from './RouteComparison';

interface SwapIntelligencePanelProps {
  intelligence: SwapIntelligence;
  compact?: boolean;
}

export function SwapIntelligencePanel({ intelligence, compact = false }: SwapIntelligencePanelProps) {
  const [expanded, setExpanded] = useState(!compact);

  // Compact mode: show summary badges only
  if (compact && !expanded) {
    return (
      <div className="bg-electro-bgAlt/60 backdrop-blur-sm rounded-glass-sm p-3 border border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Safety Score Badge */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border backdrop-blur-sm ${
                intelligence.safetyScore.level === 'safe'
                  ? 'bg-accent/10 border-accent/20'
                  : intelligence.safetyScore.level === 'moderate'
                  ? 'bg-warning/10 border-warning/20'
                  : intelligence.safetyScore.level === 'risky'
                  ? 'bg-orange-500/10 border-orange-500/20'
                  : 'bg-danger/10 border-danger/20'
              }`}
            >
              <ShieldIcon
                className={`w-3.5 h-3.5 ${
                  intelligence.safetyScore.level === 'safe'
                    ? 'text-green-400'
                    : intelligence.safetyScore.level === 'moderate'
                    ? 'text-yellow-400'
                    : intelligence.safetyScore.level === 'risky'
                    ? 'text-orange-400'
                    : 'text-red-400'
                }`}
              />
              <span
                className={`text-xs font-medium ${
                  intelligence.safetyScore.level === 'safe'
                    ? 'text-green-400'
                    : intelligence.safetyScore.level === 'moderate'
                    ? 'text-yellow-400'
                    : intelligence.safetyScore.level === 'risky'
                    ? 'text-orange-400'
                    : 'text-red-400'
                }`}
              >
                {intelligence.safetyScore.score}
              </span>
            </div>

            <PriceImpactBadge impact={intelligence.priceImpact} compact />
            <LiquidityWarning liquidity={intelligence.liquidity} compact />

            {intelligence.routes.length > 0 && (
              <RouteComparison routes={intelligence.routes} compact />
            )}
          </div>

          <button
            onClick={() => setExpanded(true)}
            className="text-xs text-accent hover:text-accent/80 transition-colors font-medium"
          >
            Details
          </button>
        </div>
      </div>
    );
  }

  // Expanded mode: show full details
  return (
    <div className="bg-electro-bgAlt/60 backdrop-blur-sm rounded-glass-sm border border-white/[0.06] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <BrainIcon className="w-5 h-5 text-cyan" />
          <span className="font-medium text-white">Swap Intelligence</span>
        </div>
        {compact && (
          <button
            onClick={() => setExpanded(false)}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Collapse
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Safety Score */}
        <SafetyScore
          score={intelligence.safetyScore.score}
          level={intelligence.safetyScore.level}
          factors={intelligence.safetyScore.factors}
        />

        {/* Two Column Layout for Impact + Liquidity */}
        <div className="grid grid-cols-2 gap-3">
          <PriceImpactBadge impact={intelligence.priceImpact} />
          <LiquidityWarning liquidity={intelligence.liquidity} />
        </div>

        {/* Route Comparison */}
        {intelligence.routes.length > 0 && (
          <RouteComparison routes={intelligence.routes} />
        )}

        {/* Timestamp */}
        <div className="flex items-center justify-end pt-2 border-t border-white/[0.04]">
          <span className="text-[10px] text-gray-500">
            Updated {new Date(intelligence.timestamp).toLocaleTimeString()}
          </span>
        </div>
      </div>
    </div>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  );
}

function BrainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
      />
    </svg>
  );
}

export default SwapIntelligencePanel;
