/**
 * Risk Score Breakdown Component
 *
 * Explains the risk score by showing contributing factors.
 * Helps users understand "Why is this score 72/100?"
 *
 * Step 3 - Risk Score Breakdown
 */

import { useDebugMode } from '@/stores/debugStore';

interface SimpleImpact {
  score: number;
  level: 'high' | 'medium' | 'low' | string;
  reason?: string;
}

interface RiskScoreBreakdownProps {
  /** Impact score data */
  impact: SimpleImpact;
  /** Risk factors from signal */
  riskFactors?: string[];
  /** Liquidity drop percentage */
  liquidityDropPct?: number;
  /** Signal type */
  type: 'risk' | 'liquidity';
  /** Custom className */
  className?: string;
}

// Risk factor display names and weights
const RISK_FACTOR_INFO: Record<string, { label: string; weight: number; icon: string }> = {
  // High severity factors
  is_honeypot: { label: 'Honeypot detected', weight: 40, icon: '🍯' },
  cannot_sell: { label: 'Cannot sell', weight: 35, icon: '🚫' },
  cannot_sell_all: { label: 'Cannot sell all', weight: 30, icon: '⚠️' },
  owner_change_balance: { label: 'Owner can change balances', weight: 30, icon: '🔄' },
  hidden_owner: { label: 'Hidden owner', weight: 25, icon: '👤' },
  external_call: { label: 'External calls', weight: 20, icon: '📞' },
  selfdestruct: { label: 'Can self-destruct', weight: 25, icon: '💥' },

  // Medium severity factors
  is_proxy: { label: 'Proxy contract', weight: 15, icon: '🔗' },
  is_mintable: { label: 'Can mint new tokens', weight: 15, icon: '🖨️' },
  can_take_back_ownership: { label: 'Can reclaim ownership', weight: 20, icon: '👑' },
  is_blacklisted: { label: 'Blacklist function', weight: 15, icon: '📋' },
  is_whitelisted: { label: 'Whitelist function', weight: 10, icon: '📝' },
  trading_cooldown: { label: 'Trading cooldown', weight: 10, icon: '⏱️' },
  transfer_pausable: { label: 'Pausable transfers', weight: 15, icon: '⏸️' },

  // Low severity factors
  is_anti_whale: { label: 'Anti-whale mechanism', weight: 5, icon: '🐋' },
  anti_whale_modifiable: { label: 'Anti-whale modifiable', weight: 8, icon: '🔧' },
  personal_slippage_modifiable: { label: 'Slippage modifiable', weight: 8, icon: '📊' },
  slippage_modifiable: { label: 'Tax modifiable', weight: 10, icon: '📈' },
  is_open_source: { label: 'Not open source', weight: 5, icon: '🔒' },

  // Tax related
  buy_tax: { label: 'High buy tax', weight: 10, icon: '💰' },
  sell_tax: { label: 'High sell tax', weight: 15, icon: '💸' },

  // Fallback
  unknown: { label: 'Unknown risk', weight: 10, icon: '❓' },
};

// Liquidity severity thresholds
const LIQUIDITY_THRESHOLDS = [
  { min: 80, label: 'Severe drop', weight: 40, icon: '🔴' },
  { min: 50, label: 'Major drop', weight: 30, icon: '🟠' },
  { min: 30, label: 'Significant drop', weight: 20, icon: '🟡' },
  { min: 15, label: 'Moderate drop', weight: 10, icon: '🔵' },
  { min: 0, label: 'Minor drop', weight: 5, icon: '⚪' },
];

/**
 * Get factor info with fallback
 */
function getFactorInfo(factor: string): { label: string; weight: number; icon: string } {
  // Normalize the factor key
  const normalizedKey = factor.toLowerCase().replace(/ /g, '_');
  return RISK_FACTOR_INFO[normalizedKey] || {
    label: factor.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()),
    weight: 10,
    icon: '❓'
  };
}

/**
 * Get liquidity drop info
 */
function getLiquidityInfo(dropPct: number): { label: string; weight: number; icon: string } {
  for (const threshold of LIQUIDITY_THRESHOLDS) {
    if (dropPct >= threshold.min) {
      return threshold;
    }
  }
  return LIQUIDITY_THRESHOLDS[LIQUIDITY_THRESHOLDS.length - 1];
}

/**
 * Get score color based on level
 */
function getScoreColor(level: string): string {
  switch (level) {
    case 'high':
      return 'text-red-400';
    case 'medium':
      return 'text-orange-400';
    case 'low':
    default:
      return 'text-green-400';
  }
}

/**
 * Get score background color
 */
function getScoreBgColor(level: string): string {
  switch (level) {
    case 'high':
      return 'bg-red-900/30';
    case 'medium':
      return 'bg-orange-900/30';
    case 'low':
    default:
      return 'bg-green-900/30';
  }
}

export function RiskScoreBreakdown({
  impact,
  riskFactors,
  liquidityDropPct,
  type,
  className = '',
}: RiskScoreBreakdownProps) {
  const debugEnabled = useDebugMode();
  const scoreColor = getScoreColor(impact.level);
  const scoreBgColor = getScoreBgColor(impact.level);

  // Parse factor count from reason text if available (e.g., "1 risk factors detected")
  const factorCountFromReason = impact.reason
    ? parseInt(impact.reason.match(/(\d+)\s*(?:risk\s*)?factors?/i)?.[1] || '0')
    : 0;

  // Build factors list
  const factors: Array<{ label: string; weight: number; icon: string }> = [];

  if (type === 'risk' && riskFactors && riskFactors.length > 0) {
    riskFactors.forEach((factor) => {
      factors.push(getFactorInfo(factor));
    });
  }

  if (type === 'liquidity' && liquidityDropPct !== undefined) {
    factors.push({
      ...getLiquidityInfo(liquidityDropPct),
      label: `${liquidityDropPct.toFixed(0)}% liquidity drop`,
    });
  }

  // Sort by weight (highest first)
  factors.sort((a, b) => b.weight - a.weight);

  // Determine if we have a count mismatch (reason says factors but none in list)
  const hasFactorCountMismatch = type === 'risk' && factorCountFromReason > 0 && factors.length === 0;

  return (
    <div className={`rounded-lg border border-dark-700 ${className}`}>
      {/* Header */}
      <div className={`px-3 py-2 ${scoreBgColor} rounded-t-lg border-b border-dark-700`}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium text-dark-300 uppercase tracking-wide">
            Impact Breakdown
          </span>
          <div className="flex items-center gap-2">
            <span className={`text-lg font-bold ${scoreColor}`}>
              {impact.score}
            </span>
            <span className="text-[10px] text-dark-500">/100</span>
          </div>
        </div>
        {/* Visual score bar */}
        <div className="mt-2 h-1.5 bg-dark-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              impact.level === 'high'
                ? 'bg-red-500'
                : impact.level === 'medium'
                ? 'bg-orange-500'
                : 'bg-green-500'
            }`}
            style={{ width: `${impact.score}%` }}
          />
        </div>
      </div>

      {/* Factors List */}
      <div className="px-3 py-2 space-y-1.5">
        {factors.length === 0 ? (
          hasFactorCountMismatch ? (
            /* Count mismatch: reason says factors exist but we don't have details */
            <div className="text-center py-2">
              <p className="text-[10px] text-dark-400">
                ❓ {factorCountFromReason} factor{factorCountFromReason !== 1 ? 's' : ''} detected (details unavailable)
              </p>
              {debugEnabled && riskFactors && (
                <p className="text-[9px] text-dark-600 mt-1 font-mono">
                  raw: {JSON.stringify(riskFactors)}
                </p>
              )}
            </div>
          ) : (
            /* No factors at all */
            <p className="text-[10px] text-dark-500 text-center py-2">
              No risk factors detected
            </p>
          )
        ) : (
          factors.slice(0, 5).map((factor, index) => (
            <div
              key={index}
              className="flex items-center justify-between text-[11px]"
            >
              <div className="flex items-center gap-1.5">
                <span>{factor.icon}</span>
                <span className="text-dark-300">{factor.label}</span>
              </div>
              <span className={`font-mono ${
                factor.weight >= 25
                  ? 'text-red-400'
                  : factor.weight >= 15
                  ? 'text-orange-400'
                  : 'text-dark-500'
              }`}>
                +{factor.weight}
              </span>
            </div>
          ))
        )}

        {factors.length > 5 && (
          <div className="text-[10px] text-dark-500 text-center pt-1">
            +{factors.length - 5} more factors
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="px-3 py-2 border-t border-dark-700/50 bg-dark-800/30 rounded-b-lg">
        <p className="text-[10px] text-dark-500">
          {impact.level === 'high' ? (
            <>
              <span className="text-red-400 font-medium">High impact:</span>{' '}
              Immediate attention recommended
            </>
          ) : impact.level === 'medium' ? (
            <>
              <span className="text-orange-400 font-medium">Medium impact:</span>{' '}
              Monitor closely
            </>
          ) : (
            <>
              <span className="text-green-400 font-medium">Low impact:</span>{' '}
              Informational only
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * Compact inline score display
 */
interface ScoreBadgeProps {
  score: number;
  level: string;
  showLabel?: boolean;
  className?: string;
}

export function ScoreBadge({ score, level, showLabel = false, className = '' }: ScoreBadgeProps) {
  const color = getScoreColor(level);
  const bgColor = getScoreBgColor(level);

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${bgColor} ${className}`}>
      <span className={`font-mono font-medium ${color}`}>{score}</span>
      {showLabel && (
        <span className="text-dark-400 text-[10px]">/ 100</span>
      )}
    </span>
  );
}

export default RiskScoreBreakdown;
