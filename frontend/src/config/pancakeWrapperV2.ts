/**
 * PancakeSwap V3 fee wrapper **V2** (BSC / chain 56).
 *
 * V2 supports ERC20↔ERC20 plus native BNB legs when `VITE_PANCAKE_WRAPPER_V2_NATIVE_ENABLED` is truthy.
 * Defaults **OFF** — omit env flags or set falsy so production routing stays unchanged until canary.
 */

import { getAddress, isAddress, type Provider } from 'ethers';
import { isNativeToken, type Token } from '@/tokens';

const FEE_BPS_ABI = [
  {
    inputs: [],
    name: 'feeBps',
    outputs: [{ name: '', type: 'uint16' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

let sessionChainPancakeWrapperV2FeeBps: number | undefined;
let sessionPancakeWrapperV2FeeReadFinished = false;

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

function parseEnvBoolean(raw: string | undefined): boolean {
  if (raw === undefined || raw === null) return false;
  return ENABLED_VALUES.has(String(raw).trim().toLowerCase());
}

const DEFAULT_PANCAKE_WRAPPER_V2_FEE_BPS = 50;

export interface PancakeWrapperV2Config {
  enabled: boolean;
  wrapperAddress: string | null;
  feeBpsDisplay: number;
  /** When false, V2 native entrypoints must not be used from the tx builder (canary gate). */
  nativeEnabled: boolean;
}

function parseFeeBps(raw: string | undefined): number {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_PANCAKE_WRAPPER_V2_FEE_BPS;
  }
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 0 || n > 10_000) return DEFAULT_PANCAKE_WRAPPER_V2_FEE_BPS;
  return n;
}

export function getPancakeWrapperV2Config(): PancakeWrapperV2Config {
  const enabled = parseEnvBoolean(import.meta.env.VITE_PANCAKE_WRAPPER_V2_ENABLED);
  const nativeEnabled = parseEnvBoolean(import.meta.env.VITE_PANCAKE_WRAPPER_V2_NATIVE_ENABLED);
  const rawAddr = import.meta.env.VITE_PANCAKE_WRAPPER_V2_ADDRESS;
  const feeBpsDisplay = parseFeeBps(import.meta.env.VITE_PANCAKE_WRAPPER_V2_FEE_BPS);

  if (!enabled) {
    return { enabled: false, wrapperAddress: null, feeBpsDisplay, nativeEnabled: false };
  }

  if (typeof rawAddr !== 'string' || !isAddress(rawAddr)) {
    console.warn(
      '[PancakeWrapperV2] Enabled but VITE_PANCAKE_WRAPPER_V2_ADDRESS is missing or invalid — V2 disabled.',
    );
    return { enabled: false, wrapperAddress: null, feeBpsDisplay, nativeEnabled: false };
  }

  try {
    return {
      enabled: true,
      wrapperAddress: getAddress(rawAddr),
      feeBpsDisplay,
      nativeEnabled,
    };
  } catch {
    return { enabled: false, wrapperAddress: null, feeBpsDisplay, nativeEnabled: false };
  }
}

export function getPancakeWrapperV2SpenderAddress(): string | null {
  return getPancakeWrapperV2Config().wrapperAddress;
}

export async function ensurePancakeWrapperV2ChainFeeBps(
  provider: Provider | null | undefined,
  chainId: number,
): Promise<void> {
  const cfg = getPancakeWrapperV2Config();
  if (chainId !== 56 || !cfg.enabled || !cfg.wrapperAddress) return;
  if (sessionChainPancakeWrapperV2FeeBps !== undefined || sessionPancakeWrapperV2FeeReadFinished) return;
  if (!provider) return;

  sessionPancakeWrapperV2FeeReadFinished = true;
  try {
    const { Contract } = await import('ethers');
    const c = new Contract(cfg.wrapperAddress, FEE_BPS_ABI, provider);
    const raw = await c.feeBps();
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 10_000) {
      console.warn('[PancakeWrapperV2] On-chain feeBps out of range:', raw);
      return;
    }
    sessionChainPancakeWrapperV2FeeBps = n;
    if (n !== cfg.feeBpsDisplay) {
      console.warn(
        '[PancakeWrapperV2] VITE_PANCAKE_WRAPPER_V2_FEE_BPS does not match on-chain feeBps — UI uses on-chain value.',
        { onChainFeeBps: n, envFeeBpsDisplay: cfg.feeBpsDisplay },
      );
    }
  } catch (err) {
    console.warn('[PancakeWrapperV2] Could not read feeBps from wrapper; UI falls back to env.', err);
  }
}

export function getPancakeWrapperV2FeeBpsForUi(): number {
  const cfg = getPancakeWrapperV2Config();
  return sessionChainPancakeWrapperV2FeeBps !== undefined ? sessionChainPancakeWrapperV2FeeBps : cfg.feeBpsDisplay;
}

export function isPancakeWrapperV2FeeBpsVerified(): boolean {
  return sessionChainPancakeWrapperV2FeeBps !== undefined;
}

export function isPancakeWrapperV2FeeBpsUnverified(): boolean {
  const cfg = getPancakeWrapperV2Config();
  if (!cfg.enabled || !cfg.wrapperAddress) return false;
  return sessionPancakeWrapperV2FeeReadFinished && sessionChainPancakeWrapperV2FeeBps === undefined;
}

/** True when V2 could execute this pair (does not imply routing is wired in `useSwap`). */
export function isPancakeWrapperV2ExecutionEligible(
  chainId: number,
  tokenIn: Token | null | undefined,
  tokenOut: Token | null | undefined,
): boolean {
  if (chainId !== 56) return false;
  if (!tokenIn || !tokenOut) return false;
  const cfg = getPancakeWrapperV2Config();
  if (!cfg.enabled || !cfg.wrapperAddress) return false;

  const inNative = isNativeToken(tokenIn.address);
  const outNative = isNativeToken(tokenOut.address);
  if (inNative && outNative) return false;
  if (inNative || outNative) return cfg.nativeEnabled;
  return true;
}
