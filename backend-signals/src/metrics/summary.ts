/**
 * Metrics Summary Module
 *
 * Aggregation calculations for the metrics summary endpoint.
 */

import { getEvents, getEventCounts, type MetricEvent } from './storage.js';

export interface MetricsSummary {
  range: {
    hours: number;
    from: number;
    to: number;
  };
  events: Record<string, number>;
  scanMetrics: {
    totalScans: number;
    avgDurationMs: number;
    avgProviderTokens: number;
    avgFinalTokens: number;
    emptyScans: number;
    emptyRate: number;
    // Empty scan breakdown
    emptyByReason: {
      alreadyWatched: number;
      belowMin: number;
      providerEmpty: number;
      filteredSpam: number;
    };
  };
  conversionMetrics: {
    scanToAdd: number;
    avgTokensAdded: number;
  };
  telegramMetrics: {
    connected: number;
    alertsSent: number;
  };
}

/**
 * Calculate metrics summary for a time range
 */
export function calculateSummary(hours: number): MetricsSummary {
  const now = Date.now();
  const from = now - hours * 60 * 60 * 1000;
  const to = now;

  const events = getEvents(from, to);
  const counts = getEventCounts(from, to);

  // Calculate scan metrics
  const scanCompletedEvents = events.filter(
    (e) => e.event === 'wallet_scan_completed'
  );
  const addSelectedEvents = events.filter(
    (e) => e.event === 'wallet_scan_add_selected'
  );

  const totalScans = scanCompletedEvents.length;

  // Average duration
  const durations = scanCompletedEvents
    .map((e) => e.meta?.durationMs)
    .filter((d): d is number => typeof d === 'number');
  const avgDurationMs =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

  // Average provider tokens
  const providerTokens = scanCompletedEvents
    .map((e) => e.meta?.providerTokens)
    .filter((t): t is number => typeof t === 'number');
  const avgProviderTokens =
    providerTokens.length > 0
      ? Math.round((providerTokens.reduce((a, b) => a + b, 0) / providerTokens.length) * 10) / 10
      : 0;

  // Average final tokens
  const finalTokens = scanCompletedEvents
    .map((e) => e.meta?.finalTokens)
    .filter((t): t is number => typeof t === 'number');
  const avgFinalTokens =
    finalTokens.length > 0
      ? Math.round((finalTokens.reduce((a, b) => a + b, 0) / finalTokens.length) * 10) / 10
      : 0;

  // Empty scans (finalTokens === 0)
  const emptyScans = scanCompletedEvents.filter(
    (e) => e.meta?.finalTokens === 0
  ).length;
  const emptyRate = totalScans > 0 ? Math.round((emptyScans / totalScans) * 1000) / 1000 : 0;

  // Empty scan breakdown
  const emptyByReason = {
    alreadyWatched: scanCompletedEvents.filter(
      (e) => e.meta?.finalTokens === 0 && (e.meta?.alreadyWatched || 0) > 0
    ).length,
    belowMin: scanCompletedEvents.filter(
      (e) => e.meta?.finalTokens === 0 && (e.meta?.belowMin || 0) > 0
    ).length,
    providerEmpty: scanCompletedEvents.filter(
      (e) => e.meta?.providerTokens === 0
    ).length,
    filteredSpam: scanCompletedEvents.filter(
      (e) => e.meta?.finalTokens === 0 && (e.meta?.filteredSpam || 0) > 0
    ).length,
  };

  // Conversion metrics
  const scanToAdd =
    totalScans > 0
      ? Math.round((addSelectedEvents.length / totalScans) * 1000) / 1000
      : 0;

  const tokensAdded = addSelectedEvents
    .map((e) => e.meta?.addedCount)
    .filter((t): t is number => typeof t === 'number');
  const avgTokensAdded =
    tokensAdded.length > 0
      ? Math.round((tokensAdded.reduce((a, b) => a + b, 0) / tokensAdded.length) * 10) / 10
      : 0;

  // Telegram metrics
  const telegramConnected = counts['telegram_connected'] || 0;
  const telegramAlertsSent = counts['telegram_alert_sent'] || 0;

  return {
    range: {
      hours,
      from,
      to,
    },
    events: counts,
    scanMetrics: {
      totalScans,
      avgDurationMs,
      avgProviderTokens,
      avgFinalTokens,
      emptyScans,
      emptyRate,
      emptyByReason,
    },
    conversionMetrics: {
      scanToAdd,
      avgTokensAdded,
    },
    telegramMetrics: {
      connected: telegramConnected,
      alertsSent: telegramAlertsSent,
    },
  };
}
