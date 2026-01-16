/**
 * Metrics Module
 *
 * Privacy-safe event tracking for product analytics.
 *
 * Radar: Metrics MVP
 */

export { logEvent, getEvents, getEventCounts, shortWallet, MetricEvent } from "./storage.js";
export { calculateSummary, MetricsSummary } from "./summary.js";
