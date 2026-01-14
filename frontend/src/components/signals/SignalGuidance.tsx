/**
 * Signal Guidance Component
 *
 * Provides in-context education for signal details.
 * Shows guidance based on signal type, impact level, recurrence, and specific risk factors.
 *
 * Radar Context & Guidance Upgrade - Step 1
 */

import { type SignalRecurrence } from '@/stores/signalHistoryStore';
import {
  getSignalGuidance,
  RECURRENCE_GUIDANCE,
  IMPACT_LEVEL_GUIDANCE,
} from '@/utils/radarGuidanceMap';

interface SignalGuidanceProps {
  type: 'liquidity' | 'risk';
  impactLevel?: 'high' | 'medium' | 'low';
  recurrence?: SignalRecurrence;
  /** Risk factors for detailed guidance */
  riskFactors?: string[];
  /** Liquidity drop percentage */
  liquidityDropPct?: number;
}

export function SignalGuidance({
  type,
  impactLevel = 'low',
  recurrence,
  riskFactors,
  liquidityDropPct,
}: SignalGuidanceProps) {
  // Get comprehensive guidance
  const guidance = getSignalGuidance(
    type,
    impactLevel,
    riskFactors,
    liquidityDropPct,
    recurrence?.isRepeat,
    recurrence?.trend
  );

  return (
    <div className="bg-dark-800/50 border border-dark-700/50 rounded-lg p-3 mt-2">
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
        <div className="space-y-2 mb-3">
          {guidance.details.map(({ factor, guidance: factorGuidance }, index) => (
            <div
              key={index}
              className="flex items-start gap-2 text-[11px] pl-2 border-l-2 border-dark-600"
            >
              <span className="text-dark-500 font-medium capitalize min-w-[80px]">
                {factor.replace(/_/g, ' ')}:
              </span>
              <span className="text-dark-400">{factorGuidance}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recurrence context */}
      {recurrence?.isRepeat && recurrence.trend && (
        <div className="text-[11px] text-dark-500 flex items-start gap-1.5 mb-2">
          <span className="flex-shrink-0">↻</span>
          <span>{RECURRENCE_GUIDANCE[recurrence.trend]}</span>
        </div>
      )}

      {/* Action hint based on impact level */}
      <div className={`text-[11px] pt-2 border-t border-dark-700/50 ${
        impactLevel === 'high'
          ? 'text-red-400/80'
          : impactLevel === 'medium'
          ? 'text-orange-400/80'
          : 'text-dark-500'
      }`}>
        <span className="font-medium">
          {impactLevel === 'high' ? '⚠️' : impactLevel === 'medium' ? '👁️' : 'ℹ️'}
        </span>{' '}
        {IMPACT_LEVEL_GUIDANCE[impactLevel]}
      </div>
    </div>
  );
}

export default SignalGuidance;
