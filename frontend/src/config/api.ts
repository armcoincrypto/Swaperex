/**
 * API Configuration
 *
 * Single source of truth for API URLs. Exposed via Vite env vars.
 * Production: same-origin paths to avoid mixed content over HTTPS.
 * Dev: localhost for local backend servers.
 *
 * NO HTTP fallbacks - ensures prod always uses same-origin /api/v1, /coingecko.
 */

const isDev = import.meta.env.DEV;

/** Main backend API base. Proxy /api to 8000 in production. */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_URL ??
  (isDev ? 'http://localhost:8000' : '/api');

/** Signals backend API base. Proxy /api/v1 to 4001 in production. */
export const SIGNALS_API_URL: string =
  import.meta.env.VITE_SIGNALS_API_URL ??
  (isDev ? 'http://localhost:4001/api/v1' : '/api/v1');

/**
 * CoinGecko proxy base. Backend serves /coingecko/markets at root.
 * Prod: /coingecko (same-origin). Dev: localhost:4001/coingecko.
 */
export const COINGECKO_PROXY_BASE: string =
  SIGNALS_API_URL.startsWith('/')
    ? '/coingecko'
    : SIGNALS_API_URL.replace(/\/api\/v1\/?$/, '') + '/coingecko';

/**
 * RPC proxy base. Backend serves /rpc/:chain at root.
 * Prod: /rpc. Dev: localhost:4001/rpc.
 */
export const RPC_PROXY_BASE: string =
  SIGNALS_API_URL.startsWith('/')
    ? '/rpc'
    : SIGNALS_API_URL.replace(/\/api\/v1\/?$/, '') + '/rpc';

/**
 * Explorer proxy base. Backend serves /explorer/:chain at root.
 * Prod: /explorer. Dev: localhost:4001/explorer.
 */
export const EXPLORER_PROXY_BASE: string =
  SIGNALS_API_URL.startsWith('/')
    ? '/explorer'
    : SIGNALS_API_URL.replace(/\/api\/v1\/?$/, '') + '/explorer';

/** Whether signals use same-origin (relative) URLs. */
export const isSignalsSameOrigin = (): boolean =>
  !SIGNALS_API_URL || SIGNALS_API_URL.startsWith('/');

/**
 * Safely join signals base URL + path without double slashes.
 */
export function joinSignalsUrl(path: string): string {
  const base = SIGNALS_API_URL.replace(/\/+$/, '');
  const p = path.replace(/^\/+/, '');
  return p ? `${base}/${p}` : base;
}
