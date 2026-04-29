/**
 * Uniswap V3 fee wrapper **V2** (Ethereum mainnet / chain 1).
 *
 * Supports ERC20↔ERC20 plus native ETH legs when `VITE_UNISWAP_WRAPPER_V2_NATIVE_ENABLED` is truthy.
 * Defaults **OFF** — omit env flags or set falsy so production routing stays unchanged until rollout.
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

let sessionChainUniswapWrapperV2FeeBps: number | undefined;
let sessionUniswapWrapperV2FeeReadFinished = false;

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

function parseEnvBoolean(raw: string | undefined): boolean {
  if (raw === undefined || raw === null) return false;
  return ENABLED_VALUES.has(String(raw).trim().toLowerCase());
}

function parseEnvPct0to1(raw: string | undefined): number {
  if (raw === undefined || raw === null || String(raw).trim() === '') return 0;
  const n = Number.parseFloat(String(raw).trim());
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

const DEFAULT_UNISWAP_WRAPPER_V2_FEE_BPS = 20;

export interface UniswapWrapperV2Config {
  enabled: boolean;
  wrapperAddress: string | null;
  feeBpsDisplay: number;
  /** When false, V2 native entrypoints must not be used from the tx builder. */
  nativeEnabled: boolean;
  /** When false, native-leg quoting must not be attempted (manual-route gate). */
  nativeQuoteEnabled: boolean;
  /** Reserved for future canary % on native legs (default 0). */
  nativeCanaryPct: number;
  /** Phase 3 canary: show “Experimental ETH routing” in UI when native execution is on. */
  experimentalNativeUi: boolean;
}

function parseFeeBps(raw: string | undefined): number {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_UNISWAP_WRAPPER_V2_FEE_BPS;
  }
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 0 || n > 10_000) return DEFAULT_UNISWAP_WRAPPER_V2_FEE_BPS;
  return n;
}

export function getUniswapWrapperV2Config(): UniswapWrapperV2Config {
  const enabled = parseEnvBoolean(import.meta.env.VITE_UNISWAP_WRAPPER_V2_ENABLED);
  const nativeEnabled = parseEnvBoolean(import.meta.env.VITE_UNISWAP_WRAPPER_V2_NATIVE_ENABLED);
  const nativeQuoteEnabled = parseEnvBoolean(import.meta.env.VITE_UNISWAP_WRAPPER_V2_NATIVE_QUOTE_ENABLED);
  const nativeCanaryPct = parseEnvPct0to1(import.meta.env.VITE_UNISWAP_WRAPPER_V2_NATIVE_CANARY_PCT);
  const rawAddr = import.meta.env.VITE_UNISWAP_WRAPPER_V2_ADDRESS;
  const feeBpsDisplay = parseFeeBps(import.meta.env.VITE_UNISWAP_WRAPPER_V2_FEE_BPS);

  const experimentalNativeUi = parseEnvBoolean(import.meta.env.VITE_UNISWAP_WRAPPER_V2_NATIVE_EXPERIMENTAL_UI);

  if (!enabled) {
    return {
      enabled: false,
      wrapperAddress: null,
      feeBpsDisplay,
      nativeEnabled: false,
      nativeQuoteEnabled: false,
      nativeCanaryPct: 0,
      experimentalNativeUi: false,
    };
  }

  if (typeof rawAddr !== 'string' || !isAddress(rawAddr)) {
    console.warn(
      '[UniswapWrapperV2] Enabled but VITE_UNISWAP_WRAPPER_V2_ADDRESS is missing or invalid — V2 disabled.',
    );
    return {
      enabled: false,
      wrapperAddress: null,
      feeBpsDisplay,
      nativeEnabled: false,
      nativeQuoteEnabled: false,
      nativeCanaryPct: 0,
      experimentalNativeUi: false,
    };
  }

  try {
    return {
      enabled: true,
      wrapperAddress: getAddress(rawAddr),
      feeBpsDisplay,
      nativeEnabled,
      nativeQuoteEnabled,
      nativeCanaryPct,
      experimentalNativeUi,
    };
  } catch {
    return {
      enabled: false,
      wrapperAddress: null,
      feeBpsDisplay,
      nativeEnabled: false,
      nativeQuoteEnabled: false,
      nativeCanaryPct: 0,
      experimentalNativeUi: false,
    };
  }
}

export function getUniswapWrapperV2SpenderAddress(): string | null {
  return getUniswapWrapperV2Config().wrapperAddress;
}

export async function ensureUniswapWrapperV2ChainFeeBps(
  provider: Provider | null | undefined,
  chainId: number,
): Promise<void> {
  const cfg = getUniswapWrapperV2Config();
  if (chainId !== 1 || !cfg.enabled || !cfg.wrapperAddress) return;
  if (sessionChainUniswapWrapperV2FeeBps !== undefined || sessionUniswapWrapperV2FeeReadFinished) return;
  if (!provider) return;

  sessionUniswapWrapperV2FeeReadFinished = true;
  try {
    const { Contract } = await import('ethers');
    const c = new Contract(cfg.wrapperAddress, FEE_BPS_ABI, provider);
    const raw = await c.feeBps();
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 10_000) {
      console.warn('[UniswapWrapperV2] On-chain feeBps out of range:', raw);
      return;
    }
    sessionChainUniswapWrapperV2FeeBps = n;
    if (n !== cfg.feeBpsDisplay) {
      console.warn(
        '[UniswapWrapperV2] VITE_UNISWAP_WRAPPER_V2_FEE_BPS does not match on-chain feeBps — UI uses on-chain value.',
        { onChainFeeBps: n, envFeeBpsDisplay: cfg.feeBpsDisplay },
      );
    }
  } catch (err) {
    console.warn('[UniswapWrapperV2] Could not read feeBps from wrapper; UI falls back to env.', err);
  }
}

export function getUniswapWrapperV2FeeBpsForUi(): number {
  const cfg = getUniswapWrapperV2Config();
  return sessionChainUniswapWrapperV2FeeBps !== undefined ? sessionChainUniswapWrapperV2FeeBps : cfg.feeBpsDisplay;
}

/** Last successful on-chain `feeBps` read this session (undefined if not read). */
export function getUniswapWrapperV2SessionOnChainFeeBps(): number | undefined {
  return sessionChainUniswapWrapperV2FeeBps;
}

export function isUniswapWrapperV2FeeBpsVerified(): boolean {
  return sessionChainUniswapWrapperV2FeeBps !== undefined;
}

export function isUniswapWrapperV2FeeBpsUnverified(): boolean {
  const cfg = getUniswapWrapperV2Config();
  if (!cfg.enabled || !cfg.wrapperAddress) return false;
  return sessionUniswapWrapperV2FeeReadFinished && sessionChainUniswapWrapperV2FeeBps === undefined;
}

/** True when V2 could execute this pair (native legs require `nativeEnabled`). */
export function isUniswapWrapperV2ExecutionEligible(
  chainId: number,
  tokenIn: Token | null | undefined,
  tokenOut: Token | null | undefined,
): boolean {
  if (chainId !== 1) return false;
  if (!tokenIn || !tokenOut) return false;
  const cfg = getUniswapWrapperV2Config();
  if (!cfg.enabled || !cfg.wrapperAddress) return false;

  const inNative = isNativeToken(tokenIn.address);
  const outNative = isNativeToken(tokenOut.address);
  if (inNative && outNative) return false;
  if (inNative || outNative) return cfg.nativeEnabled;
  return true;
}

/**
 * True when V2 may quote this pair. Native legs only need `nativeQuoteEnabled` so ops can run
 * “Phase 2: quotes on, execution off” (`nativeQuoteEnabled` without `nativeEnabled`).
 */
export function isUniswapWrapperV2QuoteEligible(
  chainId: number,
  tokenIn: Token | null | undefined,
  tokenOut: Token | null | undefined,
): boolean {
  if (chainId !== 1) return false;
  if (!tokenIn || !tokenOut) return false;
  const cfg = getUniswapWrapperV2Config();
  if (!cfg.enabled || !cfg.wrapperAddress) return false;

  const inNative = isNativeToken(tokenIn.address);
  const outNative = isNativeToken(tokenOut.address);
  if (inNative && outNative) return false;
  if (inNative || outNative) return cfg.nativeQuoteEnabled;
  return true;
}
