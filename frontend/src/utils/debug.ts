/**
 * Debug Logging Utility
 *
 * Provides debug-only logging that is gated by localStorage.debug=true.
 * Use this for verbose logs that are useful for troubleshooting but
 * should not spam the console in normal operation.
 */

/**
 * Check if debug mode is enabled
 * Safe to call in any environment (handles SSR, localStorage errors)
 */
export function isDebugEnabled(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem('debug') === 'true';
  } catch {
    return false;
  }
}

/**
 * Log message only if debug mode is enabled
 * Use for verbose diagnostic logs that would spam console in production
 */
export function debugLog(...args: unknown[]): void {
  if (isDebugEnabled()) {
    console.log(...args);
  }
}

/**
 * Debug warn - only logs if debug enabled
 */
export function debugWarn(...args: unknown[]): void {
  if (isDebugEnabled()) {
    console.warn(...args);
  }
}
