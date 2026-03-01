/**
 * Explainer Tooltip Component
 *
 * Provides contextual "Why?" explanations for warnings and concepts.
 * Helps users understand what safety signals mean and what to do.
 */

import { useState, useRef, useEffect } from 'react';

interface ExplainerContent {
  title: string;
  explanation: string;
  learnMore?: string;
}

// Pre-defined explanations for common warnings
export const EXPLAINER_CONTENT: Record<string, ExplainerContent> = {
  // Price Impact
  priceImpactLow: {
    title: 'Low Price Impact',
    explanation: 'Your trade size is small relative to the liquidity pool. You\'ll receive a price close to the market rate.',
    learnMore: 'Price impact under 1% is generally considered safe for most trades.',
  },
  priceImpactMedium: {
    title: 'Moderate Price Impact',
    explanation: 'Your trade will move the price slightly. This means you\'re paying a bit more than the displayed market rate.',
    learnMore: 'Consider splitting into smaller trades or waiting for more liquidity.',
  },
  priceImpactHigh: {
    title: 'High Price Impact',
    explanation: 'Your trade size is large relative to the pool. You\'ll receive significantly less than the current market rate.',
    learnMore: 'This usually happens with low-liquidity tokens or very large trades. Consider trading smaller amounts.',
  },

  // Safety Score
  safetyScoreHigh: {
    title: 'High Safety Score',
    explanation: 'This token passed most security checks. The contract shows no obvious red flags based on automated analysis.',
    learnMore: 'A high score doesn\'t guarantee safety - always do your own research (DYOR).',
  },
  safetyScoreMedium: {
    title: 'Moderate Safety Score',
    explanation: 'Some potential concerns were detected. This could include centralized control, unusual tax mechanisms, or limited trading history.',
    learnMore: 'Review the specific warnings carefully before trading.',
  },
  safetyScoreLow: {
    title: 'Low Safety Score',
    explanation: 'Multiple security concerns detected. This token may have high taxes, restricted trading, or other risky features.',
    learnMore: 'Proceed with extreme caution. Only trade what you can afford to lose.',
  },

  // Liquidity
  liquidityHigh: {
    title: 'High Liquidity',
    explanation: 'This trading pair has substantial funds available. You can trade larger amounts with minimal price impact.',
  },
  liquidityMedium: {
    title: 'Moderate Liquidity',
    explanation: 'Reasonable liquidity available, but larger trades may experience higher price impact.',
    learnMore: 'Consider using smaller order sizes for better execution.',
  },
  liquidityLow: {
    title: 'Low Liquidity Warning',
    explanation: 'Limited funds available in this pool. Even small trades may significantly move the price.',
    learnMore: 'Low liquidity can make it difficult to sell later. Be cautious with position sizes.',
  },

  // Guard Warnings
  guardSafetyFailed: {
    title: 'Safety Guard Triggered',
    explanation: 'The token\'s safety score is below your preset\'s minimum threshold. This is a protective measure you configured.',
    learnMore: 'You can proceed anyway (soft mode) or adjust your preset settings.',
  },
  guardImpactFailed: {
    title: 'Price Impact Guard Triggered',
    explanation: 'The expected price impact exceeds your preset\'s maximum threshold. This protects you from unfavorable trades.',
    learnMore: 'Try trading a smaller amount or wait for better liquidity.',
  },
  guardLiquidityFailed: {
    title: 'Liquidity Guard Triggered',
    explanation: 'The pool liquidity is below your preset\'s minimum requirement. This protects you from illiquid trades.',
    learnMore: 'Low liquidity can lead to high slippage and difficulty exiting positions.',
  },

  // Slippage
  slippageLow: {
    title: 'Low Slippage Tolerance',
    explanation: 'Your transaction will revert if the price moves more than this amount. Very low slippage may cause failures in volatile markets.',
  },
  slippageHigh: {
    title: 'High Slippage Tolerance',
    explanation: 'You\'re allowing significant price movement. This may result in receiving less tokens than expected.',
    learnMore: 'High slippage is sometimes needed for volatile tokens, but can lead to worse execution.',
  },

  // General
  approvalRequired: {
    title: 'Token Approval Required',
    explanation: 'You need to approve the DEX to use your tokens. This is a standard security measure that gives permission to trade on your behalf.',
    learnMore: 'Approvals are per-token and usually only needed once per DEX.',
  },
  quoteExpiry: {
    title: 'Quote Expiring',
    explanation: 'Crypto prices change rapidly. Quotes expire to ensure you get a fair price. Refresh to get an updated quote.',
  },
};

interface ExplainerTooltipProps {
  explainerId: keyof typeof EXPLAINER_CONTENT | string;
  customContent?: ExplainerContent;
  children?: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  size?: 'sm' | 'md';
}

export function ExplainerTooltip({
  explainerId,
  customContent,
  children,
  position = 'top',
  size = 'md',
}: ExplainerTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const content = customContent || EXPLAINER_CONTENT[explainerId];

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  if (!content) return null;

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-transparent border-t-dark-700',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-4 border-r-4 border-b-4 border-transparent border-b-dark-700',
    left: 'left-full top-1/2 -translate-y-1/2 border-t-4 border-b-4 border-l-4 border-transparent border-l-dark-700',
    right: 'right-full top-1/2 -translate-y-1/2 border-t-4 border-b-4 border-r-4 border-transparent border-r-dark-700',
  };

  const sizeClasses = {
    sm: 'w-48',
    md: 'w-64',
  };

  return (
    <div className="relative inline-flex" ref={tooltipRef}>
      {/* Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className="inline-flex items-center gap-1 text-dark-400 hover:text-dark-300 transition-colors"
        type="button"
      >
        {children || <WhyIcon />}
      </button>

      {/* Tooltip */}
      {isOpen && (
        <div
          className={`absolute z-50 ${positionClasses[position]} ${sizeClasses[size]}`}
        >
          <div className="bg-dark-700 rounded-lg shadow-lg border border-dark-600 p-3">
            {/* Title */}
            <div className="flex items-center gap-2 mb-2">
              <InfoCircleIcon />
              <span className="font-medium text-sm text-white">{content.title}</span>
            </div>

            {/* Explanation */}
            <p className="text-xs text-dark-300 leading-relaxed mb-2">
              {content.explanation}
            </p>

            {/* Learn More */}
            {content.learnMore && (
              <p className="text-xs text-dark-400 italic">
                {content.learnMore}
              </p>
            )}
          </div>

          {/* Arrow */}
          <div className={`absolute w-0 h-0 ${arrowClasses[position]}`} />
        </div>
      )}
    </div>
  );
}

// Compact "Why?" button variant
export function WhyButton({
  explainerId,
  customContent,
}: {
  explainerId: keyof typeof EXPLAINER_CONTENT | string;
  customContent?: ExplainerContent;
}) {
  return (
    <ExplainerTooltip explainerId={explainerId} customContent={customContent}>
      <span className="text-xs text-dark-500 hover:text-primary-400 cursor-help underline underline-offset-2 decoration-dotted">
        Why?
      </span>
    </ExplainerTooltip>
  );
}

// Icons
function WhyIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function InfoCircleIcon() {
  return (
    <svg className="w-4 h-4 text-primary-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export default ExplainerTooltip;
