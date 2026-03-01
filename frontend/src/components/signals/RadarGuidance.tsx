/**
 * Radar Guidance Component
 *
 * Displays contextual guidance for signals.
 * Helps users understand what signals mean and what to consider.
 *
 * Radar Context & Guidance Upgrade - Step 1
 */

import { getSignalGuidance, type SignalGuidanceResult } from '@/utils/radarGuidanceMap';

interface RadarGuidanceProps {
  type: 'risk' | 'liquidity';
  impactLevel?: 'high' | 'medium' | 'low';
  riskFactors?: string[];
  liquidityDropPct?: number;
  isRepeat?: boolean;
  trend?: string;
  className?: string;
}

export function RadarGuidance({
  type,
  impactLevel = 'low',
  riskFactors,
  liquidityDropPct,
  isRepeat,
  trend,
  className = '',
}: RadarGuidanceProps) {
  const guidance: SignalGuidanceResult = getSignalGuidance(
    type,
    impactLevel,
    riskFactors,
    liquidityDropPct,
    isRepeat,
    trend
  );

  return (
    <div className={`bg-dark-800/50 border border-dark-700/50 rounded-lg p-3 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">🧭</span>
        <span className="text-[11px] font-medium text-dark-300 uppercase tracking-wide">
          Radar Guidance
        </span>
      </div>

      {/* Summary */}
      <p className="text-xs text-dark-400 leading-relaxed mb-2">
        {guidance.summary}
      </p>

      {/* Specific factor guidance (for risk signals) */}
      {guidance.details.length > 0 && (
        <div className="space-y-2 mb-2">
          {guidance.details.map(({ factor, guidance: factorGuidance }, index) => (
            <div
              key={index}
              className="flex items-start gap-2 text-[11px] pl-2 border-l-2 border-dark-600"
            >
              <span className="text-dark-500 font-medium capitalize">
                {factor.replace(/_/g, ' ')}:
              </span>
              <span className="text-dark-400">{factorGuidance}</span>
            </div>
          ))}
        </div>
      )}

      {/* Action hint */}
      <div className={`text-[11px] pt-2 border-t border-dark-700/50 ${
        impactLevel === 'high'
          ? 'text-red-400/80'
          : impactLevel === 'medium'
          ? 'text-orange-400/80'
          : 'text-dark-500'
      }`}>
        {guidance.actionHint}
      </div>
    </div>
  );
}

/**
 * Compact inline guidance for tooltips
 */
interface GuidanceTooltipProps {
  type: 'risk' | 'liquidity';
  riskFactors?: string[];
  liquidityDropPct?: number;
}

export function GuidanceTooltip({ type, riskFactors, liquidityDropPct }: GuidanceTooltipProps) {
  const guidance = getSignalGuidance(type, 'medium', riskFactors, liquidityDropPct);

  return (
    <div className="max-w-xs p-2 text-[11px] text-dark-300">
      <p>{guidance.summary}</p>
      {guidance.details.length > 0 && (
        <p className="mt-1 text-dark-500">
          Key factor: {guidance.details[0].factor.replace(/_/g, ' ')}
        </p>
      )}
    </div>
  );
}

export default RadarGuidance;
