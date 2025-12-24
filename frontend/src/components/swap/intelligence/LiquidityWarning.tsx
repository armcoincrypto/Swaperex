/**
 * Liquidity Warning Component
 *
 * Shows liquidity depth indicator with warnings for thin liquidity.
 */

import type { LiquidityAnalysis } from '@/services/dex/types';

interface LiquidityWarningProps {
  liquidity: LiquidityAnalysis;
  compact?: boolean;
}

export function LiquidityWarning({ liquidity, compact = false }: LiquidityWarningProps) {
  const getLevel = () => {
    if (liquidity.totalUSD >= 500000) return 'high';
    if (liquidity.totalUSD >= 100000) return 'medium';
    if (liquidity.totalUSD >= 50000) return 'low';
    return 'critical';
  };

  const level = getLevel();

  const getBgColor = () => {
    switch (level) {
      case 'high':
        return 'bg-green-900/20 border-green-800';
      case 'medium':
        return 'bg-blue-900/20 border-blue-800';
      case 'low':
        return 'bg-yellow-900/20 border-yellow-800';
      case 'critical':
        return 'bg-red-900/20 border-red-800';
    }
  };

  const getTextColor = () => {
    switch (level) {
      case 'high':
        return 'text-green-400';
      case 'medium':
        return 'text-blue-400';
      case 'low':
        return 'text-yellow-400';
      case 'critical':
        return 'text-red-400';
    }
  };

  const formatLiquidity = (value: number): string => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  const getBarWidth = () => {
    // Scale: 0 = 0%, 1M+ = 100%
    const maxLiquidity = 1000000;
    const percentage = Math.min((liquidity.totalUSD / maxLiquidity) * 100, 100);
    return `${Math.max(percentage, 5)}%`; // Min 5% for visibility
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border ${getBgColor()}`}>
        <DropletIcon className={`w-3 h-3 ${getTextColor()}`} />
        <span className={`text-xs font-medium ${getTextColor()}`}>
          {formatLiquidity(liquidity.totalUSD)}
        </span>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-3 ${getBgColor()}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <DropletIcon className={`w-5 h-5 ${getTextColor()}`} />
          <span className="text-sm font-medium">Liquidity Depth</span>
        </div>
        <span className={`text-lg font-bold ${getTextColor()}`}>
          {formatLiquidity(liquidity.totalUSD)}
        </span>
      </div>

      {/* Liquidity Bar */}
      <div className="h-2 bg-dark-700 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full transition-all duration-500 ${
            level === 'high'
              ? 'bg-green-500'
              : level === 'medium'
              ? 'bg-blue-500'
              : level === 'low'
              ? 'bg-yellow-500'
              : 'bg-red-500'
          }`}
          style={{ width: getBarWidth() }}
        />
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className={getTextColor()}>
          {level === 'high' && 'Deep liquidity'}
          {level === 'medium' && 'Moderate liquidity'}
          {level === 'low' && 'Limited liquidity'}
          {level === 'critical' && 'Very thin liquidity'}
        </span>
        <span className="text-dark-500">Target: $500K+</span>
      </div>

      {liquidity.warning && (
        <div className="mt-2 pt-2 border-t border-dark-700">
          <div className="flex items-start gap-2 text-xs text-yellow-400">
            <WarningIcon />
            <span>{liquidity.warning}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function DropletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

export default LiquidityWarning;
