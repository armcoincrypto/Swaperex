/**
 * Metrics Module
 *
 * Server-side event tracking with JSONL storage.
 * Provides summary endpoint for analytics dashboard.
 */

import { appendFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

// Data directory for metrics storage
const DATA_DIR = process.env.METRICS_DATA_DIR || join(process.cwd(), 'data');
const EVENTS_FILE = join(DATA_DIR, 'events.jsonl');

// Event types for wallet scan
export type MetricEventType =
  | 'wallet_scan_started'
  | 'wallet_scan_completed'
  | 'wallet_scan_error'
  | 'wallet_scan_add_selected'
  | 'watchlist_token_added'
  | 'watchlist_token_removed'
  | 'radar_signal_generated'
  | 'telegram_connected'
  | 'session_started';

// Base event structure
export interface MetricEvent {
  type: MetricEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

// Wallet scan specific events
export interface WalletScanStartedEvent extends MetricEvent {
  type: 'wallet_scan_started';
  data: {
    chainId: number;
    provider: string;
    strict: boolean;
    minUsd: number;
  };
}

export interface WalletScanCompletedEvent extends MetricEvent {
  type: 'wallet_scan_completed';
  data: {
    chainId: number;
    provider: string;
    tokensFound: number;
    tokensPriced: number;
    spamFiltered: number;
    durationMs: number;
    cached: boolean;
  };
}

export interface WalletScanAddSelectedEvent extends MetricEvent {
  type: 'wallet_scan_add_selected';
  data: {
    selectedCount: number;
    addedCount: number;
    minUsd: number;
    provider: string;
    strict: boolean;
    chainId: number;
    filteredSpam: number;
  };
}

// Summary statistics
export interface MetricsSummary {
  period: {
    start: number;
    end: number;
    hours: number;
  };
  walletScans: {
    total: number;
    successful: number;
    errors: number;
    byChain: Record<number, number>;
    byProvider: Record<string, number>;
    avgDurationMs: number;
    cacheHitRate: number;
  };
  tokenAdditions: {
    total: number;
    fromScan: number;
    avgPerScan: number;
  };
  radarSignals: {
    total: number;
    byType: Record<string, number>;
  };
  engagement: {
    telegramConnections: number;
    uniqueSessions: number;
  };
}

// Ensure data directory exists
async function ensureDataDir(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

/**
 * Track a metric event
 */
export async function trackEvent(event: MetricEvent): Promise<void> {
  try {
    await ensureDataDir();

    const line = JSON.stringify({
      ...event,
      timestamp: event.timestamp || Date.now(),
    }) + '\n';

    await appendFile(EVENTS_FILE, line, 'utf8');
  } catch (err) {
    // Don't throw - metrics should never break the main app
    console.error('[Metrics] Failed to track event:', err);
  }
}

/**
 * Track wallet scan start
 */
export async function trackScanStarted(
  chainId: number,
  provider: string,
  strict: boolean,
  minUsd: number,
): Promise<void> {
  await trackEvent({
    type: 'wallet_scan_started',
    timestamp: Date.now(),
    data: { chainId, provider, strict, minUsd },
  });
}

/**
 * Track wallet scan completion
 */
export async function trackScanCompleted(
  chainId: number,
  provider: string,
  tokensFound: number,
  tokensPriced: number,
  spamFiltered: number,
  durationMs: number,
  cached: boolean,
): Promise<void> {
  await trackEvent({
    type: 'wallet_scan_completed',
    timestamp: Date.now(),
    data: {
      chainId,
      provider,
      tokensFound,
      tokensPriced,
      spamFiltered,
      durationMs,
      cached,
    },
  });
}

/**
 * Track tokens added from scan
 */
export async function trackAddSelected(
  selectedCount: number,
  addedCount: number,
  minUsd: number,
  provider: string,
  strict: boolean,
  chainId: number,
  filteredSpam: number,
): Promise<void> {
  await trackEvent({
    type: 'wallet_scan_add_selected',
    timestamp: Date.now(),
    data: {
      selectedCount,
      addedCount,
      minUsd,
      provider,
      strict,
      chainId,
      filteredSpam,
    },
  });
}

/**
 * Track wallet scan error
 */
export async function trackScanError(
  chainId: number,
  provider: string,
  errorType: string,
): Promise<void> {
  await trackEvent({
    type: 'wallet_scan_error',
    timestamp: Date.now(),
    data: { chainId, provider, errorType },
  });
}

/**
 * Read events from JSONL file
 */
async function readEvents(sinceTimestamp: number): Promise<MetricEvent[]> {
  try {
    await ensureDataDir();

    if (!existsSync(EVENTS_FILE)) {
      return [];
    }

    const content = await readFile(EVENTS_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);

    const events: MetricEvent[] = [];
    for (const line of lines) {
      try {
        const event = JSON.parse(line) as MetricEvent;
        if (event.timestamp >= sinceTimestamp) {
          events.push(event);
        }
      } catch {
        // Skip malformed lines
      }
    }

    return events;
  } catch (err) {
    console.error('[Metrics] Failed to read events:', err);
    return [];
  }
}

/**
 * Get metrics summary for time period
 */
export async function getSummary(hours: number = 24): Promise<MetricsSummary> {
  const now = Date.now();
  const start = now - hours * 60 * 60 * 1000;

  const events = await readEvents(start);

  // Initialize summary
  const summary: MetricsSummary = {
    period: {
      start,
      end: now,
      hours,
    },
    walletScans: {
      total: 0,
      successful: 0,
      errors: 0,
      byChain: {},
      byProvider: {},
      avgDurationMs: 0,
      cacheHitRate: 0,
    },
    tokenAdditions: {
      total: 0,
      fromScan: 0,
      avgPerScan: 0,
    },
    radarSignals: {
      total: 0,
      byType: {},
    },
    engagement: {
      telegramConnections: 0,
      uniqueSessions: 0,
    },
  };

  // Process events
  let totalDuration = 0;
  let durationCount = 0;
  let cacheHits = 0;
  let scanCompletions = 0;

  for (const event of events) {
    switch (event.type) {
      case 'wallet_scan_started':
        summary.walletScans.total++;
        break;

      case 'wallet_scan_completed': {
        const data = event.data as WalletScanCompletedEvent['data'];
        summary.walletScans.successful++;
        scanCompletions++;

        // Track by chain
        summary.walletScans.byChain[data.chainId] =
          (summary.walletScans.byChain[data.chainId] || 0) + 1;

        // Track by provider
        summary.walletScans.byProvider[data.provider] =
          (summary.walletScans.byProvider[data.provider] || 0) + 1;

        // Duration
        if (data.durationMs) {
          totalDuration += data.durationMs;
          durationCount++;
        }

        // Cache hits
        if (data.cached) {
          cacheHits++;
        }
        break;
      }

      case 'wallet_scan_error':
        summary.walletScans.errors++;
        break;

      case 'wallet_scan_add_selected': {
        const data = event.data as WalletScanAddSelectedEvent['data'];
        summary.tokenAdditions.fromScan += data.addedCount;
        summary.tokenAdditions.total += data.addedCount;
        break;
      }

      case 'watchlist_token_added':
        summary.tokenAdditions.total++;
        break;

      case 'radar_signal_generated': {
        summary.radarSignals.total++;
        const signalType = String(event.data.type || 'unknown');
        summary.radarSignals.byType[signalType] =
          (summary.radarSignals.byType[signalType] || 0) + 1;
        break;
      }

      case 'telegram_connected':
        summary.engagement.telegramConnections++;
        break;

      case 'session_started':
        summary.engagement.uniqueSessions++;
        break;
    }
  }

  // Calculate averages
  if (durationCount > 0) {
    summary.walletScans.avgDurationMs = Math.round(totalDuration / durationCount);
  }

  if (scanCompletions > 0) {
    summary.walletScans.cacheHitRate = cacheHits / scanCompletions;
    summary.tokenAdditions.avgPerScan = summary.tokenAdditions.fromScan / scanCompletions;
  }

  return summary;
}

/**
 * Get raw events for debugging (limited)
 */
export async function getRecentEvents(
  limit: number = 100,
  type?: MetricEventType,
): Promise<MetricEvent[]> {
  const events = await readEvents(0);

  let filtered = events;
  if (type) {
    filtered = events.filter((e) => e.type === type);
  }

  return filtered.slice(-limit);
}
