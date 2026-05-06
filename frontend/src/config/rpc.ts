/**
 * Public JSON-RPC configuration (read-only paths).
 *
 * Browser JsonRpcProvider requires absolute https URLs — never use same-origin `/rpc/*`
 * for ethers; those proxies often lack full JSON-RPC or trigger UNSUPPORTED_OPERATION.
 */

/** Ordered fallbacks for Ethereum mainnet read traffic (portfolio, quotes using CHAINS). */
export const ETHEREUM_READ_RPC_URLS: readonly string[] = [
  'https://eth.llamarpc.com',
  'https://rpc.ankr.com/eth',
  'https://ethereum.publicnode.com',
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
