/**
 * Metrics Storage
 *
 * JSONL file-based event storage for privacy-safe analytics.
 * Each line is one JSON event object.
 *
 * Radar: Metrics MVP
 */

import { appendFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

const EVENTS_FILE = process.env.METRICS_FILE || "./data/events.jsonl";

// Ensure data directory exists
const dataDir = dirname(EVENTS_FILE);
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

export interface MetricEvent {
  ts: number; // Unix timestamp ms
  event: string; // Event name
  wallet?: string; // Short wallet (0x1234...abcd)
  chainId?: number; // Chain ID
  meta?: Record<string, any>; // Event-specific data
}

/**
 * Append event to JSONL file
 */
export function logEvent(event: MetricEvent): void {
  try {
    const line = JSON.stringify(event) + "\n";
    appendFileSync(EVENTS_FILE, line, "utf8");
  } catch (err: any) {
    console.error("[Metrics] Failed to write event:", err.message);
  }
}

/**
 * Read events within time range
 */
export function getEvents(startTs: number, endTs: number): MetricEvent[] {
  if (!existsSync(EVENTS_FILE)) {
    return [];
  }

  try {
    const content = readFileSync(EVENTS_FILE, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);

    const events: MetricEvent[] = [];
    for (const line of lines) {
      try {
        const event = JSON.parse(line) as MetricEvent;
        if (event.ts >= startTs && event.ts <= endTs) {
          events.push(event);
        }
      } catch {
        // Skip malformed lines
      }
    }

    return events;
  } catch (err: any) {
    console.error("[Metrics] Failed to read events:", err.message);
    return [];
  }
}

/**
 * Get event counts by name within time range
 */
export function getEventCounts(
  startTs: number,
  endTs: number
): Record<string, number> {
  const events = getEvents(startTs, endTs);
  const counts: Record<string, number> = {};

  for (const event of events) {
    counts[event.event] = (counts[event.event] || 0) + 1;
  }

  return counts;
}

/**
 * Get events by name within time range
 */
export function getEventsByName(
  eventName: string,
  startTs: number,
  endTs: number
): MetricEvent[] {
  return getEvents(startTs, endTs).filter((e) => e.event === eventName);
}

/**
 * Short wallet format for privacy
 */
export function shortWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
