/**
 * Feature-flagged PancakeSwap V3 fee wrapper (BSC / chain 56, ERC20→ERC20 only).
 * Defaults OFF — omit `VITE_PANCAKE_WRAPPER_ENABLED` or set falsy so direct SmartRouter path is unchanged.
 *
 * FEE_BPS display: prefer one `eth_call` per browser session to the deployed wrapper (`FEE_BPS`),
 * with env `VITE_PANCAKE_WRAPPER_FEE_BPS` as fallback and drift warning in console.
 */

import { getAddress, isAddress, type Provider } from 'ethers';
import { getTokenBySymbol, isNativeToken, type Token } from '@/tokens';

const WRAPPER_FEE_BPS_ABI = [
  {
    inputs: [],
    name: 'FEE_BPS',
    outputs: [{ name: '', type: 'uint16' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

let sessionChainPancakeWrapperFeeBps: number | undefined;
let sessionPancakeWrapperFeeReadFinished = false;

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

function parseEnvBoolean(raw: string | undefined): boolean {
  if (raw === undefined || raw === null) return false;
  return ENABLED_VALUES.has(String(raw).trim().toLowerCase());
}

/** Display default when env omits fee (matches typical deployment; on-chain read preferred). */
const DEFAULT_PANCAKE_WRAPPER_FEE_BPS = 50;

export interface PancakeWrapperConfig {
  enabled: boolean;
  wrapperAddress: string | null;
  feeBpsDisplay: number;
}

function parseFeeBps(raw: string | undefined): number {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_PANCAKE_WRAPPER_FEE_BPS;
  }
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 0 || n > 10_000) return DEFAULT_PANCAKE_WRAPPER_FEE_BPS;
  return n;
}

export function getPancakeWrapperConfig(): PancakeWrapperConfig {
  const enabled = parseEnvBoolean(import.meta.env.VITE_PANCAKE_WRAPPER_ENABLED);
  const rawAddr = import.meta.env.VITE_PANCAKE_WRAPPER_ADDRESS;
  const feeBpsDisplay = parseFeeBps(import.meta.env.VITE_PANCAKE_WRAPPER_FEE_BPS);

  if (!enabled) {
    return { enabled: false, wrapperAddress: null, feeBpsDisplay };
  }

  if (typeof rawAddr !== 'string' || !isAddress(rawAddr)) {
    console.warn(
      '[PancakeWrapper] Enabled but VITE_PANCAKE_WRAPPER_ADDRESS is missing or invalid — wrapper path disabled.',
    );
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

export function isPancakeWrapperExecutionEligible(
  chainId: number,
  tokenIn: Token | null | undefined,
  tokenOut: Token | null | undefined,
): boolean {
  if (chainId !== 56) return false;
  if (!tokenIn || !tokenOut) return false;
  if (isNativeToken(tokenIn.address) || isNativeToken(tokenOut.address)) return false;
  return true;
}

export function shouldUsePancakeWrapperForSymbols(
  chainId: number,
  tokenInSymbol: string,
  tokenOutSymbol: string,
): boolean {
  const cfg = getPancakeWrapperConfig();
  if (!cfg.enabled || !cfg.wrapperAddress) return false;
  const a = getTokenBySymbol(tokenInSymbol, chainId);
  const b = getTokenBySymbol(tokenOutSymbol, chainId);
  return isPancakeWrapperExecutionEligible(chainId, a, b);
}

export function getPancakeWrapperSpenderAddress(): string | null {
  return getPancakeWrapperConfig().wrapperAddress;
}

export async function ensurePancakeWrapperChainFeeBps(
  provider: Provider | null | undefined,
  chainId: number,
): Promise<void> {
  const cfg = getPancakeWrapperConfig();
  if (chainId !== 56 || !cfg.enabled || !cfg.wrapperAddress) return;
  if (sessionChainPancakeWrapperFeeBps !== undefined || sessionPancakeWrapperFeeReadFinished) return;
  if (!provider) return;

  sessionPancakeWrapperFeeReadFinished = true;
  try {
    const { Contract } = await import('ethers');
    const c = new Contract(cfg.wrapperAddress, WRAPPER_FEE_BPS_ABI, provider);
    const raw = await c.FEE_BPS();
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 10_000) {
      console.warn('[PancakeWrapper] On-chain FEE_BPS out of range:', raw);
      return;
    }
    sessionChainPancakeWrapperFeeBps = n;
    if (n !== cfg.feeBpsDisplay) {
      console.warn(
        '[PancakeWrapper] VITE_PANCAKE_WRAPPER_FEE_BPS does not match on-chain FEE_BPS — UI uses on-chain value.',
        { onChainFeeBps: n, envFeeBpsDisplay: cfg.feeBpsDisplay },
      );
    }
  } catch (err) {
    console.warn('[PancakeWrapper] Could not read FEE_BPS from wrapper; UI falls back to env.', err);
  }
}

export function getPancakeWrapperFeeBpsForUi(): number {
  const cfg = getPancakeWrapperConfig();
  return sessionChainPancakeWrapperFeeBps !== undefined ? sessionChainPancakeWrapperFeeBps : cfg.feeBpsDisplay;
}

export function isPancakeWrapperFeeBpsVerified(): boolean {
  return sessionChainPancakeWrapperFeeBps !== undefined;
}

export function isPancakeWrapperFeeBpsUnverified(): boolean {
  const cfg = getPancakeWrapperConfig();
  if (!cfg.enabled || !cfg.wrapperAddress) return false;
  return sessionPancakeWrapperFeeReadFinished && sessionChainPancakeWrapperFeeBps === undefined;
}
