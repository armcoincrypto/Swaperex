/**
 * Metrics Service
 *
 * Privacy-safe event tracking for product analytics.
 * Silent failure by design - metrics should never break UX.
 */

const API_BASE = import.meta.env.VITE_SIGNALS_API_URL || 'http://207.180.212.142:4001';

/**
 * Shorten wallet address for privacy
 */
function shortWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Track an event to the backend
 *
 * @param event - Event name (max 50 chars)
 * @param wallet - Full wallet address (will be shortened)
 * @param chainId - Chain ID
 * @param meta - Event-specific data (max 1KB)
 */
export async function trackEvent(
  event: string,
  wallet?: string,
  chainId?: number,
  meta?: Record<string, any>
): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/v1/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        wallet: wallet ? shortWallet(wallet) : undefined,
        chainId,
        meta
      })
    });
  } catch {
    // Silent fail - metrics should never break UX
  }
}

/**
 * Track radar page opened
 */
export function trackRadarOpened(wallet?: string, chainId?: number): void {
  trackEvent('radar_opened', wallet, chainId);
}

/**
 * Track wallet scan started
 */
export function trackWalletScanStarted(wallet?: string, chainId?: number): void {
  trackEvent('wallet_scan_started', wallet, chainId);
}

/**
 * Track wallet scan completed
 */
export function trackWalletScanCompleted(
  wallet: string,
  chainId: number,
  meta: {
    providerTokens: number;
    finalTokens: number;
    belowMin?: number;
    alreadyWatched?: number;
    filteredSpam?: number;
    durationMs: number;
  }
): void {
  trackEvent('wallet_scan_completed', wallet, chainId, meta);
}

/**
 * Track tokens added from wallet scan
 */
export function trackWalletScanAddSelected(
  wallet: string,
  chainId: number,
  meta: {
    selectedCount: number;
    addedCount: number;
  }
): void {
  trackEvent('wallet_scan_add_selected', wallet, chainId, meta);
}

/**
 * Track Telegram connected
 */
export function trackTelegramConnected(
  wallet?: string,
  meta?: {
    impactSetting?: string;
    minConfidenceSetting?: number;
  }
): void {
  trackEvent('telegram_connected', wallet, undefined, meta);
}

/**
 * Track manual token add to watchlist
 */
export function trackWatchlistAddManual(
  wallet?: string,
  chainId?: number,
  tokenSymbol?: string
): void {
  trackEvent('watchlist_add_manual', wallet, chainId, { tokenSymbol });
}
