/**
 * Minimal persistence for in-flight swap transactions (client-side only).
 * Survives refresh so users can recover traceability and avoid premature retries.
 */

export const PENDING_SWAP_STORAGE_KEY = 'swaperex-pending-swap-v1';

/** Drop stale entries so localStorage does not accumulate forever */
export const PENDING_SWAP_MAX_AGE_MS = 48 * 60 * 60 * 1000;

export type PendingSwapV1 = {
  v: 1;
  chainId: number;
  /** Wallet that signed (lowercase) */
  fromAddress: string;
  txHash: string;
  explorerUrl: string;
  submittedAt: number;
  fromSymbol: string;
  toSymbol: string;
  fromAmount: string;
  toAmount: string;
  /**
   * Set when the app lost RPC during confirmation or hit an ambiguous error.
   * Explorer is authoritative; do not treat UI error as final on-chain failure.
   */
  outcomeUncertain?: boolean;
};

function parsePendingSwapRaw(raw: string | null): PendingSwapV1 | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<PendingSwapV1>;
    if (o.v !== 1) return null;
    if (
      typeof o.chainId !== 'number' ||
      typeof o.fromAddress !== 'string' ||
      typeof o.txHash !== 'string' ||
      typeof o.explorerUrl !== 'string' ||
      typeof o.submittedAt !== 'number' ||
      typeof o.fromSymbol !== 'string' ||
      typeof o.toSymbol !== 'string' ||
      typeof o.fromAmount !== 'string' ||
      typeof o.toAmount !== 'string'
    ) {
      return null;
    }
    return o as PendingSwapV1;
  } catch {
    return null;
  }
}

export function readPendingSwap(): PendingSwapV1 | null {
  try {
    const p = parsePendingSwapRaw(localStorage.getItem(PENDING_SWAP_STORAGE_KEY));
    if (!p) return null;
    if (Date.now() - p.submittedAt > PENDING_SWAP_MAX_AGE_MS) {
      localStorage.removeItem(PENDING_SWAP_STORAGE_KEY);
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

export function writePendingSwap(entry: Omit<PendingSwapV1, 'v'>): void {
  try {
    const payload: PendingSwapV1 = { v: 1, ...entry, outcomeUncertain: false };
    localStorage.setItem(PENDING_SWAP_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function markPendingSwapOutcomeUncertain(): void {
  try {
    const p = parsePendingSwapRaw(localStorage.getItem(PENDING_SWAP_STORAGE_KEY));
    if (!p) return;
    const next: PendingSwapV1 = { ...p, outcomeUncertain: true };
    localStorage.setItem(PENDING_SWAP_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

export function clearPendingSwap(): void {
  try {
    localStorage.removeItem(PENDING_SWAP_STORAGE_KEY);
  } catch {
    /* noop */
  }
}

/** Returns stored row only if it matches the active wallet chain and address */
export function getPendingSwapForAccount(chainId: number, address: string): PendingSwapV1 | null {
  const p = readPendingSwap();
  if (!p) return null;
  if (p.chainId !== chainId) return null;
  if (p.fromAddress.toLowerCase() !== address.toLowerCase()) return null;
  return p;
}
