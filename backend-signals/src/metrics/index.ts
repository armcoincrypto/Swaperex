/**
 * Metrics Module
 *
 * Privacy-safe event tracking for product analytics.
 */

export { logEvent, getEvents, getEventCounts, shortWallet, isShortWallet } from './storage.js';
export type { MetricEvent } from './storage.js';

export { calculateSummary } from './summary.js';
export type { MetricsSummary } from './summary.js';
