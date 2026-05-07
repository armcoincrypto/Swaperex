/**
 * Public JSON-RPC configuration (read-only paths).
 *
 * Browser JsonRpcProvider requires absolute https URLs — never use same-origin `/rpc/*`
 * for ethers; those proxies often lack full JSON-RPC or trigger UNSUPPORTED_OPERATION.
 *
 * Prefer `VITE_ETHEREUM_RPC_URL` / `VITE_BSC_RPC_URL` in production (e.g. Dwellir).
 * Optional comma-separated extras: `VITE_BSC_READ_RPC_URLS` (client-exposed via Vite).
 */

/** Ordered fallbacks for Ethereum mainnet read traffic (after env override). */
export const ETHEREUM_READ_RPC_URLS: readonly string[] = [
  'https://ethereum.publicnode.com',
  'https://rpc.ankr.com/eth',
] as const;

/** Ordered fallbacks for BSC read traffic (after env override). */
export const BSC_READ_RPC_URLS: readonly string[] = [
  'https://bsc-dataseed.binance.org',
  'https://bsc-dataseed1.binance.org',
] as const;

/** Default timeout per RPC probe / health check (ms). */
export const JSONRPC_TIMEOUT_MS = 12_000;

/**
 * Candidate URLs: optional `VITE_ETHEREUM_RPC_URL` first, then fallbacks (deduped).
 */
export function getEthereumReadRpcCandidates(): string[] {
  const env = import.meta.env.VITE_ETHEREUM_RPC_URL?.trim();
  const base = [...ETHEREUM_READ_RPC_URLS];
  if (env && /^https?:\/\//i.test(env)) {
    return [env, ...base.filter((u) => u !== env)];
  }
  return base;
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
