/**
 * Signal Guidance Component
 *
 * Provides in-context education for signal details.
 * Shows guidance based on signal type, impact level, and recurrence.
 */

import { useState } from 'react';
import { type SignalRecurrence } from '@/stores/signalHistoryStore';

interface SignalGuidanceProps {
  type: 'liquidity' | 'risk';
  impactLevel?: 'high' | 'medium' | 'low';
  recurrence?: SignalRecurrence;
}

/**
 * Get guidance text based on signal type and impact level
 */
function getGuidanceText(type: 'liquidity' | 'risk', impactLevel?: 'high' | 'medium' | 'low'): string {
  if (type === 'risk') {
    switch (impactLevel) {
      case 'high':
        return 'Multiple serious contract risks detected. Avoid interaction.';
      case 'medium':
        return 'Contract has permissions that may be abused. Proceed with caution.';
      case 'low':
      default:
        return 'Common contract structure. Usually safe, but centralized control exists.';
    }
  } else {
    // Liquidity
    return 'Liquidity changed significantly. Low liquidity increases price manipulation risk.';
  }
}

/**
 * Get guidance icon based on impact level
 */
function getGuidanceIcon(impactLevel?: 'high' | 'medium' | 'low'): string {
  switch (impactLevel) {
    case 'high':
      return '🔥';
    case 'medium':
      return '⚠';
    case 'low':
    default:
      return 'ℹ';
  }
}

/**
 * Get recurrence explanation text
 */
function getRecurrenceExplanation(recurrence: SignalRecurrence): string | null {
  if (!recurrence.isRepeat) {
    return null;
  }

  switch (recurrence.trend) {
    case 'stable':
      return 'This repeats consistently. No escalation detected.';
    case 'increasing':
      return 'Signals are increasing. Conditions may be worsening.';
    case 'decreasing':
      return 'Signals are decreasing. Conditions may be improving.';
    default:
      return null;
  }
}

export function SignalGuidance({ type, impactLevel, recurrence }: SignalGuidanceProps) {
  const [showWhyFlagged, setShowWhyFlagged] = useState(false);

  const guidanceText = getGuidanceText(type, impactLevel);
  const guidanceIcon = getGuidanceIcon(impactLevel);
  const recurrenceExplanation = recurrence ? getRecurrenceExplanation(recurrence) : null;

  return (
    <div className="space-y-2 mt-2 pt-2 border-t border-dark-700/30">
      {/* Micro-education: Signal interpretation */}
      <div className={`text-[11px] flex items-start gap-1.5 ${
        impactLevel === 'high'
          ? 'text-red-400/90'
          : impactLevel === 'medium'
          ? 'text-orange-400/90'
          : 'text-dark-400'
      }`}>
        <span className="flex-shrink-0">{guidanceIcon}</span>
        <span>{guidanceText}</span>
      </div>

      {/* Recurrence explanation */}
      {recurrenceExplanation && (
        <div className="text-[11px] text-dark-500 flex items-start gap-1.5">
          <span className="flex-shrink-0">↻</span>
          <span>{recurrenceExplanation}</span>
        </div>
      )}

      {/* How to use this information */}
      <div className="bg-dark-800/50 rounded p-2 text-[10px] text-dark-500">
        <div className="font-medium text-dark-400 mb-1">How to use this:</div>
        <ul className="space-y-0.5">
          <li>• Low impact → informational</li>
          <li>• Medium impact → be cautious</li>
          <li>• High impact → avoid interaction</li>
        </ul>
      </div>

      {/* Why did Radar flag this? (collapsible) */}
      <div>
        <button
          onClick={() => setShowWhyFlagged(!showWhyFlagged)}
          className="text-[10px] text-dark-500 hover:text-dark-400 transition-colors flex items-center gap-1"
        >
          <span>{showWhyFlagged ? '▼' : '▶'}</span>
          <span>Why did Radar flag this?</span>
        </button>

        {showWhyFlagged && (
          <div className="mt-1.5 pl-3 text-[10px] text-dark-500 space-y-0.5">
            <div>• Contract permissions and risk factors</div>
            <div>• Liquidity changes from DEX data</div>
            <div>• Repeated patterns over time (recurrence)</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SignalGuidance;
