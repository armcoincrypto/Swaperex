/**
 * Uniswap V3 fee wrapper **V3** (Ethereum mainnet, multi-hop `exactInput`).
 *
 * Defaults **OFF** (`VITE_UNISWAP_WRAPPER_V3_ENABLED` falsy). Does not replace V2.
 * When enabled, only pairs allowlisted via `VITE_UNISWAP_WRAPPER_V3_CANARY_PAIRS` (or the built-in default list) may route through V3.
 */

import { getAddress, isAddress, type Provider } from 'ethers';
import { isNativeToken, type Token } from '@/tokens';

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

function parseEnvBoolean(raw: string | undefined): boolean {
  if (raw === undefined || raw === null) return false;
  return ENABLED_VALUES.has(String(raw).trim().toLowerCase());
}

const DEFAULT_UNISWAP_WRAPPER_V3_FEE_BPS = 20;

/** Built-in commission paths (token symbols, WETH = wrapped ETH only — no native ETH in V3 ERC20 API). */
const DEFAULT_CANARY_SEGMENTS = [
  'WETH-USDC',
  'WETH-USDT',
  'WETH-DAI',
  'WETH-WBTC',
  'WETH-LINK',
  'WETH-UNI',
  'WETH-AAVE',
  'WETH-LDO',
  'WETH-CRV',
  'WETH-COMP',
  'WETH-ENS',
  'WETH-ONDO',
  'WETH-ENA',
  'WETH-MANA',
] as const;

export type UniswapWrapperV3CanarySegment = readonly string[];

function normalizeSymbol(sym: string): string {
  return String(sym || '')
    .trim()
    .toUpperCase();
}

/** Parse `WETH-USDC-SNX` → `['WETH','USDC','SNX']`. */
export function parseCanarySegment(segment: string): string[] | null {
  const s = String(segment || '').trim();
  if (!s) return null;
  const parts = s.split('-').map((p) => normalizeSymbol(p)).filter(Boolean);
  if (parts.length < 2) return null;
  return parts;
}

export function parseCanaryListFromEnv(): string[][] {
  const raw = import.meta.env.VITE_UNISWAP_WRAPPER_V3_CANARY_PAIRS;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_CANARY_SEGMENTS.map((seg) => parseCanarySegment(seg)!).filter(Boolean);
  }
  const out: string[][] = [];
  for (const piece of String(raw).split(',')) {
    const parsed = parseCanarySegment(piece);
    if (parsed && parsed.length >= 2) out.push(parsed);
  }
  return out.length > 0 ? out : DEFAULT_CANARY_SEGMENTS.map((seg) => parseCanarySegment(seg)!).filter(Boolean);
}

/**
 * Ordered symbol list for `tokenIn`→`tokenOut` through a canary row (for packed V3 path encoding).
 * - Forward: row first→last must equal tokenIn→tokenOut (any hop count ≤ MAX_HOPS on-chain).
 * - Reverse: only for **two-token** rows (single hop), same pool either way — e.g. `WETH-USDC`
 *   also allows USDC→WETH without a separate env segment.
 */
export function resolveUniswapWrapperV3CanarySymbolsForSwap(
  tokenInSymbol: string,
  tokenOutSymbol: string,
): string[] | null {
  const a = normalizeSymbol(tokenInSymbol);
  const b = normalizeSymbol(tokenOutSymbol);
  for (const path of parseCanaryListFromEnv()) {
    if (path.length < 2) continue;
    const first = normalizeSymbol(path[0]);
    const last = normalizeSymbol(path[path.length - 1]);
    if (first === a && last === b) return [...path];
    if (path.length === 2 && first === b && last === a) {
      return [path[1], path[0]];
    }
  }
  return null;
}

/** True if `tokenIn`→`tokenOut` is covered by the canary list (including 2-token reverse). */
export function isUniswapWrapperV3AllowlistedPair(tokenInSymbol: string, tokenOutSymbol: string): boolean {
  return resolveUniswapWrapperV3CanarySymbolsForSwap(tokenInSymbol, tokenOutSymbol) !== null;
}

/**
 * True when the pair is one we ship a V3 path builder for (allowlist), independent of `enabled`.
 * Used for “V3 route available” UX when the flag is still off.
 */
export function isUniswapWrapperV3RoutablePairSymbols(tokenInSymbol: string, tokenOutSymbol: string): boolean {
  return isUniswapWrapperV3AllowlistedPair(tokenInSymbol, tokenOutSymbol);
}

export function isUniswapWrapperV3PathAvailableButDisabled(
  chainId: number,
  tokenInSymbol: string,
  tokenOutSymbol: string,
): boolean {
  if (chainId !== 1) return false;
  const cfg = getUniswapWrapperV3Config();
  if (cfg.enabled) return false;
  return isUniswapWrapperV3RoutablePairSymbols(tokenInSymbol, tokenOutSymbol);
}

export interface UniswapWrapperV3Config {
  enabled: boolean;
  wrapperAddress: string | null;
  feeBpsDisplay: number;
}

function parseFeeBps(raw: string | undefined): number {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_UNISWAP_WRAPPER_V3_FEE_BPS;
  }
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 0 || n > 10_000) return DEFAULT_UNISWAP_WRAPPER_V3_FEE_BPS;
  return n;
}

export function getUniswapWrapperV3Config(): UniswapWrapperV3Config {
  const enabled = parseEnvBoolean(import.meta.env.VITE_UNISWAP_WRAPPER_V3_ENABLED);
  const rawAddr = import.meta.env.VITE_UNISWAP_WRAPPER_V3_ADDRESS;
  const feeBpsDisplay = parseFeeBps(import.meta.env.VITE_UNISWAP_WRAPPER_V3_FEE_BPS);

  if (!enabled) {
    return { enabled: false, wrapperAddress: null, feeBpsDisplay };
  }

  if (typeof rawAddr !== 'string' || !isAddress(rawAddr)) {
    console.warn(
      '[UniswapWrapperV3] Enabled but VITE_UNISWAP_WRAPPER_V3_ADDRESS is missing or invalid — V3 disabled.',
    );
    return { enabled: false, wrapperAddress: null, feeBpsDisplay };
  }

  try {
    return { enabled: true, wrapperAddress: getAddress(rawAddr), feeBpsDisplay };
  } catch {
    return { enabled: false, wrapperAddress: null, feeBpsDisplay };
  }
}

export function getUniswapWrapperV3SpenderAddress(): string | null {
  return getUniswapWrapperV3Config().wrapperAddress;
}

let sessionChainUniswapWrapperV3FeeBps: number | undefined;
let sessionUniswapWrapperV3FeeReadFinished = false;

export async function ensureUniswapWrapperV3ChainFeeBps(
  provider: Provider | null | undefined,
  chainId: number,
): Promise<void> {
  const cfg = getUniswapWrapperV3Config();
  if (chainId !== 1 || !cfg.enabled || !cfg.wrapperAddress) return;
  if (sessionChainUniswapWrapperV3FeeBps !== undefined || sessionUniswapWrapperV3FeeReadFinished) return;
  if (!provider) return;

  try {
    const { Contract } = await import('ethers');
    const c = new Contract(cfg.wrapperAddress, FEE_BPS_ABI, provider);
    const raw = await c.feeBps();
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 10_000) {
      sessionUniswapWrapperV3FeeReadFinished = true;
      return;
    }
    sessionChainUniswapWrapperV3FeeBps = n;
    sessionUniswapWrapperV3FeeReadFinished = true;
    if (n !== cfg.feeBpsDisplay) {
      console.warn('[UniswapWrapperV3] env FEE_BPS display differs from on-chain feeBps', {
        onChainFeeBps: n,
        envFeeBpsDisplay: cfg.feeBpsDisplay,
      });
    }
  } catch (err) {
    sessionUniswapWrapperV3FeeReadFinished = true;
    console.warn('[UniswapWrapperV3] Could not read feeBps from wrapper.', err);
  }
}

const FEE_BPS_ABI = [
  {
    inputs: [],
    name: 'feeBps',
    outputs: [{ name: '', type: 'uint16' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export function getUniswapWrapperV3FeeBpsForUi(): number {
  const cfg = getUniswapWrapperV3Config();
  return sessionChainUniswapWrapperV3FeeBps !== undefined ? sessionChainUniswapWrapperV3FeeBps : cfg.feeBpsDisplay;
}

/** Last successful on-chain `feeBps` read for V3 (undefined until `ensureUniswapWrapperV3ChainFeeBps` succeeds). */
export function getUniswapWrapperV3SessionOnChainFeeBps(): number | undefined {
  return sessionChainUniswapWrapperV3FeeBps;
}

/** Commission-required + enabled + allowlisted + WETH/ERC20 legs only (no native ETH in / out for V3 in P4.4-F). */
export function isUniswapWrapperV3CommissionEligible(
  chainId: number,
  tokenIn: Token | null | undefined,
  tokenOut: Token | null | undefined,
): boolean {
  if (chainId !== 1) return false;
  if (!tokenIn || !tokenOut) return false;
  const cfg = getUniswapWrapperV3Config();
  if (!cfg.enabled || !cfg.wrapperAddress) return false;
  if (isNativeToken(tokenIn.address) || isNativeToken(tokenOut.address)) return false;
  return isUniswapWrapperV3AllowlistedPair(tokenIn.symbol, tokenOut.symbol);
}
