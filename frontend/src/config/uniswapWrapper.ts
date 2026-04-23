/**
 * Feature-flagged Uniswap V3 fee wrapper (Ethereum mainnet, ERC20→ERC20 only).
 * Defaults OFF — omit `VITE_UNISWAP_WRAPPER_ENABLED` or set falsy so direct SwapRouter02 path is unchanged.
 * Production deployment (verified): `0xe07f5940487a58E30F9fa711Be358FB036B0Fc44` — set via `VITE_UNISWAP_WRAPPER_ADDRESS` when enabling.
 */

import { getAddress, isAddress } from 'ethers';
import { getTokenBySymbol, isNativeToken, type Token } from '@/tokens';

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
