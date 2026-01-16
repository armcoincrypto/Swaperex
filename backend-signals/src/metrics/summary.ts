/**
 * Metrics Summary
 *
 * Aggregates events into useful product metrics.
 *
 * Radar: Metrics MVP
 */

import { getEvents, getEventCounts, MetricEvent } from "./storage.js";

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
 * Calculate metrics summary for given time range
 */
export function calculateSummary(hours: number = 24): MetricsSummary {
  const now = Date.now();
  const from = now - hours * 60 * 60 * 1000;

  // Get all events in range
  const events = getEvents(from, now);
  const counts = getEventCounts(from, now);

  // Scan metrics
  const scanCompleted = events.filter((e) => e.event === "wallet_scan_completed");
  const scanAddSelected = events.filter((e) => e.event === "wallet_scan_add_selected");

  let totalDuration = 0;
  let totalProviderTokens = 0;
  let totalFinalTokens = 0;
  let emptyScans = 0;

  for (const scan of scanCompleted) {
    const meta = scan.meta || {};
    totalDuration += meta.durationMs || 0;
    totalProviderTokens += meta.providerTokens || 0;
    totalFinalTokens += meta.finalTokens || 0;
    if ((meta.finalTokens || 0) === 0) {
      emptyScans++;
    }
  }

  const totalScans = scanCompleted.length;
  const avgDurationMs = totalScans > 0 ? Math.round(totalDuration / totalScans) : 0;
  const avgProviderTokens = totalScans > 0 ? round2(totalProviderTokens / totalScans) : 0;
  const avgFinalTokens = totalScans > 0 ? round2(totalFinalTokens / totalScans) : 0;
  const emptyRate = totalScans > 0 ? round3(emptyScans / totalScans) : 0;

  // Conversion metrics
  const addEvents = scanAddSelected.length;
  const scanToAdd = totalScans > 0 ? round3(addEvents / totalScans) : 0;

  let totalTokensAdded = 0;
  for (const add of scanAddSelected) {
    totalTokensAdded += add.meta?.addedCount || 0;
  }
  const avgTokensAdded = addEvents > 0 ? round2(totalTokensAdded / addEvents) : 0;

  // Telegram metrics
  const telegramConnected = counts["telegram_connected"] || 0;
  const alertsSent = counts["telegram_alert_sent"] || 0;

  return {
    range: {
      hours,
      from,
      to: now,
    },
    events: counts,
    scanMetrics: {
      totalScans,
      avgDurationMs,
      avgProviderTokens,
      avgFinalTokens,
      emptyScans,
      emptyRate,
    },
    conversionMetrics: {
      scanToAdd,
      avgTokensAdded,
    },
    telegramMetrics: {
      connected: telegramConnected,
      alertsSent,
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
