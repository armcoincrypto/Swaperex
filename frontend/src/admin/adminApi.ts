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
