/**
 * Feature Flags System
 *
 * Quiet preparation for future features.
 * NO paywalls, NO lock icons, NO "upgrade now" prompts.
 * Trust first. Always.
 */

// Feature flag definitions
export interface FeatureFlags {
  // Signal features
  advancedSignals: boolean; // Whale alerts, liquidity tracking
  realTimeAlerts: boolean; // Push notifications

  // Preset features
  proPresets: boolean; // Advanced guard configurations
  presetSync: boolean; // Cloud sync for presets

  // Intelligence features
  deepAnalysis: boolean; // Extended token analysis
  routeOptimization: boolean; // Multi-hop route suggestions

  // UI features
  customThemes: boolean; // Theme customization
  portfolioExport: boolean; // Export to CSV/PDF
}

// Default flags - all disabled for now
const DEFAULT_FLAGS: FeatureFlags = {
  advancedSignals: false,
  realTimeAlerts: false,
  proPresets: false,
  presetSync: false,
  deepAnalysis: false,
  routeOptimization: false,
  customThemes: false,
  portfolioExport: false,
};

// Environment-based overrides (for testing)
const ENV_OVERRIDES: Partial<FeatureFlags> = {
  // Enable in development for testing
  ...(import.meta.env.DEV && {
    advancedSignals: true,
    deepAnalysis: true,
  }),
};

// Combined flags
const flags: FeatureFlags = {
  ...DEFAULT_FLAGS,
  ...ENV_OVERRIDES,
};

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: keyof FeatureFlags): boolean {
  return flags[feature] ?? false;
}

/**
 * Get all feature flags
 */
export function getFeatureFlags(): FeatureFlags {
  return { ...flags };
}

/**
 * Feature tier labels (for UI display)
 * NO lock icons. Soft labels only.
 */
export type FeatureTier = 'standard' | 'advanced' | 'pro' | 'early-access';

export const FEATURE_TIERS: Record<keyof FeatureFlags, FeatureTier> = {
  advancedSignals: 'advanced',
  realTimeAlerts: 'pro',
  proPresets: 'pro',
  presetSync: 'pro',
  deepAnalysis: 'advanced',
  routeOptimization: 'advanced',
  customThemes: 'pro',
  portfolioExport: 'early-access',
};

/**
 * Get the tier label for a feature
 */
export function getFeatureTier(feature: keyof FeatureFlags): FeatureTier {
  return FEATURE_TIERS[feature] || 'standard';
}

/**
 * Check if feature should show tier badge
 * Only show for non-standard tiers
 */
export function shouldShowTierBadge(feature: keyof FeatureFlags): boolean {
  const tier = getFeatureTier(feature);
  return tier !== 'standard';
}

export default {
  isFeatureEnabled,
  getFeatureFlags,
  getFeatureTier,
  shouldShowTierBadge,
};
