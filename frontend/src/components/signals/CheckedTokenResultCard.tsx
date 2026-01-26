/**
 * Checked Token Result Card Component
 *
 * Displays token check results with risk breakdown and watch actions.
 * Extracted from TokenCheckInput for cleaner, reusable display.
 *
 * Phase 2 - Token Check Result Card
 * Phase 4 - Stablecoin guard explanation
 */

import { useState } from 'react';
import { TokenDisplay } from '@/components/common/TokenDisplay';
import { QuickActions } from '@/components/signals/QuickActions';
import { RiskScoreBreakdown } from '@/components/signals/RiskScoreBreakdown';
import { type TokenMeta } from '@/stores/tokenMetaStore';
import { isStablecoin } from '@/utils/stablecoin';

interface TokenCheckResult {
  hasSignals: boolean;
  liquidity?: {
    severity: string;
    confidence: number;
    dropPct: number;
    impact: { score: number; level: string };
    recurrence: { occurrences24h: number; trend: string; isRepeat: boolean };
  };
  risk?: {
    severity: string;
    confidence: number;
    riskFactors: string[];
    impact: { score: number; level: string };
    recurrence: { occurrences24h: number; trend: string; isRepeat: boolean };
  };
}

interface CheckedTokenResultCardProps {
  chainId: number;
  address: string;
  result: TokenCheckResult;
  tokenMeta: TokenMeta | null;
  isWatching: boolean;
  onToggleWatch: () => void;
  className?: string;
}

/** Get trend icon for recurrence display */
function getTrendIcon(trend: string) {
  switch (trend) {
    case 'increasing': return '⬆';
    case 'decreasing': return '⬇';
    case 'stable': return '➖';
    default: return '🆕';
  }
}

/** Get overall risk level for the card header */
function getOverallRisk(result: TokenCheckResult): {
  level: 'safe' | 'warning' | 'danger';
  label: string;
  className: string;
} {
  // Check for high-impact signals
  const riskLevel = result.risk?.impact?.level;
  const liqLevel = result.liquidity?.impact?.level;

  if (riskLevel === 'high' || liqLevel === 'high') {
    return {
      level: 'danger',
      label: 'High Risk',
      className: 'bg-red-900/20 border-red-700/30 text-red-400',
    };
  }

  if (riskLevel === 'medium' || liqLevel === 'medium') {
    return {
      level: 'warning',
      label: 'Caution',
      className: 'bg-yellow-900/20 border-yellow-700/30 text-yellow-400',
    };
  }

  if (!result.hasSignals) {
    return {
      level: 'safe',
      label: 'No Issues',
      className: 'bg-green-900/20 border-green-700/30 text-green-400',
    };
  }

  return {
    level: 'warning',
    label: 'Low Risk',
    className: 'bg-dark-700/50 border-dark-600/30 text-dark-300',
  };
}

export function CheckedTokenResultCard({
  chainId,
  address,
  result,
  tokenMeta,
  isWatching,
  onToggleWatch,
  className = '',
}: CheckedTokenResultCardProps) {
  const overallRisk = getOverallRisk(result);
  const [showStablecoinInfo, setShowStablecoinInfo] = useState(false);

  // Check if this is a stablecoin
  const tokenIsStablecoin = isStablecoin(tokenMeta?.symbol, tokenMeta?.name);

  return (
    <div className={`rounded-xl border overflow-hidden ${overallRisk.className} ${className}`}>
      {/* Header: Token + Risk Badge + Watch Button */}
      <div className="px-4 py-3 bg-dark-800/50 border-b border-dark-700/30">
        <div className="flex items-center justify-between gap-3">
          {/* Token Info */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <TokenDisplay
              chainId={chainId}
              address={address}
              symbol={tokenMeta?.symbol}
              showPrice
              showChain
              showCopy
              compact
            />
          </div>

          {/* Risk Level Badge */}
          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide flex-shrink-0 ${
            overallRisk.level === 'safe' ? 'bg-green-600 text-white' :
            overallRisk.level === 'danger' ? 'bg-red-600 text-white' :
            'bg-yellow-600 text-white'
          }`}>
            {overallRisk.label}
          </span>

          {/* Watch/Unwatch Button */}
          <button
            onClick={onToggleWatch}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
              isWatching
                ? 'bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50'
                : 'bg-primary-600 text-white hover:bg-primary-500'
            }`}
            title={isWatching ? 'Remove from watchlist' : 'Add to watchlist for monitoring'}
          >
            {isWatching ? '★ Watching' : '☆ Watch'}
          </button>
        </div>
      </div>

      {/* Body: Signal Details */}
      <div className="px-4 py-3 space-y-4">
        {/* Stablecoin Info Banner */}
        {tokenIsStablecoin && !result.hasSignals && (
          <div className="bg-blue-900/10 border border-blue-800/20 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <span className="text-blue-400 text-sm flex-shrink-0">ℹ️</span>
              <div className="text-[11px] text-blue-300/80">
                <span className="font-medium text-blue-300">This is a stablecoin.</span>
                {' '}Stablecoins are designed to maintain a ~$1.00 price and typically have deep liquidity.
                {' '}
                <button
                  onClick={() => setShowStablecoinInfo(!showStablecoinInfo)}
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  {showStablecoinInfo ? 'Less' : 'Why no alerts?'}
                </button>
                {showStablecoinInfo && (
                  <div className="mt-2 pt-2 border-t border-blue-800/30 text-dark-400">
                    Our risk signals focus on volatile tokens where sudden liquidity drops or contract
                    changes indicate danger. Stablecoins like USDC, USDT, and DAI have different risk
                    profiles (e.g., regulatory, backing reserves) that aren't captured by these checks.
                    For stablecoin safety, check their audit reports and backing disclosures.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* No Signals - Safe State */}
        {!result.hasSignals && !tokenIsStablecoin && (
          <div className="text-green-400 text-sm flex items-center gap-2">
            <span className="text-lg">✓</span>
            <span>No active risk or liquidity signals detected</span>
          </div>
        )}

        {/* Risk Signal */}
        {result.risk && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-orange-400 text-sm">⚠️</span>
              <span className="text-sm font-medium text-orange-400">Risk Signal</span>
              <span className="text-[10px] text-dark-500 bg-dark-700/50 px-1.5 py-0.5 rounded">
                {Math.round(result.risk.confidence * 100)}% confidence
              </span>
            </div>
            <RiskScoreBreakdown
              impact={result.risk.impact}
              type="risk"
              riskFactors={result.risk.riskFactors}
            />
            <div className="text-[10px] text-dark-500">
              {result.risk.recurrence.isRepeat
                ? `↻ ${result.risk.recurrence.occurrences24h}× in 24h ${getTrendIcon(result.risk.recurrence.trend)}`
                : '🆕 First occurrence'}
            </div>
          </div>
        )}

        {/* Liquidity Signal */}
        {result.liquidity && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-blue-400 text-sm">💧</span>
              <span className="text-sm font-medium text-blue-400">Liquidity Signal</span>
              <span className="text-[10px] text-dark-500 bg-dark-700/50 px-1.5 py-0.5 rounded">
                {Math.round(result.liquidity.confidence * 100)}% confidence
              </span>
            </div>
            <RiskScoreBreakdown
              impact={result.liquidity.impact}
              type="liquidity"
              liquidityDropPct={result.liquidity.dropPct}
            />
            <div className="text-[10px] text-dark-500">
              {result.liquidity.recurrence.isRepeat
                ? `↻ ${result.liquidity.recurrence.occurrences24h}× in 24h ${getTrendIcon(result.liquidity.recurrence.trend)}`
                : '🆕 First occurrence'}
            </div>
          </div>
        )}
      </div>

      {/* Footer: Quick Actions */}
      <div className="px-4 py-2.5 bg-dark-800/30 border-t border-dark-700/30">
        <QuickActions
          chainId={chainId}
          address={address}
          symbol={tokenMeta?.symbol}
          showSwap={false}
        />
      </div>
    </div>
  );
}

export default CheckedTokenResultCard;
