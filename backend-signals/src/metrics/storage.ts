/**
 * Metrics Storage Module
 *
 * JSONL file storage for privacy-safe event tracking.
 * No PII stored - wallet addresses are shortened (0x1234...abcd).
 */

import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const EVENTS_FILE = join(DATA_DIR, 'events.jsonl');

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

export interface MetricEvent {
  ts: number;           // Unix timestamp ms
  event: string;        // Event name
  wallet?: string;      // Short wallet (0x1234...abcd) - optional
  chainId?: number;     // Chain ID - optional
  meta?: Record<string, any>;  // Event-specific data
}

/**
 * Append event to JSONL file
 */
export function logEvent(event: MetricEvent): void {
  try {
    const line = JSON.stringify(event) + '\n';
    appendFileSync(EVENTS_FILE, line, 'utf-8');
  } catch (err) {
    // Silent fail - metrics should never break the app
    console.error('[metrics] Failed to write event:', err);
  }
}

/**
 * Read events within time range
 */
export function getEvents(startTs: number, endTs: number): MetricEvent[] {
  try {
    if (!existsSync(EVENTS_FILE)) {
      return [];
    }

    const content = readFileSync(EVENTS_FILE, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

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
  } catch (err) {
    console.error('[metrics] Failed to read events:', err);
    return [];
  }
}

/**
 * Get event counts by name within time range
 */
export function getEventCounts(startTs: number, endTs: number): Record<string, number> {
  const events = getEvents(startTs, endTs);
  const counts: Record<string, number> = {};

  for (const event of events) {
    counts[event.event] = (counts[event.event] || 0) + 1;
  }

  return counts;
}

/**
 * Shorten wallet address for privacy
 */
export function shortWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Validate short wallet format
 */
export function isShortWallet(wallet: string): boolean {
  return /^0x[a-fA-F0-9]{4}\.\.\.[a-fA-F0-9]{4}$/.test(wallet);
}
