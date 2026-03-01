/**
 * Signal Deduplication Guard
 *
 * Hash-based deduplication to prevent identical signals from firing
 * even if API returns the same data multiple times.
 *
 * Priority 9.0.2 - Signal Deduplication Guard
 */

import { createHash } from 'crypto';

// Store: Map<key, { hash, timestamp, expiresAt }>
const signalHashes = new Map<string, { hash: string; timestamp: number; expiresAt: number }>();

// Dedup window: signals with same hash are suppressed for this duration (5 minutes)
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

// Cleanup interval (30 seconds)
const CLEANUP_INTERVAL_MS = 30 * 1000;

/**
 * Generate a hash for signal data
 */
function hashSignalState(data: Record<string, unknown>): string {
  const sorted = JSON.stringify(data, Object.keys(data).sort());
  return createHash('sha256').update(sorted).digest('hex').slice(0, 16);
}

/**
 * Check if a signal is a duplicate (same hash within dedup window)
 *
 * @param chainId - Chain ID
 * @param token - Token address
 * @param signalType - Signal type (liquidity, risk)
 * @param signalData - Signal data to hash
 * @returns true if this is a duplicate, false if it's new
 */
export function isDuplicateSignal(
  chainId: number,
  token: string,
  signalType: 'liquidity' | 'risk',
  signalData: Record<string, unknown>
): boolean {
  const key = `${chainId}:${token.toLowerCase()}:${signalType}`;
  const hash = hashSignalState(signalData);

  const existing = signalHashes.get(key);

  if (existing && existing.hash === hash && Date.now() < existing.expiresAt) {
    console.log(`[SignalDedup] Duplicate detected: ${signalType} for ${token.slice(0, 10)}...`);
    return true;
  }

  // Store new hash
  signalHashes.set(key, {
    hash,
    timestamp: Date.now(),
    expiresAt: Date.now() + DEDUP_WINDOW_MS,
  });

  return false;
}

/**
 * Get dedup status for a signal (for debug info)
 */
export function getDedupStatus(
  chainId: number,
  token: string,
  signalType: 'liquidity' | 'risk'
): { tracked: boolean; hash: string | null; expiresIn: number } {
  const key = `${chainId}:${token.toLowerCase()}:${signalType}`;
  const existing = signalHashes.get(key);

  if (!existing || Date.now() >= existing.expiresAt) {
    return { tracked: false, hash: null, expiresIn: 0 };
  }

  return {
    tracked: true,
    hash: existing.hash,
    expiresIn: Math.max(0, Math.floor((existing.expiresAt - Date.now()) / 1000)),
  };
}

/**
 * Clear expired entries
 */
function cleanup(): void {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, entry] of signalHashes) {
    if (now >= entry.expiresAt) {
      signalHashes.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[SignalDedup] Cleaned ${cleaned} expired entries`);
  }
}

// Start cleanup timer
setInterval(cleanup, CLEANUP_INTERVAL_MS);
