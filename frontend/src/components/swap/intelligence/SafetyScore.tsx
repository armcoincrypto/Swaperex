/**
 * Safety Score Component
 *
 * Displays overall swap safety score (0-100) with visual indicator.
 */

import { useState } from 'react';
import type { SafetyFactor } from '@/services/dex/types';

interface SafetyScoreProps {
  score: number;
  level: 'safe' | 'moderate' | 'risky' | 'dangerous';
  factors: SafetyFactor[];
  compact?: boolean;
}

export function SafetyScore({ score, level, factors, compact = false }: SafetyScoreProps) {
  const [showDetails, setShowDetails] = useState(false);

  const getScoreColor = () => {
    switch (level) {
      case 'safe':
        return 'text-green-400';
      case 'moderate':
        return 'text-yellow-400';
      case 'risky':
        return 'text-orange-400';
      case 'dangerous':
        return 'text-red-400';
    }
  };

  const getBgColor = () => {
    switch (level) {
      case 'safe':
        return 'bg-green-900/20 border-green-800';
      case 'moderate':
        return 'bg-yellow-900/20 border-yellow-800';
      case 'risky':
        return 'bg-orange-900/20 border-orange-800';
      case 'dangerous':
        return 'bg-red-900/20 border-red-800';
    }
  };

  const getProgressColor = () => {
    switch (level) {
      case 'safe':
        return 'bg-green-500';
      case 'moderate':
        return 'bg-yellow-500';
      case 'risky':
        return 'bg-orange-500';
      case 'dangerous':
        return 'bg-red-500';
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <ShieldIcon className={getScoreColor()} />
        <span className={`font-medium ${getScoreColor()}`}>{score}</span>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-3 ${getBgColor()}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ShieldIcon className={getScoreColor()} />
          <span className="text-sm font-medium">Safety Score</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xl font-bold ${getScoreColor()}`}>{score}</span>
          <span className="text-dark-400 text-sm">/ 100</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-dark-700 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full ${getProgressColor()} transition-all duration-500`}
          style={{ width: `${score}%` }}
        />
      </div>

      {/* Level Label */}
      <div className="flex items-center justify-between text-xs">
        <span className={getScoreColor()}>
          {level === 'safe' && 'Safe to swap'}
          {level === 'moderate' && 'Moderate risk'}
          {level === 'risky' && 'Higher risk'}
          {level === 'dangerous' && 'High risk - proceed with caution'}
        </span>
        {factors.length > 0 && (
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-dark-400 hover:text-white transition-colors"
          >
            {showDetails ? 'Hide details' : 'Show details'}
          </button>
        )}
      </div>

      {/* Factor Details */}
      {showDetails && factors.length > 0 && (
        <div className="mt-3 pt-3 border-t border-dark-700 space-y-2">
          {factors.map((factor) => (
            <div key={factor.name} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <StatusDot status={factor.status} />
                <span className="text-dark-300">{factor.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-dark-400">{factor.description}</span>
                <span className="text-dark-500">{factor.score}/25</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: 'good' | 'warning' | 'danger' }) {
  const color =
    status === 'good'
      ? 'bg-green-400'
      : status === 'warning'
      ? 'bg-yellow-400'
      : 'bg-red-400';

  return <div className={`w-2 h-2 rounded-full ${color}`} />;
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={`w-5 h-5 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  );
}

export default SafetyScore;
