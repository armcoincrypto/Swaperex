/**
 * Feature-flagged Uniswap V3 fee wrapper (Ethereum mainnet, ERC20→ERC20 only).
 * Defaults OFF — omit `VITE_UNISWAP_WRAPPER_ENABLED` or set falsy so direct SwapRouter02 path is unchanged.
 * Production deployment (verified): `0xe07f5940487a58E30F9fa711Be358FB036B0Fc44` — set via `VITE_UNISWAP_WRAPPER_ADDRESS` when enabling.
 *
 * FEE_BPS display: prefer one `eth_call` per browser session to the deployed wrapper (immutable `FEE_BPS`),
 * with env `VITE_UNISWAP_WRAPPER_FEE_BPS` as fallback and drift warning in console.
 */

import { getAddress, isAddress, type Provider } from 'ethers';
import { getTokenBySymbol, isNativeToken, type Token } from '@/tokens';

/** Public getter for `uint16 public immutable FEE_BPS` on SwaperexUniswapV3FeeWrapper. */
const WRAPPER_FEE_BPS_ABI = [
  {
    inputs: [],
    name: 'FEE_BPS',
    outputs: [{ name: '', type: 'uint16' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/** Successful on-chain read (basis points), else undefined. */
let sessionChainWrapperFeeBps: number | undefined;
/** True after a read attempt was made with a connected `provider` (success or failure). */
let sessionChainWrapperFeeReadFinished = false;

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

function parseEnvBoolean(raw: string | undefined): boolean {
  if (raw === undefined || raw === null) return false;
  return ENABLED_VALUES.has(String(raw).trim().toLowerCase());
}

/** Display-only; must match deployed wrapper immutables unless overridden for UI copy. */
const DEFAULT_WRAPPER_FEE_BPS = 20;

export interface UniswapWrapperConfig {
  enabled: boolean;
  wrapperAddress: string | null;
  /** Basis points shown in UI (default 20 = 0.20%). */
  feeBpsDisplay: number;
}

function parseFeeBps(raw: string | undefined): number {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_WRAPPER_FEE_BPS;
  }
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 0 || n > 10_000) return DEFAULT_WRAPPER_FEE_BPS;
  return n;
}

/**
 * Read wrapper feature flags from Vite env.
 * Invalid address when enabled → treated as disabled (fail-safe).
 */
export function getUniswapWrapperConfig(): UniswapWrapperConfig {
  const enabled = parseEnvBoolean(import.meta.env.VITE_UNISWAP_WRAPPER_ENABLED);
  const rawAddr = import.meta.env.VITE_UNISWAP_WRAPPER_ADDRESS;
  const feeBpsDisplay = parseFeeBps(import.meta.env.VITE_UNISWAP_WRAPPER_FEE_BPS);

  if (!enabled) {
    return { enabled: false, wrapperAddress: null, feeBpsDisplay };
  }

  if (typeof rawAddr !== 'string' || !isAddress(rawAddr)) {
    console.warn('[UniswapWrapper] Enabled but VITE_UNISWAP_WRAPPER_ADDRESS is missing or invalid — wrapper path disabled.');
    return { enabled: false, wrapperAddress: null, feeBpsDisplay };
  }

  try {
    return {
      enabled: true,
      wrapperAddress: getAddress(rawAddr),
      feeBpsDisplay,
    };
  } catch {
    return { enabled: false, wrapperAddress: null, feeBpsDisplay };
  }
}

export function isUniswapWrapperExecutionEligible(
  chainId: number,
  tokenIn: Token | null | undefined,
  tokenOut: Token | null | undefined,
): boolean {
  if (chainId !== 1) return false;
  if (!tokenIn || !tokenOut) return false;
  if (isNativeToken(tokenIn.address) || isNativeToken(tokenOut.address)) return false;
  return true;
}

/** Eligible when flags on + Ethereum + both sides are non-native ERC20. */
export function shouldUseUniswapWrapperForSymbols(
  chainId: number,
  tokenInSymbol: string,
  tokenOutSymbol: string,
): boolean {
  const cfg = getUniswapWrapperConfig();
  if (!cfg.enabled || !cfg.wrapperAddress) return false;
  const a = getTokenBySymbol(tokenInSymbol, chainId);
  const b = getTokenBySymbol(tokenOutSymbol, chainId);
  return isUniswapWrapperExecutionEligible(chainId, a, b);
}

export function getUniswapWrapperSpenderAddress(): string | null {
  return getUniswapWrapperConfig().wrapperAddress;
}

/**
 * Warm session cache: read `FEE_BPS` once from the wrapper contract on Ethereum mainnet.
 * No-op if wrapper disabled, wrong chain, or already attempted. Safe to call in parallel with quoting.
 */
export async function ensureUniswapWrapperChainFeeBps(
  provider: Provider | null | undefined,
  chainId: number,
): Promise<void> {
  const cfg = getUniswapWrapperConfig();
  if (chainId !== 1 || !cfg.enabled || !cfg.wrapperAddress) return;
  if (sessionChainWrapperFeeBps !== undefined || sessionChainWrapperFeeReadFinished) return;
  if (!provider) return;

  sessionChainWrapperFeeReadFinished = true;
  try {
    const { Contract } = await import('ethers');
    const c = new Contract(cfg.wrapperAddress, WRAPPER_FEE_BPS_ABI, provider);
    const raw = await c.FEE_BPS();
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 10_000) {
      console.warn('[UniswapWrapper] On-chain FEE_BPS out of range:', raw);
      return;
    }
    sessionChainWrapperFeeBps = n;
    if (n !== cfg.feeBpsDisplay) {
      console.warn('[UniswapWrapper] VITE_UNISWAP_WRAPPER_FEE_BPS does not match on-chain FEE_BPS — UI uses on-chain value.', {
        onChainFeeBps: n,
        envFeeBpsDisplay: cfg.feeBpsDisplay,
      });
    }
  } catch (err) {
    console.warn('[UniswapWrapper] Could not read FEE_BPS from wrapper; UI falls back to env.', err);
  }
}

/** Basis points for UI: on-chain value when read succeeded, otherwise env `feeBpsDisplay`. */
export function getUniswapWrapperFeeBpsForUi(): number {
  const cfg = getUniswapWrapperConfig();
  return sessionChainWrapperFeeBps !== undefined ? sessionChainWrapperFeeBps : cfg.feeBpsDisplay;
}

/** True after a successful on-chain FEE_BPS read this session. */
export function isUniswapWrapperFeeBpsVerified(): boolean {
  return sessionChainWrapperFeeBps !== undefined;
}

/**
 * True when we attempted an on-chain read with a provider but could not use the result.
 * Used for a small “unverified” footnote (not shown before the first read attempt).
 */
export function isUniswapWrapperFeeBpsUnverified(): boolean {
  const cfg = getUniswapWrapperConfig();
  if (!cfg.enabled || !cfg.wrapperAddress) return false;
  return sessionChainWrapperFeeReadFinished && sessionChainWrapperFeeBps === undefined;
}
