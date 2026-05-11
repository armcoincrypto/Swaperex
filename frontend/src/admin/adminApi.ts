/**
 * Admin panel API — isolated admin FastAPI.
 * Production: same-origin `/api/v1/admin/*` (nginx → :8001).
 * Dev: Vite proxies `/api/v1/admin` → :8001 (see vite.config.ts).
 */
export const ADMIN_API_ROOT: string = (
  import.meta.env.VITE_ADMIN_API_BASE_URL ?? '/api/v1'
).replace(/\/+$/, '');

export const ADMIN_TOKEN_SESSION_KEY = 'swaperex_admin_x_admin_token';

export function getStoredAdminToken(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_SESSION_KEY);
  } catch {
    return null;
  }
}

export function setStoredAdminToken(token: string): void {
  sessionStorage.setItem(ADMIN_TOKEN_SESSION_KEY, token);
}

export function clearStoredAdminToken(): void {
  sessionStorage.removeItem(ADMIN_TOKEN_SESSION_KEY);
}

/** Join admin API root (…/api/v1) with `admin/...` paths. */
export function adminApiUrl(pathUnderAdmin: string): string {
  const p = pathUnderAdmin.replace(/^\/+/, '');
  return `${ADMIN_API_ROOT}/${p}`;
}

export type AdminOverviewResponse = {
  service: string;
  status: string;
  monitoring_batch_count: number;
  monitoring_latest_received_at: string | null;
  frontend_health: { status: string; note: string };
};

async function adminFetch(path: string, token: string): Promise<Response> {
  return fetch(adminApiUrl(path), {
    headers: {
      Accept: 'application/json',
      'X-Admin-Token': token,
    },
  });
}

export async function fetchAdminHealth(token: string): Promise<void> {
  const res = await adminFetch('admin/health', token);
  if (!res.ok) throw new Error(`admin health ${res.status}`);
}

export async function fetchAdminOverview(token: string): Promise<AdminOverviewResponse> {
  const res = await adminFetch('admin/overview', token);
  if (!res.ok) throw new Error(`admin overview ${res.status}`);
  return (await res.json()) as AdminOverviewResponse;
}

export type AdminEventsBatchItem = {
  id: number;
  received_at: string;
  client_session_id: string;
  event_count: number;
  schema_version: number;
  event_names: string[];
  raw?: Record<string, unknown>;
};

export type AdminEventsResponse = {
  items: AdminEventsBatchItem[];
  total: number;
  limit: number;
  offset: number;
};

export type AdminEventsQuery = {
  limit?: number;
  offset?: number;
  event?: string;
  clientSessionId?: string;
  includeRaw?: boolean;
};

export async function fetchAdminEvents(
  token: string,
  params: AdminEventsQuery = {},
): Promise<AdminEventsResponse> {
  const q = new URLSearchParams();
  if (params.limit != null) q.set('limit', String(params.limit));
  if (params.offset != null) q.set('offset', String(params.offset));
  const ev = params.event?.trim();
  if (ev) q.set('event', ev);
  const sid = params.clientSessionId?.trim();
  if (sid) q.set('clientSessionId', sid);
  if (params.includeRaw) q.set('includeRaw', '1');
  const qs = q.toString();
  const path = qs ? `admin/events?${qs}` : 'admin/events';
  const res = await adminFetch(path, token);
  if (!res.ok) throw new Error(`admin events ${res.status}`);
  return (await res.json()) as AdminEventsResponse;
}

/** Flattened swap_success row from GET /api/v1/admin/swaps */
export type AdminSwapAnalyticsRow = {
  batch_id: number;
  timestamp: string;
  client_session_id: string;
  chain: number | null;
  route_mode: string | null;
  wrapper_route: string | null;
  commission_route: string | null;
  from_symbol: string | null;
  to_symbol: string | null;
  from_amount: string | null;
  quoted_output: string | null;
  minimum_received: string | null;
  protocol_fee_bps: number | null;
  user_received_source: string | null;
  gas_used: string | null;
  effective_gas_price: string | null;
  receipt_status: number | null;
  tx_hash: string | null;
  native_output: boolean;
  estimated_fee_usd: number | null;
  route_label: string;
  provider: string | null;
  raw_event: Record<string, unknown>;
};

export type AdminSwapsResponse = {
  items: AdminSwapAnalyticsRow[];
  total: number;
  limit: number;
  offset: number;
};

export type AdminSwapsQuery = {
  limit?: number;
  offset?: number;
  chain?: number;
  routeMode?: string;
  token?: string;
  walletSession?: string;
  successOnly?: boolean;
};

export async function fetchAdminSwaps(token: string, params: AdminSwapsQuery = {}): Promise<AdminSwapsResponse> {
  const q = new URLSearchParams();
  if (params.limit != null) q.set('limit', String(params.limit));
  if (params.offset != null) q.set('offset', String(params.offset));
  if (params.chain != null) q.set('chain', String(params.chain));
  const rm = params.routeMode?.trim();
  if (rm) q.set('routeMode', rm);
  const tk = params.token?.trim();
  if (tk) q.set('token', tk);
  const ws = params.walletSession?.trim();
  if (ws) q.set('walletSession', ws);
  if (params.successOnly === false) q.set('successOnly', 'false');
  const qs = q.toString();
  const path = qs ? `admin/swaps?${qs}` : 'admin/swaps';
  const res = await adminFetch(path, token);
  if (!res.ok) throw new Error(`admin swaps ${res.status}`);
  return (await res.json()) as AdminSwapsResponse;
}
