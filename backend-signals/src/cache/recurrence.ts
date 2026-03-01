/**
 * Signal Recurrence Tracker
 *
 * Tracks signal occurrences within 24h to detect patterns.
 * Provides context: "Is this new?" "Is this repeating?" "Is this getting worse?"
 *
 * Priority 10.3 - Time Context & Recurrence
 */

// Signal occurrence record
interface SignalOccurrence {
  timestamp: number;
  severity: string;
  impactScore: number;
  signalType: 'liquidity' | 'risk';
}

// Tracking store: Map<key, occurrences[]>
const occurrenceStore = new Map<string, SignalOccurrence[]>();

// 24 hours in milliseconds
const WINDOW_24H = 24 * 60 * 60 * 1000;

// Cleanup interval (every 10 minutes)
const CLEANUP_INTERVAL = 10 * 60 * 1000;

/**
 * Generate tracking key for token + signal type
 */
function getKey(chainId: number, token: string, signalType: 'liquidity' | 'risk'): string {
  return `${chainId}:${token.toLowerCase()}:${signalType}`;
}

/**
 * Record a signal occurrence
 */
export function recordOccurrence(
  chainId: number,
  token: string,
  signalType: 'liquidity' | 'risk',
  severity: string,
  impactScore: number
): void {
  const key = getKey(chainId, token, signalType);
  const now = Date.now();

  const occurrence: SignalOccurrence = {
    timestamp: now,
    severity,
    impactScore,
    signalType,
  };

  const existing = occurrenceStore.get(key) || [];
  existing.push(occurrence);

  // Keep only last 24h
  const cutoff = now - WINDOW_24H;
  const filtered = existing.filter((o) => o.timestamp > cutoff);

  occurrenceStore.set(key, filtered);
  console.log(`[Recurrence] Recorded ${signalType} for ${token.slice(0, 10)}... (${filtered.length} in 24h)`);
}

/**
 * Get recurrence metadata for a signal
 */
export interface RecurrenceInfo {
  /** Number of occurrences in last 24h (including current) */
  occurrences24h: number;
  /** Timestamp of last occurrence (before current) */
  lastSeen: number | null;
  /** Is this a repeat signal? */
  isRepeat: boolean;
  /** Trend direction based on impact score */
  trend: 'increasing' | 'decreasing' | 'stable' | 'new';
  /** Previous impact score (if available) */
  previousImpact: number | null;
  /** Time since last occurrence in seconds */
  timeSinceLastSeconds: number | null;
}

export function getRecurrenceInfo(
  chainId: number,
  token: string,
  signalType: 'liquidity' | 'risk',
  currentImpactScore: number
): RecurrenceInfo {
  const key = getKey(chainId, token, signalType);
  const now = Date.now();
  const cutoff = now - WINDOW_24H;

  const occurrences = occurrenceStore.get(key) || [];
  const validOccurrences = occurrences.filter((o) => o.timestamp > cutoff);

  // Count (not including current - we record after getting info)
  const count = validOccurrences.length;

  // Get last occurrence
  const lastOccurrence = validOccurrences.length > 0
    ? validOccurrences[validOccurrences.length - 1]
    : null;

  // Calculate trend
  let trend: RecurrenceInfo['trend'] = 'new';
  let previousImpact: number | null = null;

  if (lastOccurrence) {
    previousImpact = lastOccurrence.impactScore;
    const delta = currentImpactScore - previousImpact;

    if (delta > 5) {
      trend = 'increasing';
    } else if (delta < -5) {
      trend = 'decreasing';
    } else {
      trend = 'stable';
    }
  }

  // Time since last
  const timeSinceLastSeconds = lastOccurrence
    ? Math.floor((now - lastOccurrence.timestamp) / 1000)
    : null;

  return {
    occurrences24h: count + 1, // +1 for current
    lastSeen: lastOccurrence?.timestamp || null,
    isRepeat: count > 0,
    trend,
    previousImpact,
    timeSinceLastSeconds,
  };
}

/**
 * Get all occurrences for a token (for debugging)
 */
export function getOccurrences(
  chainId: number,
  token: string,
  signalType: 'liquidity' | 'risk'
): SignalOccurrence[] {
  const key = getKey(chainId, token, signalType);
  const cutoff = Date.now() - WINDOW_24H;
  const occurrences = occurrenceStore.get(key) || [];
  return occurrences.filter((o) => o.timestamp > cutoff);
}

/**
 * Clean up old entries
 */
function cleanup(): void {
  const cutoff = Date.now() - WINDOW_24H;
  let cleaned = 0;

  for (const [key, occurrences] of occurrenceStore) {
    const filtered = occurrences.filter((o) => o.timestamp > cutoff);
    if (filtered.length === 0) {
      occurrenceStore.delete(key);
      cleaned++;
    } else if (filtered.length < occurrences.length) {
      occurrenceStore.set(key, filtered);
    }
  }

  if (cleaned > 0) {
    console.log(`[Recurrence] Cleaned ${cleaned} expired entries`);
  }
}

// Start cleanup timer
setInterval(cleanup, CLEANUP_INTERVAL);
