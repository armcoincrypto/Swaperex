/**
 * Metrics Service
 *
 * Privacy-safe event tracking for product analytics.
 * Events are fire-and-forget - never block UX.
 *
 * Radar: Metrics MVP
 */

const API_BASE = import.meta.env.VITE_SIGNALS_API_URL || 'http://207.180.212.142:4001';

/**
 * Short wallet format for privacy
 */
function shortWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Track an event (fire and forget)
 */
export async function trackEvent(
  event: string,
  wallet?: string,
  chainId?: number,
  meta?: Record<string, unknown>
): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/v1/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        wallet: wallet ? shortWallet(wallet) : undefined,
        chainId,
        meta,
      }),
    });
  } catch {
    // Silent fail - metrics should never break UX
  }
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Track radar page opened
 */
export function trackRadarOpened(wallet?: string, chainId?: number): void {
  trackEvent('radar_opened', wallet, chainId);
}

/**
 * Track wallet scan started
 */
export function trackScanStarted(wallet: string, chainId: number): void {
  trackEvent('wallet_scan_started', wallet, chainId);
}

/**
 * Track wallet scan completed
 */
export function trackScanCompleted(
  wallet: string,
  chainId: number,
  stats: {
    providerTokens: number;
    finalTokens: number;
    belowMin: number;
    alreadyWatched: number;
    durationMs: number;
  }
): void {
  trackEvent('wallet_scan_completed', wallet, chainId, stats);
}

/**
 * Track tokens added from scan
 */
export function trackScanAddSelected(
  wallet: string,
  chainId: number,
  selectedCount: number,
  addedCount: number
): void {
  trackEvent('wallet_scan_add_selected', wallet, chainId, {
    selectedCount,
    addedCount,
  });
}

/**
 * Track Telegram connected
 */
export function trackTelegramConnected(wallet: string): void {
  trackEvent('telegram_connected', wallet);
}

/**
 * Track watchlist token added (manual)
 */
export function trackWatchlistAdd(
  wallet: string,
  chainId: number,
  tokenSymbol: string
): void {
  trackEvent('watchlist_add', wallet, chainId, { tokenSymbol });
}

/**
 * Track watchlist token removed
 */
export function trackWatchlistRemove(
  wallet: string,
  chainId: number,
  tokenSymbol: string
): void {
  trackEvent('watchlist_remove', wallet, chainId, { tokenSymbol });
}
