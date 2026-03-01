/**
 * Impact Badge Component
 *
 * Displays signal impact level with icon and optional score.
 * Uses visual hierarchy: High (red/fire), Medium (orange/warning), Low (gray/info)
 *
 * Priority 10.1 - Signal Intelligence
 */

import type { ImpactScore } from '@/services/signalsHealth';

interface ImpactBadgeProps {
  impact: ImpactScore;
  /** Show numeric score (default false) */
  showScore?: boolean;
  /** Compact mode - icon only (default false) */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function ImpactBadge({ impact, showScore = false, compact = false, className = '' }: ImpactBadgeProps) {
  const { icon, label, bgColor, textColor } = getImpactDisplay(impact.level);

  if (compact) {
    return (
      <span
        className={`inline-flex items-center justify-center w-6 h-6 rounded text-sm ${bgColor} ${className}`}
        title={`${label}: ${impact.reason}`}
      >
        {icon}
      </span>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium ${bgColor} ${textColor} ${className}`}
      title={impact.reason}
    >
      <span>{icon}</span>
      <span>{label}</span>
      {showScore && (
        <span className="opacity-70 font-mono">({impact.score})</span>
      )}
    </div>
  );
}

/**
 * Get display properties for impact level
 */
function getImpactDisplay(level: 'high' | 'medium' | 'low'): {
  icon: string;
  label: string;
  bgColor: string;
  textColor: string;
} {
  switch (level) {
    case 'high':
      return {
        icon: '🔥',
        label: 'High Impact',
        bgColor: 'bg-red-900/40',
        textColor: 'text-red-300',
      };
    case 'medium':
      return {
        icon: '⚠️',
        label: 'Medium',
        bgColor: 'bg-orange-900/40',
        textColor: 'text-orange-300',
      };
    case 'low':
      return {
        icon: 'ℹ️',
        label: 'Low',
        bgColor: 'bg-gray-800/60',
        textColor: 'text-gray-400',
      };
  }
}

/**
 * Helper to get just the icon for inline usage
 */
export function getImpactIcon(level: 'high' | 'medium' | 'low'): string {
  switch (level) {
    case 'high': return '🔥';
    case 'medium': return '⚠️';
    case 'low': return 'ℹ️';
  }
}

/**
 * Helper to get tailwind color classes for impact level
 */
export function getImpactColors(level: 'high' | 'medium' | 'low'): { bg: string; text: string; border: string } {
  switch (level) {
    case 'high':
      return { bg: 'bg-red-900/40', text: 'text-red-300', border: 'border-red-500/30' };
    case 'medium':
      return { bg: 'bg-orange-900/40', text: 'text-orange-300', border: 'border-orange-500/30' };
    case 'low':
      return { bg: 'bg-gray-800/60', text: 'text-gray-400', border: 'border-gray-600/30' };
  }
}

export default ImpactBadge;
