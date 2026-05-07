/**
 * Production monitoring: console + localStorage outbox with best-effort POST to the ledger API.
 * Never throws; never blocks swap flows; no private keys in wire payloads.
 */

import { API_BASE_URL } from '@/config/api';

function isTruthyEnvFlag(raw: string | undefined): boolean {
  if (typeof raw !== 'string') return false;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

/** POST ingest only when explicitly enabled (default off when unset). */
export function isMonitoringIngestEnabled(): boolean {
  return isTruthyEnvFlag(import.meta.env.VITE_MONITORING_INGEST_ENABLED);
}

function isDebugMonitoringConsole(): boolean {
  return import.meta.env.DEV || isTruthyEnvFlag(import.meta.env.VITE_DEBUG_MONITORING);
}

const PAUSE_404_SESSION_KEY = 'swaperex-monitoring-ingest-paused-404';

function isIngestPausedAfter404(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem(PAUSE_404_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function setIngestPausedAfter404(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(PAUSE_404_SESSION_KEY, '1');
  } catch {
    // ignore
  }
}

export type ProductionMonitoringPayload = Record<string, unknown>;

/** Persisted to the outbox and eligible for `POST /api/v1/monitoring/events`. */
export const PERSISTED_MONITORING_EVENTS = [
  'swap_success',
  'swap_failure',
  'quote_failure',
  'rpc_failure',
  'commission_missing',
] as const;

export type PersistedMonitoringEventName = (typeof PERSISTED_MONITORING_EVENTS)[number];

/**
 * Alert-oriented event names (subset of persisted). Use for dashboards / paging rules.
 * `swap_success` remains persisted for revenue reconciliation but is not an "alert".
 */
export const MONITORING_ALERT_EVENT_TYPES = [
  'commission_missing',
  'swap_failure',
  'quote_failure',
  'rpc_failure',
] as const;

export type MonitoringAlertEventType = (typeof MONITORING_ALERT_EVENT_TYPES)[number];

const STORAGE_KEY = 'swaperex-monitoring-buffer';
const SESSION_KEY = 'swaperex-monitoring-session-id';
/** Max rows in the outbox (oldest dropped on overflow). */
const OUTBOX_CAP = 150;
const SCHEMA_VERSION = 1 as const;

const FLUSH_DEBOUNCE_MS = 2000;
const FLUSH_REQUEST_TIMEOUT_MS = 12_000;
const PERIODIC_FLUSH_MS = 120_000;

type StoredBuffer = {
  v: number;
  /** Monotonic sequence for acknowledging delivered events after successful POST. */
  nextSeq: number;
  events: Array<Record<string, unknown>>;
};

function isPersistedEventName(event: string): event is PersistedMonitoringEventName {
  return (PERSISTED_MONITORING_EVENTS as readonly string[]).includes(event);
}

function getOrCreateSessionId(): string {
  if (typeof sessionStorage === 'undefined') return 'ssr';
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `sess-${Date.now()}`;
  }
}

function migrateBuffer(parsed: unknown): StoredBuffer {
  if (!parsed || typeof parsed !== 'object') {
    return { v: SCHEMA_VERSION, nextSeq: 1, events: [] };
  }
  const p = parsed as Partial<StoredBuffer> & { events?: unknown };
  const rawEvents = Array.isArray(p.events) ? p.events : [];
  let maxSeq = 0;
  const events: Array<Record<string, unknown>> = [];
  for (const raw of rawEvents) {
    if (!raw || typeof raw !== 'object') continue;
    const e = { ...(raw as Record<string, unknown>) };
    let seq = typeof e._outboxSeq === 'number' && e._outboxSeq >= 1 ? Math.floor(e._outboxSeq) : 0;
    if (seq === 0) {
      seq = maxSeq + 1;
    }
    e._outboxSeq = seq;
    maxSeq = Math.max(maxSeq, seq);
    events.push(e);
  }
  let nextSeq = typeof p.nextSeq === 'number' && p.nextSeq >= 1 ? Math.floor(p.nextSeq) : maxSeq + 1;
  if (nextSeq <= maxSeq) nextSeq = maxSeq + 1;
  return { v: SCHEMA_VERSION, nextSeq, events };
}

function readBuffer(): StoredBuffer {
  if (typeof localStorage === 'undefined') return { v: SCHEMA_VERSION, nextSeq: 1, events: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { v: SCHEMA_VERSION, nextSeq: 1, events: [] };
    const parsed = JSON.parse(raw) as unknown;
    return migrateBuffer(parsed);
  } catch {
    return { v: SCHEMA_VERSION, nextSeq: 1, events: [] };
  }
}

function writeBuffer(buf: StoredBuffer): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const trimmedEvents = buf.events.slice(-OUTBOX_CAP);
    const trimmed: StoredBuffer = {
      v: SCHEMA_VERSION,
      nextSeq: buf.nextSeq,
      events: trimmedEvents,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // quota / private mode — drop persistence silently
  }
}

/** Strip internal fields and obvious secret key names before sending. */
function sanitizeEventForWire(evt: Record<string, unknown>): Record<string, unknown> {
  const { _outboxSeq: _seq, ...rest } = evt;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (/privateKey|private_key|secret|mnemonic|seedPhrase|seed_phrase/i.test(k)) {
      continue;
    }
    out[k] = v;
  }
  return out;
}

function appendToBuffer(record: Record<string, unknown>): void {
  const buf = readBuffer();
  while (buf.events.length >= OUTBOX_CAP) {
    buf.events.shift();
  }
  const seq = buf.nextSeq++;
  buf.events.push({ ...record, _outboxSeq: seq });
  writeBuffer(buf);
}

function acknowledgeMonitoringEventsUpTo(maxSeq: number): void {
  if (maxSeq < 1) return;
  const buf = readBuffer();
  buf.events = buf.events.filter((e) => {
    const s = e._outboxSeq;
    return !(typeof s === 'number' && s <= maxSeq);
  });
  writeBuffer(buf);
}

/**
 * Absolute URL for `POST /api/v1/monitoring/events`.
 * Dev base is `http://localhost:8000` (no `/api/v1`); prod base is `/api/v1`.
 */
export function getMonitoringIngestUrl(): string {
  const base = API_BASE_URL.replace(/\/+$/, '');
  if (base.startsWith('http')) {
    return `${base}/api/v1/monitoring/events`;
  }
  return `${base}/monitoring/events`;
}

export type MonitoringBatchEnvelope = {
  schemaVersion: typeof SCHEMA_VERSION;
  clientSessionId: string;
  /** When this batch object was materialized (ms). */
  exportedAt: number;
  /** Copy of buffered rows; server should treat as append-only. */
  events: Array<Record<string, unknown>>;
};

export function getMonitoringBatchEnvelope(): MonitoringBatchEnvelope {
  const buf = readBuffer();
  return {
    schemaVersion: SCHEMA_VERSION,
    clientSessionId: getOrCreateSessionId(),
    exportedAt: Date.now(),
    events: buf.events.map((e) => sanitizeEventForWire(e)),
  };
}

/** Clear persisted outbox (e.g. after successful upload). */
export function clearMonitoringBuffer(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getBufferedMonitoringCount(): number {
  return readBuffer().events.length;
}

let flushDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight = false;
let bridgeStarted = false;

/**
 * Best-effort POST of the current outbox. Fails silently; does not throw.
 * On HTTP 2xx, removes acknowledged events (by `_outboxSeq`) so unsent rows retry later.
 */
export async function flushMonitoringOutbox(): Promise<void> {
  if (typeof fetch === 'undefined') return;
  if (!isMonitoringIngestEnabled()) return;
  if (isIngestPausedAfter404()) return;
  if (flushInFlight) return;
  const buf = readBuffer();
  if (buf.events.length === 0) return;

  const maxSeq = buf.events.reduce((acc, e) => {
    const s = e._outboxSeq;
    return typeof s === 'number' && s > acc ? s : acc;
  }, 0);
  if (maxSeq < 1) return;

  const envelope: MonitoringBatchEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    clientSessionId: getOrCreateSessionId(),
    exportedAt: Date.now(),
    events: buf.events.map((e) => sanitizeEventForWire(e)),
  };

  flushInFlight = true;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), FLUSH_REQUEST_TIMEOUT_MS);
    const res = await fetch(getMonitoringIngestUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(envelope),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    if (res.status === 404) {
      setIngestPausedAfter404();
      return;
    }
    if (res.ok) {
      acknowledgeMonitoringEventsUpTo(maxSeq);
    }
  } catch {
    // API unavailable or blocked — keep outbox for retry
  } finally {
    flushInFlight = false;
  }
}

/** Debounced flush after new persisted events (never await from swap paths). */
export function scheduleMonitoringFlush(): void {
  if (typeof window === 'undefined') return;
  if (flushDebounceTimer) clearTimeout(flushDebounceTimer);
  flushDebounceTimer = setTimeout(() => {
    flushDebounceTimer = null;
    void flushMonitoringOutbox();
  }, FLUSH_DEBOUNCE_MS);
}

/**
 * Visibility + periodic retry. Safe to call once from the app entry module.
 */
export function startMonitoringOutboxBridge(): void {
  if (typeof window === 'undefined' || bridgeStarted) return;
  bridgeStarted = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      scheduleMonitoringFlush();
    }
  });
  window.setInterval(() => {
    scheduleMonitoringFlush();
  }, PERIODIC_FLUSH_MS);
}

/**
 * Log one structured event to console and optionally persist for batch export / ingest.
 */
export function logProductionEvent(event: string, fields: ProductionMonitoringPayload = {}): void {
  const row: Record<string, unknown> = {
    event,
    ts: Date.now(),
    ...fields,
  };
  if (isDebugMonitoringConsole()) {
    try {
      console.log(JSON.stringify(row));
    } catch {
      // ignore
    }
  }

  if (!isPersistedEventName(event)) return;

  try {
    appendToBuffer({
      ...row,
      _clientSessionId: getOrCreateSessionId(),
    });
    if (isMonitoringIngestEnabled() && !isIngestPausedAfter404()) {
      scheduleMonitoringFlush();
    }
  } catch {
    // ignore
  }
}
