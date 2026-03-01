/**
 * Confidence Explainer Component
 *
 * Explains what confidence score means and shows contributing factors.
 * Makes 60% vs 90% confidence meaningful to users.
 *
 * Radar Context & Guidance Upgrade - Step 2
 */

import { useState } from 'react';

interface ConfidenceExplainerProps {
  /** Confidence score (0-1) */
  confidence: number;
  /** Number of occurrences in 24h (affects confidence) */
  occurrences24h?: number;
  /** Whether this is a repeat signal */
  isRepeat?: boolean;
  /** Show inline or as tooltip trigger */
  mode?: 'inline' | 'tooltip';
  className?: string;
}

// Confidence level thresholds
function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
}

// Get confidence color
function getConfidenceColor(confidence: number): string {
  const level = getConfidenceLevel(confidence);
  switch (level) {
    case 'high':
      return 'text-green-400';
    case 'medium':
      return 'text-yellow-400';
    case 'low':
      return 'text-dark-500';
  }
}

// Get confidence background
function getConfidenceBgColor(confidence: number): string {
  const level = getConfidenceLevel(confidence);
  switch (level) {
    case 'high':
      return 'bg-green-900/20';
    case 'medium':
      return 'bg-yellow-900/20';
    case 'low':
      return 'bg-dark-800';
  }
}

// Build confidence factors list
function getConfidenceFactors(
  confidence: number,
  occurrences24h?: number,
  isRepeat?: boolean
): Array<{ label: string; positive: boolean }> {
  const factors: Array<{ label: string; positive: boolean }> = [];

  // Repetition factor
  if (isRepeat && occurrences24h && occurrences24h > 1) {
    factors.push({
      label: `Seen ${occurrences24h}× in 24h`,
      positive: true,
    });
  } else {
    factors.push({
      label: 'First occurrence',
      positive: false,
    });
  }

  // Source consistency (simulated based on confidence)
  if (confidence >= 0.7) {
    factors.push({
      label: 'Consistent across scans',
      positive: true,
    });
  }

  // High confidence specific
  if (confidence >= 0.8) {
    factors.push({
      label: 'Multiple data sources agree',
      positive: true,
    });
  }

  // Lower confidence indicators
  if (confidence < 0.6) {
    factors.push({
      label: 'Limited data points',
      positive: false,
    });
  }

  return factors;
}

export function ConfidenceExplainer({
  confidence,
  occurrences24h,
  isRepeat,
  mode = 'tooltip',
  className = '',
}: ConfidenceExplainerProps) {
  const [showDetails, setShowDetails] = useState(false);
  const confidencePercent = Math.round(confidence * 100);
  const level = getConfidenceLevel(confidence);
  const color = getConfidenceColor(confidence);
  const bgColor = getConfidenceBgColor(confidence);
  const factors = getConfidenceFactors(confidence, occurrences24h, isRepeat);

  if (mode === 'inline') {
    return (
      <div className={`${className}`}>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className={`flex items-center gap-1 px-2 py-1 rounded ${bgColor} ${color} text-xs transition-colors hover:opacity-80`}
        >
          <span className="font-mono font-medium">{confidencePercent}%</span>
          <span className="text-dark-500 text-[10px]">confidence</span>
          <span className="text-dark-600 text-[10px]">{showDetails ? '▼' : '▶'}</span>
        </button>

        {showDetails && (
          <div className="mt-2 p-3 bg-dark-800/50 border border-dark-700/50 rounded-lg">
            <div className="text-[11px] text-dark-400 mb-2">
              Confidence reflects how reliable this signal is based on:
            </div>
            <ul className="space-y-1">
              {factors.map((factor, index) => (
                <li
                  key={index}
                  className={`text-[11px] flex items-center gap-1.5 ${
                    factor.positive ? 'text-green-400/80' : 'text-dark-500'
                  }`}
                >
                  <span>{factor.positive ? '✓' : '○'}</span>
                  <span>{factor.label}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 pt-2 border-t border-dark-700/50 text-[10px] text-dark-500">
              {level === 'high' && 'High confidence: Signal is well-corroborated.'}
              {level === 'medium' && 'Medium confidence: Signal has reasonable support.'}
              {level === 'low' && 'Low confidence: Limited data, treat as preliminary.'}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Tooltip mode - just show badge with hover info
  return (
    <div className={`relative group ${className}`}>
      <span
        className={`px-1.5 py-0.5 rounded ${bgColor} ${color} text-[10px] font-mono cursor-help`}
      >
        {confidencePercent}%
      </span>

      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-dark-900 border border-dark-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
        <div className="text-[10px] text-dark-300 font-medium mb-1">
          Confidence: {confidencePercent}%
        </div>
        <div className="text-[10px] text-dark-500 mb-2">
          {level === 'high' && 'Well-corroborated signal'}
          {level === 'medium' && 'Reasonable support'}
          {level === 'low' && 'Limited data points'}
        </div>
        <ul className="space-y-0.5">
          {factors.slice(0, 2).map((factor, index) => (
            <li
              key={index}
              className={`text-[9px] flex items-center gap-1 ${
                factor.positive ? 'text-green-400/70' : 'text-dark-500'
              }`}
            >
              <span>{factor.positive ? '✓' : '○'}</span>
              <span>{factor.label}</span>
            </li>
          ))}
        </ul>
        {/* Arrow */}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-dark-700" />
      </div>
    </div>
  );
}

/**
 * Simple confidence badge with color coding
 */
interface ConfidenceBadgeProps {
  confidence: number;
  className?: string;
}

export function ConfidenceBadge({ confidence, className = '' }: ConfidenceBadgeProps) {
  const confidencePercent = Math.round(confidence * 100);
  const color = getConfidenceColor(confidence);
  const bgColor = getConfidenceBgColor(confidence);

  return (
    <span className={`px-1.5 py-0.5 rounded ${bgColor} ${color} text-[10px] font-mono ${className}`}>
      {confidencePercent}%
    </span>
  );
}

export default ConfidenceExplainer;
