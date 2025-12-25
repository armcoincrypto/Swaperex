/**
 * Price Impact Badge Component
 *
 * Displays price impact with color-coded severity.
 */

import type { PriceImpactAnalysis } from '@/services/dex/types';
import { WhyButton } from '@/components/common/ExplainerTooltip';

interface PriceImpactBadgeProps {
  impact: PriceImpactAnalysis;
  compact?: boolean;
}

export function PriceImpactBadge({ impact, compact = false }: PriceImpactBadgeProps) {
  const getBgColor = () => {
    switch (impact.level) {
      case 'low':
        return 'bg-green-900/20 border-green-800';
      case 'medium':
        return 'bg-yellow-900/20 border-yellow-800';
      case 'high':
        return 'bg-orange-900/20 border-orange-800';
      case 'extreme':
        return 'bg-red-900/20 border-red-800';
    }
  };

  const getTextColor = () => {
    switch (impact.level) {
      case 'low':
        return 'text-green-400';
      case 'medium':
        return 'text-yellow-400';
      case 'high':
        return 'text-orange-400';
      case 'extreme':
        return 'text-red-400';
    }
  };

  const getIcon = () => {
    switch (impact.level) {
      case 'low':
        return <CheckIcon />;
      case 'medium':
        return <InfoIcon />;
      case 'high':
      case 'extreme':
        return <WarningIcon />;
    }
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border ${getBgColor()}`}>
        <span className={`text-xs font-medium ${getTextColor()}`}>
          {impact.percentage.toFixed(2)}%
        </span>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-3 ${getBgColor()}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <TrendIcon className={getTextColor()} />
          <span className="text-sm font-medium">Price Impact</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={getIcon()?.props.className || ''}>
            {getIcon()}
          </span>
          <span className={`text-lg font-bold ${getTextColor()}`}>
            {impact.percentage.toFixed(2)}%
          </span>
        </div>
      </div>

      {impact.warning && (
        <div className={`flex items-start gap-2 text-xs ${getTextColor()}`}>
          <WarningIcon />
          <span>{impact.warning}</span>
        </div>
      )}

      {!impact.warning && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-dark-400">
            {impact.level === 'low' && 'Minimal price impact - good trade size'}
            {impact.level === 'medium' && 'Moderate impact - consider smaller trades'}
            {impact.level === 'high' && 'Significant impact on execution price'}
            {impact.level === 'extreme' && 'Very high impact - split into smaller trades'}
          </p>
          <WhyButton
            explainerId={
              impact.level === 'low'
                ? 'priceImpactLow'
                : impact.level === 'medium'
                ? 'priceImpactMedium'
                : 'priceImpactHigh'
            }
          />
        </div>
      )}
    </div>
  );
}

function TrendIcon({ className }: { className?: string }) {
  return (
    <svg className={`w-5 h-5 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

export default PriceImpactBadge;
