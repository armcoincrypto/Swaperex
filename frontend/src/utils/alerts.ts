/**
 * Alert Utilities
 *
 * Helper functions for alert decision logic.
 * Single source of truth for when/how alerts fire.
 *
 * Priority 12.1-12.2 - In-App Alerts
 */

import { type AlertItem, type AlertPrefs } from '@/stores/alertStore';
import { type SignalHistoryEntry } from '@/stores/signalHistoryStore';

/**
 * Determine if a signal should trigger an alert
 */
export function shouldAlert(
  signal: {
    impact?: { level: 'high' | 'medium' | 'low'; score: number };
    confidence: number;
  },
  prefs: AlertPrefs,
  isQuietNow: boolean
): boolean {
  // Respect quiet hours
  if (isQuietNow) {
    return false;
  }

  // Must have impact info
  if (!signal.impact) {
    return false;
  }

  const level = signal.impact.level;

  // Check impact threshold
  if (prefs.impactThreshold === 'high') {
    return level === 'high';
  }

  // 'high+medium' threshold
  return level === 'high' || level === 'medium';
}

/**
 * Build an AlertItem from a SignalHistoryEntry
 */
export function buildAlertItem(
  entry: SignalHistoryEntry
): Omit<AlertItem, 'id' | 'read'> {
  return {
    token: entry.token,
    tokenSymbol: entry.tokenSymbol,
    chainId: entry.chainId,
    type: entry.type,
    impactLevel: entry.impact?.level || 'low',
    impactScore: entry.impact?.score || 0,
    confidence: entry.confidence,
    reason: entry.reason,
    timestamp: entry.timestamp,
    entryHash: entry.id,
  };
}

/**
 * Format alert title for display
 */
export function formatAlertTitle(alert: AlertItem): string {
  const typeLabel = alert.type === 'risk' ? 'Risk' : 'Liquidity';
  const impactEmoji =
    alert.impactLevel === 'high'
      ? '🔥'
      : alert.impactLevel === 'medium'
      ? '⚠️'
      : 'ℹ️';

  return `${impactEmoji} ${typeLabel} Alert`;
}

/**
 * Format alert body for display
 */
export function formatAlertBody(alert: AlertItem): string {
  const token = alert.tokenSymbol || alert.token.slice(0, 8) + '...';
  return `${token} on chain ${alert.chainId}: ${alert.reason}`;
}

/**
 * Get chain name from chainId
 */
export function getChainName(chainId: number): string {
  switch (chainId) {
    case 1:
      return 'ETH';
    case 56:
      return 'BSC';
    case 137:
      return 'Polygon';
    case 42161:
      return 'Arbitrum';
    case 10:
      return 'Optimism';
    case 8453:
      return 'Base';
    case 43114:
      return 'Avalanche';
    default:
      return `Chain ${chainId}`;
  }
}

/**
 * Play alert sound (WebAudio - no file needed)
 */
export function playAlertSound(): void {
  try {
    const audioContext = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

    // Create a short beep sound
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // High-pitched alert tone
    oscillator.frequency.value = 880; // A5 note
    oscillator.type = 'sine';

    // Quick fade out
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
  } catch {
    // Silently fail if audio not available
  }
}
