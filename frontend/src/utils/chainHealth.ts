/**
 * Chain Health Utilities
 *
 * Backoff calculation, stale TTL, debug mode, address redaction,
 * and formatting helpers for production portfolio hardening.
 */

import type { PortfolioChain, ChainBalance } from '@/services/portfolioTypes';

// ─── Types ────────────────────────────────────────────────────────

export type ChainHealthStatus = 'ok' | 'degraded' | 'down';

export interface ChainHealthState {
  status: ChainHealthStatus;
  failureCount: number;
  lastSuccessAt: number;
  lastErrorAt: number;
  lastError: string | null;
  lastLatencyMs: number | null;
  nextRetryAt: number;
  /** Last known good chain balance (for stale display) */
  staleData: ChainBalance | null;
}

export interface PricingStatus {
  lastFetchAt: number;
  lastError: string | null;
  cacheAgeMs: number;
  tokensPriced: number;
  tokensMissing: number;
}

// ─── Constants ────────────────────────────────────────────────────

/** Backoff schedule: 5s → 15s → 45s → 120s max */
export const BACKOFF_SCHEDULE_MS = [5_000, 15_000, 45_000, 120_000];

/** Jitter factor: ±20% */
export const BACKOFF_JITTER = 0.2;

/** Stale data TTL: 30 minutes (show last known data with warning) */
export const STALE_TTL_MS = 30 * 60 * 1000;

/** Number of consecutive failures before status changes from ok → degraded */
export const DEGRADED_THRESHOLD = 1;

/** Number of consecutive failures before status changes from degraded → down */
export const DOWN_THRESHOLD = 3;

/** Supported chains for portfolio */
export const PORTFOLIO_CHAINS: PortfolioChain[] = ['ethereum', 'bsc', 'polygon'];

/** Chain labels map */
export const CHAIN_LABELS: Record<string, string> = {
  ethereum: 'ETH',
  bsc: 'BSC',
  polygon: 'Polygon',
  arbitrum: 'Arbitrum',
  solana: 'Solana',
};

// ─── Backoff Functions ────────────────────────────────────────────

/** Calculate next retry timestamp with jitter */
export function calculateNextRetry(failureCount: number): number {
  const idx = Math.min(failureCount - 1, BACKOFF_SCHEDULE_MS.length - 1);
  const baseDelay = BACKOFF_SCHEDULE_MS[Math.max(0, idx)];
  const jitter = 1 + (Math.random() * 2 - 1) * BACKOFF_JITTER; // 0.8–1.2
  return Date.now() + Math.round(baseDelay * jitter);
}

/** Deterministic backoff calculation (for tests — no jitter) */
export function calculateBackoffDelay(failureCount: number): number {
  const idx = Math.min(failureCount - 1, BACKOFF_SCHEDULE_MS.length - 1);
  return BACKOFF_SCHEDULE_MS[Math.max(0, idx)];
}

/** Check if chain is in backoff period */
export function isInBackoff(health: ChainHealthState | undefined): boolean {
  if (!health || health.failureCount === 0) return false;
  return Date.now() < health.nextRetryAt;
}

/** Get chain health status from failure count */
export function getHealthStatus(failureCount: number): ChainHealthStatus {
  if (failureCount === 0) return 'ok';
  if (failureCount < DOWN_THRESHOLD) return 'degraded';
  return 'down';
}

/** Check if stale data is still usable */
export function isStaleDataValid(lastSuccessAt: number): boolean {
  return lastSuccessAt > 0 && Date.now() - lastSuccessAt < STALE_TTL_MS;
}

/** Create initial health state */
export function createInitialHealth(): ChainHealthState {
  return {
    status: 'ok',
    failureCount: 0,
    lastSuccessAt: 0,
    lastErrorAt: 0,
    lastError: null,
    lastLatencyMs: null,
    nextRetryAt: 0,
    staleData: null,
  };
}

// ─── Debug Mode ───────────────────────────────────────────────────

/** Check if debug mode is active (?debug=1 in URL) */
export function isDebugMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('debug') === '1';
  } catch {
    return false;
  }
}

// ─── Redaction ────────────────────────────────────────────────────

/** Redact wallet address: 0x1234…abcd */
export function redactAddress(address: string | null): string {
  if (!address || address.length < 10) return '(no address)';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Redact error message (strip URLs with keys, long hex strings) */
export function redactError(error: string | null): string {
  if (!error) return '(none)';
  // Strip API keys from URLs
  let redacted = error.replace(/[?&](api_?key|key|token|secret)=[^\s&]*/gi, '?***=REDACTED');
  // Truncate if too long
  if (redacted.length > 120) redacted = redacted.slice(0, 117) + '...';
  return redacted;
}

// ─── Formatting ───────────────────────────────────────────────────

/** Format milliseconds as relative time */
export function formatMsAgo(ts: number): string {
  if (ts === 0) return 'never';
  const ms = Date.now() - ts;
  if (ms < 1000) return 'just now';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

/** Format USD value with production rules:
 *  - 2 decimal places always
 *  - Values 0 < x < 0.01 → "< $0.01"
 *  - null/undefined/NaN → "—"
 *  - K/M suffixes for large values
 */
export function formatUsdStrict(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  if (num === 0) return '$0.00';
  if (num > 0 && num < 0.01) return '< $0.01';
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 10_000) return `$${(num / 1_000).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

/** Format USD with privacy mode */
export function formatUsdStrictPrivate(
  value: string | number | null | undefined,
  privacyMode: boolean
): string {
  if (privacyMode) return '****';
  return formatUsdStrict(value);
}
