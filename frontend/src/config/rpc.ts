/**
 * Public JSON-RPC configuration (read-only paths).
 *
 * Browser JsonRpcProvider requires absolute URLs (not root-relative `/rpc/...`).
 * Production: same-origin absolute proxy first (`https://dex.kobbex.com/rpc/eth|bsc`) — no API keys in bundle.
 * Never put private RPC API keys in `VITE_*` env (Vite ships them in the public JS bundle).
 *
 * Optional local override: `VITE_ETHEREUM_RPC_URL` / `VITE_BSC_RPC_URL` (dev/ops only; do not commit secrets).
 * Optional extras: `VITE_BSC_READ_RPC_URLS` (comma-separated https URLs).
 */

/**
 * Ordered fallbacks for Ethereum mainnet read traffic (after env override).
 *
 * Order matters — the candidate loop in `getEthereumReadProvider` / `resolveReadProvider`
 * probes URLs sequentially with `JSONRPC_TIMEOUT_MS` per attempt and keeps the first that
 * answers. Add new public RPCs at the end to preserve hot-cache behavior on the existing
 * winners.
 */
export const ETHEREUM_READ_RPC_URLS: readonly string[] = [
  'https://ethereum.publicnode.com',
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com',
  'https://eth-mainnet.public.blastapi.io',
  'https://eth.drpc.org',
] as const;

/** Ordered fallbacks for BSC read traffic (after env override). */
export const BSC_READ_RPC_URLS: readonly string[] = [
  'https://bsc-dataseed.binance.org',
  'https://bsc-dataseed1.binance.org',
] as const;

/** Default timeout per RPC probe / health check (ms). */
export const JSONRPC_TIMEOUT_MS = 12_000;

/** Same-origin absolute RPC proxy (nginx → backend-signals). No secrets in bundle. */
export function getSameOriginRpcProxyUrl(chain: 'eth' | 'bsc'): string | null {
  if (typeof window === 'undefined') return null;
  const origin = window.location?.origin;
  if (!origin || origin === 'null') return null;
  return `${origin.replace(/\/+$/, '')}/rpc/${chain}`;
}

function prependUniqueCandidate(url: string | null, candidates: string[]): string[] {
  if (!url) return candidates;
  const normalized = url.replace(/\/+$/, '');
  return [url, ...candidates.filter((u) => u.replace(/\/+$/, '') !== normalized)];
}

/**
 * Candidate URLs: optional env override, then same-origin proxy (prod), then public fallbacks.
 */
export function getEthereumReadRpcCandidates(): string[] {
  const env = import.meta.env.VITE_ETHEREUM_RPC_URL?.trim();
  const base = [...ETHEREUM_READ_RPC_URLS];
  if (env && /^https?:\/\//i.test(env)) {
    return prependUniqueCandidate(env, base);
  }
  const proxy = import.meta.env.PROD ? getSameOriginRpcProxyUrl('eth') : null;
  return prependUniqueCandidate(proxy, base);
}

/** Primary URL for static config (e.g. CHAINS.ethereum.rpcUrl). */
export function getPrimaryEthereumReadRpcUrl(): string {
  const c = getEthereumReadRpcCandidates();
  return c[0] ?? ETHEREUM_READ_RPC_URLS[0];
}

function parseCommaSeparatedRpcUrls(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((u) => /^https?:\/\//i.test(u));
}

/**
 * Candidate URLs:
 * - `VITE_BSC_RPC_URL` first (if valid https)
 * - optional `VITE_BSC_READ_RPC_URLS` (comma-separated https URLs)
 * - then `BSC_READ_RPC_URLS` fallbacks (deduped)
 */
export function getBscReadRpcCandidates(): string[] {
  const envPrimary = import.meta.env.VITE_BSC_RPC_URL?.trim();
  const envExtras = parseCommaSeparatedRpcUrls(import.meta.env.VITE_BSC_READ_RPC_URLS);
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (u: string) => {
    const normalized = u.replace(/\/+$/, '');
    if (seen.has(normalized)) return;
    seen.add(normalized);
    out.push(u);
  };

  if (envPrimary && /^https?:\/\//i.test(envPrimary)) {
    push(envPrimary);
  }
  for (const u of envExtras) {
    push(u);
  }
  if (import.meta.env.PROD) {
    const proxy = getSameOriginRpcProxyUrl('bsc');
    if (proxy) {
      push(proxy);
    }
  }
  for (const u of BSC_READ_RPC_URLS) {
    push(u);
  }
  return out.length > 0 ? out : [...BSC_READ_RPC_URLS];
}

/** Primary BSC read URL for static config and services. */
export function getPrimaryBscReadRpcUrl(): string {
  const c = getBscReadRpcCandidates();
  return c[0] ?? BSC_READ_RPC_URLS[0];
}

export function raceWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`RPC timeout after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
