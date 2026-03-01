/**
 * Watchlist Monitor Service
 *
 * Polls signals for watched tokens every 60 seconds.
 * Respects system status (pauses when backend unavailable).
 * Deduplicates signals to prevent spam.
 *
 * Priority 11.1 - Watchlist + Auto-Monitor
 */

import { useWatchlistStore } from '@/stores/watchlistStore';
import { useSystemStatusStore } from '@/stores/systemStatusStore';
import { useSignalHistoryStore } from '@/stores/signalHistoryStore';
import { fetchSignals } from '@/services/signalsHealth';

// Polling interval (60 seconds)
const POLL_INTERVAL_MS = 60 * 1000;

// Backoff interval on error (2 minutes)
const BACKOFF_INTERVAL_MS = 2 * 60 * 1000;

// Dedup window (5 minutes)
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

// Singleton state
let monitorInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let lastPollTime = 0;
let isBackingOff = false;

// Dedup cache: hash -> timestamp
const signalHashes = new Map<string, number>();

/**
 * Generate hash for signal deduplication
 */
function generateSignalHash(
  chainId: number,
  token: string,
  type: 'liquidity' | 'risk',
  severity: string,
  impactScore: number,
  confidence: number
): string {
  return `${chainId}|${token.toLowerCase()}|${type}|${severity}|${impactScore}|${confidence}`;
}

/**
 * Check if signal is duplicate (seen in last 5 minutes)
 */
function isDuplicateSignal(hash: string): boolean {
  const lastSeen = signalHashes.get(hash);
  if (!lastSeen) return false;
  return Date.now() - lastSeen < DEDUP_WINDOW_MS;
}

/**
 * Record signal hash
 */
function recordSignalHash(hash: string): void {
  signalHashes.set(hash, Date.now());

  // Cleanup old hashes
  const cutoff = Date.now() - DEDUP_WINDOW_MS;
  for (const [key, time] of signalHashes.entries()) {
    if (time < cutoff) {
      signalHashes.delete(key);
    }
  }
}

/**
 * Poll all watched tokens for signals
 */
async function pollWatchlist(): Promise<void> {
  // Get current state
  const tokens = useWatchlistStore.getState().listTokens();
  const systemStatus = useSystemStatusStore.getState().status;
  const addHistoryEntry = useSignalHistoryStore.getState().addEntry;

  // Skip if no tokens to watch
  if (tokens.length === 0) {
    return;
  }

  // Skip if backend unavailable
  if (systemStatus === 'unavailable') {
    console.log('[WatchlistMonitor] Backend unavailable, skipping poll');
    return;
  }

  console.log(`[WatchlistMonitor] Polling ${tokens.length} tokens...`);
  lastPollTime = Date.now();

  for (const token of tokens) {
    try {
      const response = await fetchSignals(token.chainId, token.address, false);

      if (!response) {
        // Backend might be down, trigger backoff
        console.warn('[WatchlistMonitor] No response, entering backoff');
        enterBackoff();
        return;
      }

      // Process liquidity signal
      if (response.liquidity) {
        const hash = generateSignalHash(
          token.chainId,
          token.address,
          'liquidity',
          response.liquidity.severity,
          response.liquidity.impact?.score || 0,
          response.liquidity.confidence
        );

        if (!isDuplicateSignal(hash)) {
          recordSignalHash(hash);
          addHistoryEntry({
            token: token.address,
            tokenSymbol: token.symbol,
            chainId: token.chainId,
            type: 'liquidity',
            severity: response.liquidity.severity as 'warning' | 'danger' | 'critical',
            confidence: response.liquidity.confidence,
            reason: `Liquidity dropped ${response.liquidity.dropPct}%`,
            impact: response.liquidity.impact,
            recurrence: response.liquidity.recurrence,
            timestamp: Date.now(),
          });
          console.log('[WatchlistMonitor] New liquidity signal recorded for', token.address);
        }
      }

      // Process risk signal
      if (response.risk) {
        const hash = generateSignalHash(
          token.chainId,
          token.address,
          'risk',
          response.risk.severity,
          response.risk.impact?.score || 0,
          response.risk.confidence
        );

        if (!isDuplicateSignal(hash)) {
          recordSignalHash(hash);
          addHistoryEntry({
            token: token.address,
            tokenSymbol: token.symbol,
            chainId: token.chainId,
            type: 'risk',
            severity: response.risk.severity as 'warning' | 'danger' | 'critical',
            confidence: response.risk.confidence,
            reason: `${response.risk.riskFactors.length} risk factors detected`,
            impact: response.risk.impact,
            recurrence: response.risk.recurrence,
            timestamp: Date.now(),
          });
          console.log('[WatchlistMonitor] New risk signal recorded for', token.address);
        }
      }

      // Small delay between requests to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.error('[WatchlistMonitor] Error polling token:', token.address, error);
      // Don't backoff on individual token errors, continue with next
    }
  }
}

/**
 * Enter backoff mode (pause for 2 minutes)
 */
function enterBackoff(): void {
  if (isBackingOff) return;

  isBackingOff = true;
  console.log('[WatchlistMonitor] Entering backoff for 2 minutes');

  setTimeout(() => {
    isBackingOff = false;
    console.log('[WatchlistMonitor] Backoff complete, resuming');
  }, BACKOFF_INTERVAL_MS);
}

/**
 * Start the watchlist monitor (singleton)
 */
export function startWatchlistMonitor(): void {
  if (isRunning) {
    console.log('[WatchlistMonitor] Already running');
    return;
  }

  isRunning = true;
  console.log('[WatchlistMonitor] Starting...');

  // Initial poll after short delay
  setTimeout(() => {
    if (!isBackingOff) {
      pollWatchlist();
    }
  }, 5000);

  // Set up interval
  monitorInterval = setInterval(() => {
    if (!isBackingOff) {
      pollWatchlist();
    }
  }, POLL_INTERVAL_MS);
}

/**
 * Stop the watchlist monitor
 */
export function stopWatchlistMonitor(): void {
  if (!isRunning) return;

  isRunning = false;
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  console.log('[WatchlistMonitor] Stopped');
}

/**
 * Check if monitor is running
 */
export function isMonitorRunning(): boolean {
  return isRunning;
}

/**
 * Get last poll time
 */
export function getLastPollTime(): number {
  return lastPollTime;
}

/**
 * Manually trigger a poll for a specific token
 */
export async function pollSingleToken(chainId: number, address: string): Promise<void> {
  const systemStatus = useSystemStatusStore.getState().status;

  if (systemStatus === 'unavailable') {
    console.log('[WatchlistMonitor] Backend unavailable, cannot poll');
    return;
  }

  const watchlist = useWatchlistStore.getState();
  const tokens = watchlist.listTokens();
  const token = tokens.find(
    (t) => t.chainId === chainId && t.address.toLowerCase() === address.toLowerCase()
  );

  if (!token) {
    console.log('[WatchlistMonitor] Token not in watchlist');
    return;
  }

  const addHistoryEntry = useSignalHistoryStore.getState().addEntry;

  try {
    const response = await fetchSignals(chainId, address, false);

    if (!response) {
      console.warn('[WatchlistMonitor] No response for single poll');
      return;
    }

    // Process signals (skip dedup for manual check)
    if (response.liquidity) {
      addHistoryEntry({
        token: address,
        tokenSymbol: token.symbol,
        chainId,
        type: 'liquidity',
        severity: response.liquidity.severity as 'warning' | 'danger' | 'critical',
        confidence: response.liquidity.confidence,
        reason: `Liquidity dropped ${response.liquidity.dropPct}%`,
        impact: response.liquidity.impact,
        recurrence: response.liquidity.recurrence,
        timestamp: Date.now(),
      });
    }

    if (response.risk) {
      addHistoryEntry({
        token: address,
        tokenSymbol: token.symbol,
        chainId,
        type: 'risk',
        severity: response.risk.severity as 'warning' | 'danger' | 'critical',
        confidence: response.risk.confidence,
        reason: `${response.risk.riskFactors.length} risk factors detected`,
        impact: response.risk.impact,
        recurrence: response.risk.recurrence,
        timestamp: Date.now(),
      });
    }

    console.log('[WatchlistMonitor] Manual poll complete for', address);
  } catch (error) {
    console.error('[WatchlistMonitor] Error in manual poll:', error);
  }
}

export default {
  start: startWatchlistMonitor,
  stop: stopWatchlistMonitor,
  isRunning: isMonitorRunning,
  pollSingle: pollSingleToken,
};
