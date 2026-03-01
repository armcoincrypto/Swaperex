/**
 * Radar Guidance Map
 *
 * Maps signal types and risk factors to neutral, educational guidance.
 * Helps users understand what signals mean without giving financial advice.
 *
 * Radar Context & Guidance Upgrade - Step 1
 */

// Risk factor guidance - keyed by normalized factor name
export const RISK_FACTOR_GUIDANCE: Record<string, string> = {
  // Honeypot / Trading issues
  is_honeypot:
    'Honeypot contracts prevent selling. Tokens with this flag may trap funds permanently.',
  cannot_sell:
    'This token may have restrictions that prevent selling. Exercise caution before acquiring more.',
  cannot_sell_all:
    'Selling the full balance may be blocked. Consider the implications for exit liquidity.',

  // Ownership risks
  hidden_owner:
    'The contract owner is obscured. This can make accountability difficult if issues arise.',
  owner_change_balance:
    'The owner can modify balances directly. This introduces counterparty risk.',
  can_take_back_ownership:
    'Ownership can be reclaimed even after renouncement. Watch for unexpected changes.',

  // Contract structure
  is_proxy:
    'Proxy contracts can have their logic changed after deployment. Monitor for contract upgrades.',
  selfdestruct:
    'The contract can self-destruct, potentially making tokens inaccessible.',
  external_call:
    'External calls to other contracts may introduce dependencies or unexpected behavior.',

  // Supply manipulation
  is_mintable:
    'New tokens can be minted, potentially diluting existing holdings over time.',

  // Trading restrictions
  is_blacklisted:
    'A blacklist function exists. Addresses can be blocked from trading.',
  is_whitelisted:
    'A whitelist function exists. Only approved addresses may be able to trade.',
  transfer_pausable:
    'Transfers can be paused by the contract owner. This may affect your ability to exit.',
  trading_cooldown:
    'A cooldown period exists between trades. Large or frequent trades may be delayed.',

  // Anti-whale
  is_anti_whale:
    'Anti-whale mechanisms limit transaction sizes. Large trades may be restricted.',
  anti_whale_modifiable:
    'Anti-whale limits can be changed. Watch for adjustments that affect trading.',

  // Tax/Slippage
  slippage_modifiable:
    'Token taxes can be modified. Unexpected fee changes may affect trade outcomes.',
  personal_slippage_modifiable:
    'Per-address slippage can be set. Some wallets may face different trading conditions.',
  buy_tax:
    'A buy tax is applied to purchases. Factor this into your cost basis.',
  sell_tax:
    'A sell tax is applied to sales. This reduces the amount received when exiting.',

  // Source code
  is_open_source:
    'Contract source code is not verified. Auditing the logic is not possible.',
};

// Signal type guidance
export const SIGNAL_TYPE_GUIDANCE: Record<string, string> = {
  risk:
    'Risk signals indicate potential concerns detected in the token contract. Review the specific factors below.',
  liquidity:
    'Liquidity signals track changes in trading depth. Significant drops may affect your ability to exit positions.',
};

// Impact level guidance
export const IMPACT_LEVEL_GUIDANCE: Record<string, string> = {
  high:
    'High-impact signals suggest significant concern. Consider reviewing your position.',
  medium:
    'Medium-impact signals warrant monitoring. Keep an eye on developments.',
  low:
    'Low-impact signals are informational. No immediate action typically needed.',
};

// Recurrence guidance
export const RECURRENCE_GUIDANCE: Record<string, string> = {
  new:
    'This is the first occurrence of this signal. Monitor for patterns.',
  increasing:
    'Signal frequency or severity is increasing. The situation may be developing.',
  stable:
    'Signal pattern is stable. Conditions remain consistent.',
  decreasing:
    'Signal frequency or severity is decreasing. Conditions may be improving.',
};

// Liquidity drop severity guidance
export function getLiquidityGuidance(dropPct: number): string {
  if (dropPct >= 80) {
    return 'Severe liquidity drop detected. Large sells may cause significant slippage or fail entirely.';
  }
  if (dropPct >= 50) {
    return 'Major liquidity reduction. Trading conditions have deteriorated substantially.';
  }
  if (dropPct >= 30) {
    return 'Significant liquidity decrease. Consider the impact on potential exit prices.';
  }
  if (dropPct >= 15) {
    return 'Moderate liquidity change. Trading depth has reduced but remains functional.';
  }
  return 'Minor liquidity fluctuation. Normal market variation.';
}

/**
 * Get guidance for a specific risk factor
 */
export function getRiskFactorGuidance(factor: string): string | null {
  const normalizedKey = factor.toLowerCase().replace(/ /g, '_');
  return RISK_FACTOR_GUIDANCE[normalizedKey] || null;
}

/**
 * Get the most relevant guidance for a set of risk factors
 * Returns top 2-3 most important guidances
 */
export function getTopRiskGuidances(factors: string[]): Array<{ factor: string; guidance: string }> {
  // Priority order for risk factors (most severe first)
  const PRIORITY_ORDER = [
    'is_honeypot',
    'cannot_sell',
    'cannot_sell_all',
    'owner_change_balance',
    'selfdestruct',
    'hidden_owner',
    'is_proxy',
    'transfer_pausable',
    'is_mintable',
    'can_take_back_ownership',
  ];

  const result: Array<{ factor: string; guidance: string }> = [];

  // First, add factors in priority order
  for (const priorityFactor of PRIORITY_ORDER) {
    if (factors.some((f) => f.toLowerCase().replace(/ /g, '_') === priorityFactor)) {
      const guidance = RISK_FACTOR_GUIDANCE[priorityFactor];
      if (guidance) {
        result.push({ factor: priorityFactor, guidance });
      }
    }
    if (result.length >= 3) break;
  }

  // If we don't have 3 yet, add remaining factors
  if (result.length < 3) {
    for (const factor of factors) {
      const normalizedKey = factor.toLowerCase().replace(/ /g, '_');
      if (!result.some((r) => r.factor === normalizedKey)) {
        const guidance = RISK_FACTOR_GUIDANCE[normalizedKey];
        if (guidance) {
          result.push({ factor: normalizedKey, guidance });
        }
      }
      if (result.length >= 3) break;
    }
  }

  return result;
}

/**
 * Get combined guidance for a signal
 */
export interface SignalGuidanceResult {
  summary: string;
  details: Array<{ factor: string; guidance: string }>;
  actionHint: string;
}

export function getSignalGuidance(
  type: 'risk' | 'liquidity',
  impactLevel: 'high' | 'medium' | 'low',
  riskFactors?: string[],
  liquidityDropPct?: number,
  isRepeat?: boolean,
  trend?: string
): SignalGuidanceResult {
  let summary = SIGNAL_TYPE_GUIDANCE[type];
  let details: Array<{ factor: string; guidance: string }> = [];
  let actionHint = IMPACT_LEVEL_GUIDANCE[impactLevel];

  if (type === 'risk' && riskFactors && riskFactors.length > 0) {
    details = getTopRiskGuidances(riskFactors);
  }

  if (type === 'liquidity' && liquidityDropPct !== undefined) {
    summary = getLiquidityGuidance(liquidityDropPct);
  }

  // Add recurrence context
  if (isRepeat && trend) {
    const recurrenceNote = RECURRENCE_GUIDANCE[trend];
    if (recurrenceNote) {
      actionHint += ` ${recurrenceNote}`;
    }
  }

  return { summary, details, actionHint };
}

export default {
  RISK_FACTOR_GUIDANCE,
  SIGNAL_TYPE_GUIDANCE,
  IMPACT_LEVEL_GUIDANCE,
  RECURRENCE_GUIDANCE,
  getRiskFactorGuidance,
  getTopRiskGuidances,
  getLiquidityGuidance,
  getSignalGuidance,
};
