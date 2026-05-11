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
