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

/** Main backend API base. Prod: /api/v1 (relative). Dev: localhost:8000. */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_URL ??
  (isDev ? 'http://localhost:8000' : '/api/v1');

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

/**
 * 1inch Classic Swap v6.0 proxy (backend-signals). Browser never calls api.1inch.dev;
 * server injects ONEINCH_API_KEY. Same-origin pattern as /rpc and /coingecko.
 */
export const ONEINCH_PROXY_BASE: string =
  SIGNALS_API_URL.startsWith('/')
    ? '/oneinch'
    : SIGNALS_API_URL.replace(/\/api\/v1\/?$/, '') + '/oneinch';

/**
 * Path prefix for Classic Swap v6.0 (`/oneinch/swap/v6.0` or absolute in dev).
 */
export function getOneInchSwapV6Prefix(): string {
  const b = ONEINCH_PROXY_BASE.replace(/\/+$/, '');
  return `${b}/swap/v6.0`;
}

/**
 * Build a URL for 1inch proxy fetches.
 *
 * Root-relative bases like `/oneinch/...` cannot use single-arg `new URL(path)` in the browser
 * (throws "Invalid URL"). Use `path` + `window.location.origin`, or an already-absolute `http(s)` prefix.
 */
export function createOneInchSwapV6Url(pathUnderV6: string): URL {
  const prefix = getOneInchSwapV6Prefix().replace(/\/+$/, '');
  const path = `${prefix}/${pathUnderV6.replace(/^\/+/, '')}`;
  if (/^https?:\/\//i.test(path)) {
    return new URL(path);
  }
  const origin =
    typeof window !== 'undefined' && typeof window.location?.origin === 'string'
      ? window.location.origin
      : 'http://127.0.0.1:5173';
  return new URL(path, origin);
}

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
