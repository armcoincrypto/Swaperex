/**
 * Tier Badge Component
 *
 * Soft labels for feature tiers. NO lock icons.
 * Trust first. Always.
 */

import type { FeatureTier } from '@/config/featureFlags';

interface TierBadgeProps {
  tier: FeatureTier;
  size?: 'sm' | 'md';
  className?: string;
}

const TIER_STYLES: Record<FeatureTier, { bg: string; text: string; label: string }> = {
  standard: {
    bg: '',
    text: '',
    label: '',
  },
  advanced: {
    bg: 'bg-cyan/10',
    text: 'text-cyan',
    label: 'Advanced',
  },
  pro: {
    bg: 'bg-violet/10',
    text: 'text-violet',
    label: 'Pro',
  },
  'early-access': {
    bg: 'bg-accent/10',
    text: 'text-accent',
    label: 'Early Access',
  },
};

export function TierBadge({ tier, size = 'sm', className = '' }: TierBadgeProps) {
  // Don't render for standard tier
  if (tier === 'standard') {
    return null;
  }

  const style = TIER_STYLES[tier];
  const sizeClasses = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';

  return (
    <span
      className={`
        inline-flex items-center gap-1
        rounded-md font-medium
        ${style.bg} ${style.text}
        ${sizeClasses}
        ${className}
      `}
    >
      {style.label}
    </span>
  );
}

/**
 * Feature Label with optional tier badge
 * Use for feature titles in settings/menus
 */
interface FeatureLabelProps {
  children: React.ReactNode;
  tier?: FeatureTier;
  className?: string;
}

export function FeatureLabel({ children, tier = 'standard', className = '' }: FeatureLabelProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {children}
      {tier !== 'standard' && <TierBadge tier={tier} />}
    </span>
  );
}

/**
 * Coming Soon indicator
 * Subtle hint without blocking users
 */
export function ComingSoonBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`
        inline-flex items-center gap-1
        px-1.5 py-0.5 rounded-md
        bg-gray-500/10 text-gray-500
        text-[10px] font-medium
        ${className}
      `}
    >
      Soon
    </span>
  );
}

export default TierBadge;
