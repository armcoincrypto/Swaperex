/**
 * Onboarding Utility
 *
 * Manages onboarding state in localStorage.
 * Used to show first-visit education cards only once.
 */

const RADAR_INTRO_KEY = 'swx_radar_intro_dismissed_v1';

/**
 * Check if the Radar intro has been dismissed
 */
export function isRadarIntroDismissed(): boolean {
  if (typeof window === 'undefined') return true; // SSR safe
  try {
    return localStorage.getItem(RADAR_INTRO_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Mark the Radar intro as dismissed
 */
export function dismissRadarIntro(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(RADAR_INTRO_KEY, 'true');
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Reset Radar intro (show again)
 */
export function resetRadarIntro(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(RADAR_INTRO_KEY);
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Reset all onboarding states
 */
export function resetAllOnboarding(): void {
  resetRadarIntro();
}
