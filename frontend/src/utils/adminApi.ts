/**
 * Read-only admin API helpers (P3.3 lifecycle, P3.4 health). No signing or custody.
 */

import { API_BASE_URL } from '@/config/api';

const ADMIN_TOKEN_SESSION_KEY = 'swaperex-admin-api-token';

export function getStoredAdminApiToken(): string {
  if (typeof sessionStorage === 'undefined') return '';
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_SESSION_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function setStoredAdminApiToken(token: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const t = token.trim();
    if (!t) sessionStorage.removeItem(ADMIN_TOKEN_SESSION_KEY);
    else sessionStorage.setItem(ADMIN_TOKEN_SESSION_KEY, t);
  } catch {
    // ignore
  }
}

export function resolveAdminApiToken(): string {
  const fromEnv =
    typeof import.meta.env.VITE_ADMIN_API_TOKEN === 'string'
      ? import.meta.env.VITE_ADMIN_API_TOKEN.trim()
      : '';
  return fromEnv || getStoredAdminApiToken();
}

/** Optional controlled token for embedded admin panels (e.g. Portfolio bridges Lifecycle + System). */
export type AdminSharedTokenProps = {
  adminToken?: string;
  onAdminTokenChange?: (token: string) => void;
};

export function adminLifecycleUrl(stallMinutes?: number): string {
  const base = API_BASE_URL.replace(/\/+$/, '');
  const q =
    stallMinutes != null && Number.isFinite(stallMinutes)
      ? `?stallMinutes=${encodeURIComponent(String(Math.round(stallMinutes)))}`
      : '';
  if (base.startsWith('http')) {
    return `${base}/api/v1/admin/lifecycle${q}`;
  }
  return `${base}/admin/lifecycle${q}`;
}

export type AdminLifecyclePayload = {
  lifecycle_taxonomy_version?: string;
  lifecycle_totals?: Record<string, number>;
  average_stage_durations_ms?: Record<string, number>;
  dropoff_by_stage?: Record<string, number>;
  stalled_flows?: Array<{
    swap_flow_id?: string;
    last_stage?: string;
    last_ts_ms?: number;
    stall_minutes_observed?: number;
    chain_id?: number | null;
    provider?: string | null;
  }>;
  recent_lifecycle_events?: Array<Record<string, unknown>>;
  recent_lifecycle_flows?: Array<{
    swap_flow_id?: string;
    last_ts_ms?: number;
    chain_id?: number | null;
    provider?: string | null;
    route_mode?: string | null;
    timeline?: Array<{ ts_ms?: number; stage?: string; tx_hash?: string | null }>;
  }>;
  lifecycle_success_rate?: number | null;
  lifecycle_failure_rate?: number | null;
  flows_observed?: number;
  flows_abandoned_count?: number;
  _meta?: Record<string, unknown>;
};

export type AdminHealthQuery = {
  windowMinutes?: number;
  stallMinutes?: number;
  minSwapSamples?: number;
  maxBatches?: number;
  swapFailureWarn?: number;
  swapFailureCrit?: number;
  ingestSilenceWarnMinutes?: number;
  ingestSilenceCritMinutes?: number;
};

export function adminHealthUrl(query?: AdminHealthQuery): string {
  const base = API_BASE_URL.replace(/\/+$/, '');
  const q = new URLSearchParams();
  if (query) {
    for (const [key, val] of Object.entries(query)) {
      if (val === undefined || val === null || (typeof val === 'number' && Number.isNaN(val))) continue;
      q.set(key, String(val));
    }
  }
  const qs = q.toString();
  const suffix = qs ? `?${qs}` : '';
  if (base.startsWith('http')) {
    return `${base}/api/v1/admin/health${suffix}`;
  }
  return `${base}/admin/health${suffix}`;
}

export type AdminHealthPayload = {
  operational_health_version?: string;
  evaluated_at?: string;
  window_minutes?: number;
  config?: Record<string, unknown>;
  ingest_heartbeat?: Record<string, unknown>;
  domains?: Record<
    string,
    {
      status?: string;
      score?: number;
      summary?: string;
      evidence?: unknown[];
      recent_metrics?: Record<string, unknown>;
    }
  >;
  overall?: { status?: string; score?: number; summary?: string };
  operational_incidents?: Array<Record<string, unknown>>;
  active_warnings?: Array<Record<string, unknown>>;
  recent_degradations?: Array<Record<string, unknown>>;
  health_timeline?: Array<Record<string, unknown>>;
  _meta?: Record<string, unknown>;
};

export async function fetchAdminHealth(
  token: string,
  query?: AdminHealthQuery,
): Promise<AdminHealthPayload> {
  const t = token.trim();
  if (!t) throw new Error('Admin API token is required');

  const res = await fetch(adminHealthUrl(query), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Admin-Token': t,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Health API ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as AdminHealthPayload;
}

export async function fetchAdminLifecycle(
  token: string,
  stallMinutes = 20,
): Promise<AdminLifecyclePayload> {
  const t = token.trim();
  if (!t) throw new Error('Admin API token is required');

  const res = await fetch(adminLifecycleUrl(stallMinutes), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Admin-Token': t,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Lifecycle API ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as AdminLifecyclePayload;
}
