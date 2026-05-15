/**
 * Quote Aggregator Service
 *
 * Routes swaps through best available provider per chain.
 *
 * ETH Mainnet (chainId 1):
 * - 1inch (primary) + Uniswap V3 (fallback)
 *
 * BSC (chainId 56):
 * - 1inch (primary) + PancakeSwap V3 (fallback)
 *
 * Polygon, Arbitrum, Optimism, Avalanche, Gnosis, Fantom, Base:
 * - 1inch (sole provider)
 *
 * The provider with better output amount wins.
 *
 * SECURITY:
 * - This service only fetches quotes (read-only)
 * - Never signs or sends transactions
 * - All signing happens in wallet
 */

import {
  getBestOneInchQuote,
  getOneInchMinAmountOut,
  type OneInchQuoteResult,
} from './oneInchQuote';
import {
  getBestQuote as getUniswapQuote,
  getBestWrapperQuote,
  getMinAmountOut as getUniswapMinAmountOut,
  type QuoteResult as UniswapQuoteResult,
} from './uniswapQuote';
// PHASE 11: Import PancakeSwap for BSC
import {
  getBestPancakeQuote,
  getPancakeMinAmountOut,
  type PancakeQuoteResult,
} from './pancakeSwapQuote';
import { getTokenBySymbol, isNativeToken } from '@/tokens';
import {
  getPancakeWrapperV2Config,
  getUniswapWrapperV2Config,
  getUniswapWrapperV3Config,
  isPancakeWrapperV2ExecutionEligible,
  isUniswapWrapperV2QuoteEligible,
  isUniswapWrapperV3CommissionEligible,
} from '@/config';
import { getBestPancakeWrapperV2Quote } from './pancakeWrapperQuoteV2';
import { getBestUniswapWrapperV2Quote } from './uniswapWrapperQuoteV2';
import { getBestUniswapWrapperV3Quote, type UniswapWrapperV3QuoteResult } from './uniswapWrapperQuoteV3';
import { swapObsLog } from '@/utils/swapObservability';
import { keccak256, toUtf8Bytes } from 'ethers';
import { isCommissionRequiredMode } from '@/config/commissionRequired';

/** Keep [swap:obs] JSON lines compact in the console */
const OBS_REASON_MAX = 280;

function parseEnvPct0to1(raw: string | undefined): number {
  if (raw === undefined || raw === null || String(raw).trim() === '') return 0;
  const n = Number.parseFloat(String(raw).trim());
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function getPancakeWrapperV2CanaryPct(): number {
  return parseEnvPct0to1(import.meta.env.VITE_PANCAKE_WRAPPER_V2_CANARY_PCT);
}

const CANARY_BUCKET_MOD = 10_000;

function isAggregatorDebugEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  const raw = import.meta.env.VITE_DEBUG_SWAP;
  if (typeof raw !== 'string') return false;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

/** Quote-aggregator debug lines (DEV or `VITE_DEBUG_SWAP` only). */
function aggDebugLog(...args: unknown[]): void {
  if (!isAggregatorDebugEnabled()) return;
  console.debug('[quoteAggregator]', ...args);
}

function computeCanaryBucket(input: {
  wallet: string | null;
  chainId: number;
  tokenIn: string;
  tokenOut: string;
}): { bucket: number; deterministic: boolean } {
  const wallet = (input.wallet ?? '').trim().toLowerCase();
  const tokenIn = String(input.tokenIn || '').trim().toLowerCase();
  const tokenOut = String(input.tokenOut || '').trim().toLowerCase();

  // If wallet is unavailable, fall back to current safe behavior (random canary).
  if (!wallet) {
    return { bucket: Math.floor(Math.random() * CANARY_BUCKET_MOD), deterministic: false };
  }

  const key = `${wallet}|${input.chainId}|${tokenIn}|${tokenOut}`;
  const h = keccak256(toUtf8Bytes(key));
  const low32 = BigInt(h) & 0xffffffffn;
  const bucket = Number(low32 % BigInt(CANARY_BUCKET_MOD));
  return { bucket, deterministic: true };
}

function obsAggRoute(fields: {
  chainId: number;
  routeMode: string;
  tokenIn: string;
  tokenOut: string;
  bestProvider: string;
  runnerUp: string;
  reason: string;
  lane: string;
}): void {
  swapObsLog('agg_route', {
    chainId: fields.chainId,
    routeMode: fields.routeMode,
    tokenIn: fields.tokenIn,
    tokenOut: fields.tokenOut,
    bestProvider: fields.bestProvider,
    runnerUp: fields.runnerUp,
    reason: fields.reason.slice(0, OBS_REASON_MAX),
    lane: fields.lane,
  });
}

/** Providers allowed for quotes and execution when `VITE_COMMISSION_REQUIRED` is on. */
const COMMISSION_WRAPPER_PROVIDERS = new Set<string>([
  'uniswap-v3-wrapper',
  'uniswap-v3-wrapper-v2',
  'uniswap-v3-wrapper-v3',
  'pancakeswap-v3-wrapper',
  'pancakeswap-v3-wrapper-v2',
]);

export function isCommissionWrapperExecutionProvider(provider: string): boolean {
  return COMMISSION_WRAPPER_PROVIDERS.has(provider);
}

function assertCommissionFixedRouteAllowed(mode: QuoteRouteMode, _chainId: number): void {
  if (!isCommissionRequiredMode() || mode === 'best') return;
  if (isCommissionWrapperExecutionProvider(mode)) return;
  throw new Error(
    'Commission-required mode only allows Swaperex wrapper routes. Choose a wrapper route or switch network.',
  );
}

async function commissionStrictEthereumBestQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  slippage: number,
): Promise<AggregatedQuoteResult> {
  const tokenOutData = getTokenBySymbol(tokenOut, 1);
  if (!tokenOutData) {
    throw new Error(`Unknown token: ${tokenOut}`);
  }
  const tokenInMeta = getTokenBySymbol(tokenIn, 1);
  const tokenOutMeta = getTokenBySymbol(tokenOut, 1);
  const inNative = tokenInMeta ? isNativeToken(tokenInMeta.address) : false;
  const outNative = tokenOutMeta ? isNativeToken(tokenOutMeta.address) : false;
  const ethNativeLeg = inNative || outNative;

  const u2 = getUniswapWrapperV2Config();
  const useV2 = ethNativeLeg
    ? !!(u2.enabled && u2.wrapperAddress && u2.nativeQuoteEnabled)
    : false;

  if (ethNativeLeg && (!u2.enabled || !u2.wrapperAddress || !u2.nativeQuoteEnabled)) {
    throw new Error(
      'ETH native swaps require Uniswap wrapper V2 (enable VITE_UNISWAP_WRAPPER_V2_* and native quote flag).',
    );
  }

  // Prefer multi-hop wrapper V3 for ERC20-only allowlisted pairs when enabled (still commission-only).
  if (!ethNativeLeg) {
    const u3 = getUniswapWrapperV3Config();
    if (
      u3.enabled &&
      u3.wrapperAddress &&
      tokenInMeta &&
      tokenOutMeta &&
      isUniswapWrapperV3CommissionEligible(1, tokenInMeta, tokenOutMeta)
    ) {
      try {
        const best = await getQuoteFromProvider(
          'uniswap-v3-wrapper-v3',
          tokenIn,
          tokenOut,
          amountIn,
          1,
          slippage,
          null,
        );
        obsAggRoute({
          chainId: 1,
          routeMode: 'commission_strict_best',
          tokenIn,
          tokenOut,
          bestProvider: best.provider,
          runnerUp: '',
          reason: 'Commission required: Swaperex Uniswap wrapper V3 (multi-hop) when available.',
          lane: 'eth_commission_strict',
        });
        return {
          best,
          alternative: null,
          selectionReason:
            'Commission required: Swaperex Uniswap wrapper V3 (multi-hop) when available.',
        };
      } catch {
        // Fall through to legacy wrapper V1/V2.
      }
    }
  }

  const provider: QuoteProvider = useV2 ? 'uniswap-v3-wrapper-v2' : 'uniswap-v3-wrapper';
  const best = await getQuoteFromProvider(
    provider,
    tokenIn,
    tokenOut,
    amountIn,
    1,
    slippage,
    ethNativeLeg ? 'uniswap-v3-wrapper-v2' : null,
  );

  obsAggRoute({
    chainId: 1,
    routeMode: 'commission_strict_best',
    tokenIn,
    tokenOut,
    bestProvider: best.provider,
    runnerUp: '',
    reason: 'Commission required: Swaperex Uniswap wrapper route only.',
    lane: 'eth_commission_strict',
  });

  return {
    best,
    alternative: null,
    selectionReason: 'Commission required: Swaperex Uniswap wrapper route only.',
  };
}

async function commissionStrictBscBestQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  slippage: number,
): Promise<AggregatedQuoteResult> {
  const cfg = getPancakeWrapperV2Config();
  if (!cfg.enabled || !cfg.wrapperAddress) {
    throw new Error(
      'Commission-required mode on BNB Chain requires Pancake wrapper V2 (set VITE_PANCAKE_WRAPPER_V2_*).',
    );
  }

  const best = await getQuoteFromProvider(
    'pancakeswap-v3-wrapper-v2',
    tokenIn,
    tokenOut,
    amountIn,
    56,
    slippage,
    'pancakeswap-v3-wrapper-v2',
  );

  obsAggRoute({
    chainId: 56,
    routeMode: 'commission_strict_best',
    tokenIn,
    tokenOut,
    bestProvider: best.provider,
    runnerUp: '',
    reason: 'Commission required: Swaperex Pancake wrapper V2 route only.',
    lane: 'bsc_commission_strict',
  });

  return {
    best,
    alternative: null,
    selectionReason: 'Commission required: Swaperex Pancake wrapper V2 route only.',
  };
}

// Supported chain IDs: all chains where 1inch works
const SUPPORTED_CHAINS = [1, 56, 137, 42161, 10, 43114, 100, 250, 8453] as const;
type SupportedChainId = (typeof SUPPORTED_CHAINS)[number];

/**
 * PHASE 11: Provider types for multi-chain support
 */
export type QuoteProvider =
  | 'uniswap-v3'
  | 'uniswap-v3-wrapper'
  | 'uniswap-v3-wrapper-v2'
  | 'uniswap-v3-wrapper-v3'
  | 'pancakeswap-v3'
  | 'pancakeswap-v3-wrapper'
  | 'pancakeswap-v3-wrapper-v2'
  | '1inch';

/** User routing preference: compare all sources, or fix one execution venue. */
export type QuoteRouteMode = 'best' | QuoteProvider;

const ROUTE_PROVIDER_LABEL: Record<QuoteProvider, string> = {
  '1inch': '1inch',
  'uniswap-v3': 'Uniswap V3',
  'uniswap-v3-wrapper': 'Uniswap V3 (Swaperex wrapper)',
  'uniswap-v3-wrapper-v2': 'Uniswap V3 (Swaperex wrapper V2)',
  'uniswap-v3-wrapper-v3': 'Uniswap V3 (Swaperex wrapper V3 · canary)',
  'pancakeswap-v3': 'PancakeSwap V3',
  'pancakeswap-v3-wrapper': 'PancakeSwap V3 (Swaperex wrapper)',
  'pancakeswap-v3-wrapper-v2': 'PancakeSwap V3 (Swaperex wrapper V2 · canary)',
};

/** Human-readable label for settings and preview. */
export function formatQuoteRoutePreferenceLabel(mode: QuoteRouteMode): string {
  if (mode === 'best') return 'Best price';
  return ROUTE_PROVIDER_LABEL[mode] ?? mode;
}

/** Whether a fixed route is unavailable on the current chain (UI disables the option). */
export function isQuoteRouteModeDisabled(mode: QuoteRouteMode, chainId: number): boolean {
  if (mode === 'best') return false;
  if (mode === 'uniswap-v3-wrapper') return true;
  if (mode === 'pancakeswap-v3-wrapper') return true;
  if (mode === 'pancakeswap-v3-wrapper-v2') {
    return chainId !== 56 || !getPancakeWrapperV2Config().enabled;
  }
  if (mode === 'uniswap-v3-wrapper-v2') {
    return chainId !== 1 || !getUniswapWrapperV2Config().enabled;
  }
  if (mode === 'uniswap-v3-wrapper-v3') {
    return true;
  }
  if (mode === 'uniswap-v3') return chainId !== 1;
  if (mode === 'pancakeswap-v3') return chainId !== 56;
  return false;
}

function assertForcedRouteAllowed(provider: QuoteProvider, chainId: number): void {
  if (provider === 'uniswap-v3-wrapper') {
    throw new Error(
      'The Uniswap fee wrapper cannot be selected as a fixed route. Choose Best price or Uniswap; the wrapper applies automatically when enabled in the environment.',
    );
  }
  if (provider === 'uniswap-v3-wrapper-v3') {
    throw new Error(
      'The Uniswap fee wrapper V3 cannot be selected as a fixed route. It is used only in commission mode when enabled and the pair is allowlisted.',
    );
  }
  if (provider === 'pancakeswap-v3-wrapper') {
    throw new Error(
      'The Pancake fee wrapper cannot be selected as a fixed route. Choose Best price or Pancake; the wrapper applies automatically when enabled in the environment.',
    );
  }
  if (provider === 'pancakeswap-v3-wrapper-v2') {
    if (chainId !== 56) {
      throw new Error(
        'Pancake fee wrapper V2 is only available on BNB Chain. Switch networks or choose another route.',
      );
    }
    const v2 = getPancakeWrapperV2Config();
    if (!v2.enabled || !v2.wrapperAddress) {
      throw new Error(
        'Pancake fee wrapper V2 is not enabled. Set VITE_PANCAKE_WRAPPER_V2_ENABLED and a valid VITE_PANCAKE_WRAPPER_V2_ADDRESS.',
      );
    }
    return;
  }
  if (provider === 'uniswap-v3-wrapper-v2') {
    if (chainId !== 1) {
      throw new Error(
        'Uniswap fee wrapper V2 is only available on Ethereum mainnet. Switch networks or choose another route.',
      );
    }
    const u2 = getUniswapWrapperV2Config();
    if (!u2.enabled || !u2.wrapperAddress) {
      throw new Error(
        'Uniswap fee wrapper V2 is not enabled. Set VITE_UNISWAP_WRAPPER_V2_ENABLED and a valid VITE_UNISWAP_WRAPPER_V2_ADDRESS.',
      );
    }
    return;
  }
  if (provider === 'uniswap-v3' && chainId !== 1) {
    throw new Error(
      'Uniswap V3 is only available on Ethereum mainnet. Switch networks or choose Best price or 1inch.',
    );
  }
  if (provider === 'pancakeswap-v3' && chainId !== 56) {
    throw new Error(
      'PancakeSwap is only available on BNB Chain. Switch networks or choose Best price or 1inch.',
    );
  }
}

async function getForcedProviderQuoteResult(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  chainId: number,
  slippage: number,
  provider: QuoteProvider,
): Promise<AggregatedQuoteResult> {
  assertForcedRouteAllowed(provider, chainId);

  const best = await getQuoteFromProvider(provider, tokenIn, tokenOut, amountIn, chainId, slippage, provider);

  const selectionReason = `${ROUTE_PROVIDER_LABEL[provider]} (fixed route — selected in settings)`;
  obsAggRoute({
    chainId,
    routeMode: `forced:${provider}`,
    tokenIn,
    tokenOut,
    bestProvider: best.provider,
    runnerUp: '',
    reason: selectionReason,
    lane: 'forced',
  });

  return {
    best,
    alternative: null,
    selectionReason,
  };
}

/**
 * Unified quote result that works with all providers
 */
export interface AggregatedQuote {
  // Core quote data
  amountIn: string;
  amountOut: string;
  amountOutFormatted: string;
  minAmountOut: string;
  minAmountOutFormatted: string;

  // Provider info
  provider: QuoteProvider;
  providerDetails: {
    feeTier?: number;      // Uniswap/PancakeSwap fee tier
    protocols?: unknown[]; // 1inch protocols used
    gas: number;
    /** Packed Uniswap V3 path bytes (`0x…`) when executing via Swaperex wrapper V3. */
    wrapperV3Path?: `0x${string}`;
  };

  // Chain info
  chainId: number;

  // Price impact
  priceImpact: string;

  // For comparison
  amountOutRaw: bigint;

  // Original quote for tx building
  originalQuote: OneInchQuoteResult | UniswapQuoteResult | PancakeQuoteResult | UniswapWrapperV3QuoteResult;
}

/**
 * Full aggregator output: executable best quote plus runner-up (when compared) and selection rationale.
 */
export interface AggregatedQuoteResult {
  best: AggregatedQuote;
  alternative: AggregatedQuote | null;
  selectionReason: string;
}

/**
 * 1inch auth is server-side (ONEINCH_API_KEY on backend-signals proxy). Kept for call-site compatibility.
 */
function getOneInchApiKey(): string | undefined {
  return undefined;
}

/**
 * Convert 1inch quote to unified format
 */
function normalizeOneInchQuote(
  quote: OneInchQuoteResult,
  slippage: number,
  tokenOutDecimals: number,
  chainId: number
): AggregatedQuote {
  const minAmountOut = getOneInchMinAmountOut(quote.dstAmount, slippage);

  // Format minAmountOut
  const minAmountOutFormatted = formatFromWei(minAmountOut, tokenOutDecimals);

  return {
    amountIn: quote.srcAmount,
    amountOut: quote.dstAmount,
    amountOutFormatted: quote.dstAmountFormatted,
    minAmountOut,
    minAmountOutFormatted,
    provider: '1inch',
    providerDetails: {
      protocols: quote.protocols,
      gas: quote.gas,
    },
    chainId,
    priceImpact: quote.priceImpact,
    amountOutRaw: BigInt(quote.dstAmount),
    originalQuote: quote,
  };
}

/**
 * Convert Uniswap quote to unified format
 */
function normalizeUniswapQuote(
  quote: UniswapQuoteResult,
  slippage: number,
  tokenOutDecimals: number
): AggregatedQuote {
  const minAmountOut = getUniswapMinAmountOut(quote, slippage);

  // Format minAmountOut
  const minAmountOutFormatted = formatFromWei(minAmountOut, tokenOutDecimals);

  return {
    amountIn: quote.amountIn,
    amountOut: quote.amountOut,
    amountOutFormatted: quote.amountOutFormatted,
    minAmountOut,
    minAmountOutFormatted,
    provider: 'uniswap-v3',
    providerDetails: {
      feeTier: quote.feeTier,
      gas: parseInt(quote.gasEstimate, 10) || 200000,
    },
    chainId: 1, // Uniswap is ETH only
    priceImpact: quote.priceImpact,
    amountOutRaw: BigInt(quote.amountOut),
    originalQuote: quote,
  };
}

/**
 * Normalize fee-wrapper quote (net output) into the same AggregatedQuote shape as direct Uniswap.
 * Used only after the aggregator already selected a plain `uniswap-v3` quote (no Best-price changes).
 */
export function normalizeUniswapWrapperAggregatedQuote(
  quote: UniswapQuoteResult,
  slippage: number,
  tokenOutDecimals: number,
  chainId: number,
): AggregatedQuote {
  const minAmountOut = getUniswapMinAmountOut(quote, slippage);
  const minAmountOutFormatted = formatFromWei(minAmountOut, tokenOutDecimals);

  return {
    amountIn: quote.amountIn,
    amountOut: quote.amountOut,
    amountOutFormatted: quote.amountOutFormatted,
    minAmountOut,
    minAmountOutFormatted,
    provider: 'uniswap-v3-wrapper',
    providerDetails: {
      feeTier: quote.feeTier,
      gas: parseInt(quote.gasEstimate, 10) || 300000,
    },
    chainId,
    priceImpact: quote.priceImpact,
    amountOutRaw: BigInt(quote.amountOut),
    originalQuote: quote,
  };
}

/** Normalize Uniswap fee-wrapper **V3** multi-hop quote (net output) for execution display. */
export function normalizeUniswapWrapperV3AggregatedQuote(
  quote: UniswapWrapperV3QuoteResult,
  slippage: number,
  tokenOutDecimals: number,
  chainId: number,
): AggregatedQuote {
  const minAmountOut = getUniswapMinAmountOut(quote, slippage);
  const minAmountOutFormatted = formatFromWei(minAmountOut, tokenOutDecimals);

  return {
    amountIn: quote.amountIn,
    amountOut: quote.amountOut,
    amountOutFormatted: quote.amountOutFormatted,
    minAmountOut,
    minAmountOutFormatted,
    provider: 'uniswap-v3-wrapper-v3',
    providerDetails: {
      feeTier: quote.feeTier,
      gas: parseInt(quote.gasEstimate, 10) || 380000,
      wrapperV3Path: quote.wrapperPath,
    },
    chainId,
    priceImpact: quote.priceImpact,
    amountOutRaw: BigInt(quote.amountOut),
    originalQuote: quote,
  };
}

/** Normalize Uniswap fee-wrapper **V2** quote (net output) for execution display. */
export function normalizeUniswapWrapperV2AggregatedQuote(
  quote: UniswapQuoteResult,
  slippage: number,
  tokenOutDecimals: number,
  chainId: number,
): AggregatedQuote {
  const minAmountOut = getUniswapMinAmountOut(quote, slippage);
  const minAmountOutFormatted = formatFromWei(minAmountOut, tokenOutDecimals);

  return {
    amountIn: quote.amountIn,
    amountOut: quote.amountOut,
    amountOutFormatted: quote.amountOutFormatted,
    minAmountOut,
    minAmountOutFormatted,
    provider: 'uniswap-v3-wrapper-v2',
    providerDetails: {
      feeTier: quote.feeTier,
      gas: parseInt(quote.gasEstimate, 10) || 320000,
    },
    chainId,
    priceImpact: quote.priceImpact,
    amountOutRaw: BigInt(quote.amountOut),
    originalQuote: quote,
  };
}

/**
 * Normalize Pancake fee-wrapper quote (net output) after the aggregator already selected direct `pancakeswap-v3`.
 */
export function normalizePancakeWrapperAggregatedQuote(
  quote: PancakeQuoteResult,
  slippage: number,
  tokenOutDecimals: number,
  chainId: number,
): AggregatedQuote {
  const minAmountOut = getPancakeMinAmountOut(quote, slippage);
  const minAmountOutFormatted = formatFromWei(minAmountOut, tokenOutDecimals);

  return {
    amountIn: quote.amountIn,
    amountOut: quote.amountOut,
    amountOutFormatted: quote.amountOutFormatted,
    minAmountOut,
    minAmountOutFormatted,
    provider: 'pancakeswap-v3-wrapper',
    providerDetails: {
      feeTier: quote.feeTier,
      gas: parseInt(quote.gasEstimate, 10) || 300000,
    },
    chainId,
    priceImpact: quote.priceImpact,
    amountOutRaw: BigInt(quote.amountOut),
    originalQuote: quote,
  };
}

/** Normalize Pancake fee-wrapper **V2** quote (net output) for execution display. */
export function normalizePancakeWrapperV2AggregatedQuote(
  quote: PancakeQuoteResult,
  slippage: number,
  tokenOutDecimals: number,
  chainId: number,
): AggregatedQuote {
  const minAmountOut = getPancakeMinAmountOut(quote, slippage);
  const minAmountOutFormatted = formatFromWei(minAmountOut, tokenOutDecimals);

  return {
    amountIn: quote.amountIn,
    amountOut: quote.amountOut,
    amountOutFormatted: quote.amountOutFormatted,
    minAmountOut,
    minAmountOutFormatted,
    provider: 'pancakeswap-v3-wrapper-v2',
    providerDetails: {
      feeTier: quote.feeTier,
      gas: parseInt(quote.gasEstimate, 10) || 300000,
    },
    chainId,
    priceImpact: quote.priceImpact,
    amountOutRaw: BigInt(quote.amountOut),
    originalQuote: quote,
  };
}

/**
 * PHASE 11: Convert PancakeSwap quote to unified format
 */
function normalizePancakeQuote(
  quote: PancakeQuoteResult,
  slippage: number,
  tokenOutDecimals: number
): AggregatedQuote {
  const minAmountOut = getPancakeMinAmountOut(quote, slippage);

  // Format minAmountOut
  const minAmountOutFormatted = formatFromWei(minAmountOut, tokenOutDecimals);

  return {
    amountIn: quote.amountIn,
    amountOut: quote.amountOut,
    amountOutFormatted: quote.amountOutFormatted,
    minAmountOut,
    minAmountOutFormatted,
    provider: 'pancakeswap-v3',
    providerDetails: {
      feeTier: quote.feeTier,
      gas: parseInt(quote.gasEstimate, 10) || 250000,
    },
    chainId: 56, // PancakeSwap is BSC only
    priceImpact: quote.priceImpact,
    amountOutRaw: BigInt(quote.amountOut),
    originalQuote: quote,
  };
}

/**
 * Format wei amount to human-readable
 */
function formatFromWei(amount: string, decimals: number): string {
  const padded = amount.padStart(decimals + 1, '0');
  const wholePart = padded.slice(0, -decimals) || '0';
  const fractionPart = padded.slice(-decimals).replace(/0+$/, '');
  return fractionPart ? `${wholePart}.${fractionPart}` : wholePart;
}

/**
 * Get best quote from all available providers
 *
 * PHASE 10 + 11 STRATEGY:
 * ETH (chainId 1):
 * - 1inch (primary)
 * - Uniswap V3 (fallback)
 *
 * BSC (chainId 56):
 * - 1inch (primary)
 * - PancakeSwap V3 (fallback)
 *
 * @param tokenIn - Input token symbol
 * @param tokenOut - Output token symbol
 * @param amountIn - Input amount (human readable)
 * @param chainId - Chain ID (1 = ETH, 56 = BSC, 137 = Polygon, etc.)
 * @param slippage - Slippage tolerance percentage
 * @param routeMode - Best price (compare venues) or force a single provider
 */
export async function getAggregatedQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  chainId: number = 1,
  slippage: number = 0.5,
  routeMode: QuoteRouteMode = 'best',
  walletAddress: string | null = null,
): Promise<AggregatedQuoteResult> {
  if (!SUPPORTED_CHAINS.includes(chainId as SupportedChainId)) {
    throw new Error(`Quote aggregator only supports chains: ${SUPPORTED_CHAINS.join(', ')}`);
  }

  if (routeMode !== 'best') {
    assertCommissionFixedRouteAllowed(routeMode, chainId);
    aggDebugLog('[Aggregator] Fixed route mode:', routeMode, { tokenIn, tokenOut, amountIn, chainId });
    return getForcedProviderQuoteResult(tokenIn, tokenOut, amountIn, chainId, slippage, routeMode);
  }

  if (isCommissionRequiredMode()) {
    if (chainId === 1) {
      return commissionStrictEthereumBestQuote(tokenIn, tokenOut, amountIn, slippage);
    }
    if (chainId === 56) {
      return commissionStrictBscBestQuote(tokenIn, tokenOut, amountIn, slippage);
    }
    throw new Error(
      'Commission-required mode: swaps are only supported on Ethereum and BNB Chain. Switch network or disable commission mode.',
    );
  }

  const tokenOutData = getTokenBySymbol(tokenOut, chainId);
  if (!tokenOutData) {
    throw new Error(`Unknown token: ${tokenOut}`);
  }

  const apiKey = getOneInchApiKey();

  aggDebugLog('[Aggregator] Fetching quotes...', { tokenIn, tokenOut, amountIn, chainId });

  // Route based on chain
  if (chainId === 1) {
    return getEthereumQuote(tokenIn, tokenOut, amountIn, slippage, tokenOutData.decimals, apiKey);
  } else if (chainId === 56) {
    return getBscQuote(tokenIn, tokenOut, amountIn, slippage, tokenOutData.decimals, apiKey, walletAddress);
  }

  // All other supported chains: use 1inch as sole provider
  return getOneInchOnlyQuote(tokenIn, tokenOut, amountIn, chainId, slippage, tokenOutData.decimals, apiKey);
}

/**
 * Get quote for Ethereum Mainnet (1inch + Uniswap)
 */
async function getEthereumQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  slippage: number,
  tokenOutDecimals: number,
  apiKey?: string
): Promise<AggregatedQuoteResult> {
  // Fetch both quotes in parallel
  const [oneInchResult, uniswapResult] = await Promise.allSettled([
    getBestOneInchQuote(tokenIn, tokenOut, amountIn, 1, apiKey),
    getUniswapQuote(tokenIn, tokenOut, amountIn, 1),
  ]);

  // Extract successful quotes
  let oneInchQuote: AggregatedQuote | null = null;
  let directQuote: AggregatedQuote | null = null;

  if (oneInchResult.status === 'fulfilled' && oneInchResult.value) {
    oneInchQuote = normalizeOneInchQuote(oneInchResult.value, slippage, tokenOutDecimals, 1);
    aggDebugLog('[Aggregator] 1inch quote:', oneInchQuote.amountOutFormatted, tokenOut);
  } else {
    console.warn('[Aggregator] 1inch quote failed:', oneInchResult.status === 'rejected' ? oneInchResult.reason : 'No quote returned');
  }

  if (uniswapResult.status === 'fulfilled' && uniswapResult.value) {
    directQuote = normalizeUniswapQuote(uniswapResult.value, slippage, tokenOutDecimals);
    aggDebugLog('[Aggregator] Uniswap quote:', directQuote.amountOutFormatted, tokenOut);
  } else {
    console.warn('[Aggregator] Uniswap quote failed:', uniswapResult.status === 'rejected' ? uniswapResult.reason : 'No quote returned');
  }

  // Select best quote
  const comparison = selectBestQuote(oneInchQuote, directQuote, 'Uniswap');

  aggDebugLog('[Aggregator] Selected:', comparison.best.provider, '|', comparison.selectionReason);

  obsAggRoute({
    chainId: 1,
    routeMode: 'best',
    tokenIn,
    tokenOut,
    bestProvider: comparison.best.provider,
    runnerUp: comparison.alternative?.provider ?? '',
    reason: comparison.selectionReason,
    lane: 'eth',
  });

  return comparison;
}

/**
 * PHASE 11: Get quote for BSC (1inch + PancakeSwap)
 */
async function getBscQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  slippage: number,
  tokenOutDecimals: number,
  apiKey?: string,
  walletAddress: string | null = null,
): Promise<AggregatedQuoteResult> {
  aggDebugLog('[Aggregator] BSC quote request:', { tokenIn, tokenOut, amountIn });

  // Fetch both quotes in parallel
  const [oneInchResult, pancakeResult] = await Promise.allSettled([
    getBestOneInchQuote(tokenIn, tokenOut, amountIn, 56, apiKey),
    getBestPancakeQuote(tokenIn, tokenOut, amountIn),
  ]);

  // Extract successful quotes
  let oneInchQuote: AggregatedQuote | null = null;
  let directQuote: AggregatedQuote | null = null;

  if (oneInchResult.status === 'fulfilled' && oneInchResult.value) {
    oneInchQuote = normalizeOneInchQuote(oneInchResult.value, slippage, tokenOutDecimals, 56);
    aggDebugLog('[Aggregator] 1inch (BSC) quote:', oneInchQuote.amountOutFormatted, tokenOut);
  } else {
    console.warn('[Aggregator] 1inch (BSC) quote failed:', oneInchResult.status === 'rejected' ? oneInchResult.reason : 'No quote returned');
  }

  if (pancakeResult.status === 'fulfilled' && pancakeResult.value) {
    directQuote = normalizePancakeQuote(pancakeResult.value, slippage, tokenOutDecimals);
    aggDebugLog('[Aggregator] PancakeSwap quote:', directQuote.amountOutFormatted, tokenOut);
  } else {
    console.warn('[Aggregator] PancakeSwap quote failed:', pancakeResult.status === 'rejected' ? pancakeResult.reason : 'No quote returned');
  }

  // Select best quote (existing behavior: 1inch vs direct Pancake)
  let comparison = selectBestQuote(oneInchQuote, directQuote, 'PancakeSwap');

  // Controlled canary: optionally allow Pancake Wrapper V2 participation as an additional candidate.
  // Never forces V2 globally; fully reversible via VITE_PANCAKE_WRAPPER_V2_CANARY_PCT (default 0).
  try {
    const cfg = getPancakeWrapperV2Config();
    const canaryPct = getPancakeWrapperV2CanaryPct();
    const routeKey = 'pancakeswap-v3-wrapper-v2';

    if (cfg.enabled && cfg.wrapperAddress && canaryPct > 0) {
      const tokenInMeta = getTokenBySymbol(tokenIn, 56);
      const tokenOutMeta = getTokenBySymbol(tokenOut, 56);

      const eligible =
        isPancakeWrapperV2ExecutionEligible(56, tokenInMeta, tokenOutMeta) &&
        tokenInMeta != null &&
        tokenOutMeta != null &&
        !isNativeToken(tokenInMeta.address) &&
        !isNativeToken(tokenOutMeta.address);

      if (eligible) {
        const v2Quote = await getBestPancakeWrapperV2Quote(tokenIn, tokenOut, amountIn);
        if (v2Quote) {
          const { bucket } = computeCanaryBucket({
            wallet: walletAddress,
            chainId: 56,
            tokenIn,
            tokenOut,
          });
          const selected = bucket / CANARY_BUCKET_MOD < canaryPct;
          aggDebugLog('pancake_wrapper_v2_canary_decision', {
            wallet: walletAddress,
            bucket,
            canaryPct,
            selected,
          });

          if (selected) {
            const v2Agg = normalizePancakeWrapperV2AggregatedQuote(v2Quote, slippage, tokenOutDecimals, 56);

            const candidates = [comparison.best, comparison.alternative, v2Agg].filter(
              (q): q is AggregatedQuote => q != null,
            );
            candidates.sort((a, b) => (a.amountOutRaw > b.amountOutRaw ? -1 : a.amountOutRaw < b.amountOutRaw ? 1 : 0));

            const best = candidates[0];
            const runnerUp = candidates[1] ?? null;
            const selectionReason =
              best.provider === 'pancakeswap-v3-wrapper-v2'
                ? `${comparison.selectionReason} · Canary: Wrapper V2 participated (pct=${canaryPct}) and won on net output.`
                : `${comparison.selectionReason} · Canary: Wrapper V2 participated (pct=${canaryPct}) but did not win.`;

            comparison = {
              best,
              alternative: runnerUp,
              selectionReason,
            };
          } else {
            swapObsLog('pancake_wrapper_v2_skip', {
              tokenIn,
              tokenOut,
              nativeEnabled: String(cfg.nativeEnabled),
              reason: 'canary_not_selected',
              routeKey,
            });
          }
        }
      }
    }
  } catch (err) {
    // Never break existing routing on canary path errors.
    console.warn('[Aggregator] Pancake wrapper V2 canary evaluation failed; ignoring.', err);
  }

  aggDebugLog('[Aggregator] Selected:', comparison.best.provider, '|', comparison.selectionReason);

  obsAggRoute({
    chainId: 56,
    routeMode: 'best',
    tokenIn,
    tokenOut,
    bestProvider: comparison.best.provider,
    runnerUp: comparison.alternative?.provider ?? '',
    reason: comparison.selectionReason,
    lane: 'bsc',
  });

  return comparison;
}

/**
 * Get quote for chains with 1inch-only support
 * (Polygon, Arbitrum, Optimism, Avalanche, Gnosis, Fantom, Base)
 */
async function getOneInchOnlyQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  chainId: number,
  slippage: number,
  tokenOutDecimals: number,
  apiKey?: string
): Promise<AggregatedQuoteResult> {
  aggDebugLog('[Aggregator] 1inch-only quote request:', { tokenIn, tokenOut, amountIn, chainId });

  const oneInchResult = await getBestOneInchQuote(tokenIn, tokenOut, amountIn, chainId, apiKey);

  if (!oneInchResult) {
    throw new Error(`No quote available from 1inch for chain ${chainId}`);
  }

  const best = normalizeOneInchQuote(oneInchResult, slippage, tokenOutDecimals, chainId);
  aggDebugLog('[Aggregator] 1inch quote:', best.amountOutFormatted, tokenOut);

  obsAggRoute({
    chainId,
    routeMode: 'best',
    tokenIn,
    tokenOut,
    bestProvider: best.provider,
    runnerUp: '',
    reason: '1inch is the available route on this network',
    lane: '1inch_only',
  });

  return {
    best,
    alternative: null,
    selectionReason: '1inch is the available route on this network',
  };
}

/**
 * Select the best quote based on output amount
 * @param fallbackName - Name of the direct DEX (Uniswap for ETH, PancakeSwap for BSC)
 */
function selectBestQuote(
  oneInchQuote: AggregatedQuote | null,
  directQuote: AggregatedQuote | null,
  fallbackName: string = 'Direct'
): AggregatedQuoteResult {
  // If only one quote available, use it
  if (oneInchQuote && !directQuote) {
    return {
      best: oneInchQuote,
      alternative: null,
      selectionReason: 'Only 1inch was available for this route',
    };
  }

  if (!oneInchQuote && directQuote) {
    return {
      best: directQuote,
      alternative: null,
      selectionReason: `Using ${fallbackName} because 1inch was unavailable`,
    };
  }

  if (!oneInchQuote && !directQuote) {
    throw new Error('No quotes available from any provider');
  }

  // Both quotes available - compare amountOut
  const oneInchAmount = oneInchQuote!.amountOutRaw;
  const directAmount = directQuote!.amountOutRaw;

  // Calculate difference as percentage
  const diff = Number((oneInchAmount - directAmount) * 10000n / directAmount) / 100;

  if (oneInchAmount >= directAmount) {
    return {
      best: oneInchQuote!,
      alternative: directQuote!,
      selectionReason: `Selected 1inch for the best quoted output (+${Math.abs(diff).toFixed(2)}%)`,
    };
  } else {
    return {
      best: directQuote!,
      alternative: oneInchQuote!,
      selectionReason: `Selected ${fallbackName} for the best quoted output (+${Math.abs(diff).toFixed(2)}%)`,
    };
  }
}

/**
 * Get quote with explicit provider preference
 * Used when user wants to force a specific provider
 */
export async function getQuoteFromProvider(
  provider: QuoteProvider,
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  chainId: number = 1,
  slippage: number = 0.5,
  routeMode: QuoteRouteMode | null = null,
): Promise<AggregatedQuote> {
  const tokenOutData = getTokenBySymbol(tokenOut, chainId);
  if (!tokenOutData) {
    throw new Error(`Unknown token: ${tokenOut}`);
  }

  if (isCommissionRequiredMode() && !isCommissionWrapperExecutionProvider(provider)) {
    throw new Error('Commission-required mode: only Swaperex wrapper routes can be quoted.');
  }

  if (provider === '1inch') {
    const apiKey = getOneInchApiKey();
    const quote = await getBestOneInchQuote(tokenIn, tokenOut, amountIn, chainId, apiKey);
    if (!quote) {
      throw new Error(
        'No quote from 1inch for this pair or amount. Try another size, or switch to Best price to compare routes.',
      );
    }
    return normalizeOneInchQuote(quote, slippage, tokenOutData.decimals, chainId);
  } else if (provider === 'uniswap-v3') {
    if (chainId !== 1) {
      throw new Error('Uniswap V3 only supports Ethereum mainnet');
    }
    const quote = await getUniswapQuote(tokenIn, tokenOut, amountIn, chainId);
    if (!quote) {
      throw new Error(
        'No Uniswap V3 quote for this pair or amount. Try another size or route.',
      );
    }
    return normalizeUniswapQuote(quote, slippage, tokenOutData.decimals);
  } else if (provider === 'uniswap-v3-wrapper') {
    if (chainId !== 1) {
      throw new Error('Uniswap fee wrapper is only available on Ethereum mainnet');
    }
    const tokenInData = getTokenBySymbol(tokenIn, chainId);
    if (!tokenInData) {
      throw new Error(`Unknown token: ${tokenIn}`);
    }
    if (isNativeToken(tokenInData.address) || isNativeToken(tokenOutData.address)) {
      throw new Error('Native ETH not supported in wrapper');
    }

    aggDebugLog('uniswap_wrapper_quote_apply', {
      tokenIn,
      tokenOut,
      amountIn,
    });

    const wrapperQuote = await getBestWrapperQuote(tokenIn, tokenOut, amountIn, chainId);
    if (!wrapperQuote) {
      throw new Error('Wrapper quote unavailable');
    }
    return normalizeUniswapWrapperAggregatedQuote(
      wrapperQuote,
      slippage,
      tokenOutData.decimals,
      chainId,
    );
  } else if (provider === 'uniswap-v3-wrapper-v3') {
    if (chainId !== 1) {
      throw new Error('Uniswap fee wrapper V3 only supports Ethereum mainnet');
    }
    const cfg = getUniswapWrapperV3Config();
    if (!cfg.enabled || !cfg.wrapperAddress) {
      throw new Error(
        'Uniswap fee wrapper V3 is not enabled or the wrapper address is missing. Check VITE_UNISWAP_WRAPPER_V3_* env.',
      );
    }
    const tokenInData = getTokenBySymbol(tokenIn, 1);
    if (!tokenInData) {
      throw new Error(`Unknown token: ${tokenIn}`);
    }
    if (!isUniswapWrapperV3CommissionEligible(1, tokenInData, tokenOutData)) {
      throw new Error(
        'This pair is not eligible for Uniswap wrapper V3 with current settings or allowlist.',
      );
    }
    const wq = await getBestUniswapWrapperV3Quote(tokenIn, tokenOut, amountIn);
    if (!wq) {
      throw new Error('No Uniswap wrapper V3 quote for this pair or amount.');
    }
    return normalizeUniswapWrapperV3AggregatedQuote(wq, slippage, tokenOutData.decimals, 1);
  } else if (provider === 'uniswap-v3-wrapper-v2') {
    const routeKey = 'uniswap-v3-wrapper-v2';
    const cfg = getUniswapWrapperV2Config();
    const nativeEnabled = cfg.nativeEnabled;
    const nativeQuoteEnabled = cfg.nativeQuoteEnabled;

    const logSkip = (reason: string): void => {
      swapObsLog('uniswap_wrapper_v2_skip', {
        tokenIn,
        tokenOut,
        nativeEnabled: String(nativeEnabled),
        reason,
        routeKey,
      });
    };

    if (chainId !== 1) {
      logSkip('wrong_chain');
      throw new Error('Uniswap fee wrapper V2 only supports Ethereum mainnet');
    }
    if (!cfg.enabled || !cfg.wrapperAddress) {
      logSkip('v2_disabled_or_unconfigured');
      throw new Error(
        'Uniswap fee wrapper V2 is not enabled or the wrapper address is missing. Check VITE_UNISWAP_WRAPPER_V2_* env.',
      );
    }

    const tokenInMeta = getTokenBySymbol(tokenIn, 1);
    const tokenOutMeta = getTokenBySymbol(tokenOut, 1);
    if (!isUniswapWrapperV2QuoteEligible(1, tokenInMeta, tokenOutMeta)) {
      logSkip('pair_ineligible_or_native_quote_disabled');
      throw new Error(
        'This pair is not eligible for Uniswap wrapper V2 with current settings (enable VITE_UNISWAP_WRAPPER_V2_NATIVE_QUOTE_ENABLED for ETH legs).',
      );
    }
    if (
      (tokenInMeta && isNativeToken(tokenInMeta.address)) ||
      (tokenOutMeta && isNativeToken(tokenOutMeta.address))
    ) {
      const isManualRoute = routeMode === 'uniswap-v3-wrapper-v2';
      if (!isManualRoute || !nativeQuoteEnabled) {
        aggDebugLog('uniswap_wrapper_v2_native_blocked', {
          tokenIn,
          tokenOut,
          routeMode,
          flags: { nativeEnabled, nativeQuoteEnabled },
        });
        logSkip(!isManualRoute ? 'native_requires_manual_route' : 'native_quote_flag_off');
        throw new Error(
          'Uniswap wrapper V2 native-leg quoting is not enabled for this deployment.',
        );
      }
      aggDebugLog('uniswap_wrapper_v2_native_enabled', {
        tokenIn,
        tokenOut,
        routeMode,
        flags: { nativeEnabled, nativeQuoteEnabled },
      });
    }

    try {
      const wq = await getBestUniswapWrapperV2Quote(tokenIn, tokenOut, amountIn);
      if (!wq) {
        logSkip('no_quote_all_tiers_failed');
        throw new Error(
          'No Uniswap wrapper V2 quote for this pair or amount. Try another size or fee tier route.',
        );
      }
      const tokenInIsNative = tokenInMeta ? isNativeToken(tokenInMeta.address) : false;
      const tokenOutIsNative = tokenOutMeta ? isNativeToken(tokenOutMeta.address) : false;
      if (tokenInIsNative || tokenOutIsNative) {
        aggDebugLog('uniswap_wrapper_v2_native_forced', {
          tokenIn,
          tokenOut,
          routeMode,
          flags: { nativeEnabled, nativeQuoteEnabled },
        });
        swapObsLog('uniswap_wrapper_v2_native_quote_apply', {
          tokenIn,
          tokenOut,
          routeMode: String(routeMode ?? ''),
          nativeLane: tokenInIsNative ? 'native_in' : tokenOutIsNative ? 'native_out' : 'none',
          routeKey,
        });
      }
      swapObsLog('uniswap_wrapper_v2_apply', {
        tokenIn,
        tokenOut,
        nativeEnabled: String(nativeEnabled),
        reason: 'quoted',
        routeKey,
      });
      return normalizeUniswapWrapperV2AggregatedQuote(wq, slippage, tokenOutData.decimals, 1);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown_error';
      const alreadyLoggedNoQuote = msg.startsWith('No Uniswap wrapper V2 quote');
      if (!alreadyLoggedNoQuote) {
        logSkip(msg.length > 280 ? `${msg.slice(0, 277)}...` : msg);
      }
      const tokenInIsNative = tokenInMeta ? isNativeToken(tokenInMeta.address) : false;
      const tokenOutIsNative = tokenOutMeta ? isNativeToken(tokenOutMeta.address) : false;
      if (tokenInIsNative || tokenOutIsNative) {
        swapObsLog('uniswap_wrapper_v2_native_quote_skip', {
          tokenIn,
          tokenOut,
          routeMode: String(routeMode ?? ''),
          nativeLane: tokenInIsNative ? 'native_in' : tokenOutIsNative ? 'native_out' : 'none',
          routeKey,
          reason: msg.length > 160 ? `${msg.slice(0, 157)}...` : msg,
        });
      }
      throw e;
    }
  } else if (provider === 'pancakeswap-v3') {
    if (chainId !== 56) {
      throw new Error('PancakeSwap V3 only supports BSC');
    }
    const quote = await getBestPancakeQuote(tokenIn, tokenOut, amountIn);
    if (!quote) {
      throw new Error(
        'No PancakeSwap quote for this pair or amount. Try another size or route.',
      );
    }
    return normalizePancakeQuote(quote, slippage, tokenOutData.decimals);
  } else if (provider === 'pancakeswap-v3-wrapper-v2') {
    const routeKey = 'pancakeswap-v3-wrapper-v2';
    const cfg = getPancakeWrapperV2Config();
    const nativeEnabled = cfg.nativeEnabled;
    const nativeQuoteEnabled = cfg.nativeQuoteEnabled;

    const logSkip = (reason: string): void => {
      swapObsLog('pancake_wrapper_v2_skip', {
        tokenIn,
        tokenOut,
        nativeEnabled: String(nativeEnabled),
        reason,
        routeKey,
      });
    };

    if (chainId !== 56) {
      logSkip('wrong_chain');
      throw new Error('Pancake fee wrapper V2 only supports BNB Chain');
    }
    if (!cfg.enabled || !cfg.wrapperAddress) {
      logSkip('v2_disabled_or_unconfigured');
      throw new Error(
        'Pancake fee wrapper V2 is not enabled or the wrapper address is missing. Check VITE_PANCAKE_WRAPPER_V2_* env.',
      );
    }

    const tokenInMeta = getTokenBySymbol(tokenIn, 56);
    const tokenOutMeta = getTokenBySymbol(tokenOut, 56);
    if (!isPancakeWrapperV2ExecutionEligible(56, tokenInMeta, tokenOutMeta)) {
      logSkip('pair_ineligible_or_native_disabled');
      throw new Error(
        'This pair is not eligible for Pancake wrapper V2 with current settings (ERC20↔ERC20 only when native wrapper legs are off).',
      );
    }
    if (
      (tokenInMeta && isNativeToken(tokenInMeta.address)) ||
      (tokenOutMeta && isNativeToken(tokenOutMeta.address))
    ) {
      // Native quoting is allowed ONLY for the manual fixed route `pancakeswap-v3-wrapper-v2`, behind a separate flag.
      const isManualRoute = routeMode === 'pancakeswap-v3-wrapper-v2';
      if (!isManualRoute || !nativeQuoteEnabled) {
        aggDebugLog('pancake_wrapper_v2_native_blocked', {
          tokenIn,
          tokenOut,
          routeMode,
          flags: { nativeEnabled, nativeQuoteEnabled },
        });
        logSkip(!isManualRoute ? 'native_requires_manual_route' : 'native_quote_flag_off');
        throw new Error(
          'Pancake wrapper V2 native-leg quoting is not enabled for this deployment.',
        );
      }
      aggDebugLog('pancake_wrapper_v2_native_enabled', {
        tokenIn,
        tokenOut,
        routeMode,
        flags: { nativeEnabled, nativeQuoteEnabled },
      });
    }

    try {
      const wq = await getBestPancakeWrapperV2Quote(tokenIn, tokenOut, amountIn);
      if (!wq) {
        logSkip('no_quote_all_tiers_failed');
        throw new Error(
          'No Pancake wrapper V2 quote for this pair or amount. Try another size or fee tier route.',
        );
      }
      const tokenInIsNative = tokenInMeta ? isNativeToken(tokenInMeta.address) : false;
      const tokenOutIsNative = tokenOutMeta ? isNativeToken(tokenOutMeta.address) : false;
      if (tokenInIsNative || tokenOutIsNative) {
        aggDebugLog('pancake_wrapper_v2_native_forced', {
          tokenIn,
          tokenOut,
          routeMode,
          flags: { nativeEnabled, nativeQuoteEnabled },
        });
        swapObsLog('pancake_wrapper_v2_native_quote_apply', {
          tokenIn,
          tokenOut,
          routeMode: String(routeMode ?? ''),
          nativeLane: tokenInIsNative ? 'native_in' : tokenOutIsNative ? 'native_out' : 'none',
          routeKey,
        });
      }
      swapObsLog('pancake_wrapper_v2_apply', {
        tokenIn,
        tokenOut,
        nativeEnabled: String(nativeEnabled),
        reason: 'quoted',
        routeKey,
      });
      return normalizePancakeWrapperV2AggregatedQuote(wq, slippage, tokenOutData.decimals, 56);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown_error';
      const alreadyLoggedNoQuote = msg.startsWith('No Pancake wrapper V2 quote');
      if (!alreadyLoggedNoQuote) {
        logSkip(msg.length > 280 ? `${msg.slice(0, 277)}...` : msg);
      }
      const tokenInIsNative = tokenInMeta ? isNativeToken(tokenInMeta.address) : false;
      const tokenOutIsNative = tokenOutMeta ? isNativeToken(tokenOutMeta.address) : false;
      if (tokenInIsNative || tokenOutIsNative) {
        swapObsLog('pancake_wrapper_v2_native_quote_skip', {
          tokenIn,
          tokenOut,
          routeMode: String(routeMode ?? ''),
          nativeLane: tokenInIsNative ? 'native_in' : tokenOutIsNative ? 'native_out' : 'none',
          routeKey,
          reason: msg.length > 160 ? `${msg.slice(0, 157)}...` : msg,
        });
      }
      throw e;
    }
  } else if (provider === 'pancakeswap-v3-wrapper') {
    throw new Error(
      'The Pancake fee wrapper cannot be quoted as a fixed route. Choose Best price or Pancake; the wrapper applies automatically when enabled.',
    );
  }

  throw new Error(`Unknown provider: ${provider}`);
}

/**
 * Check if 1inch is available for the current environment
 */
export function isOneInchAvailable(): boolean {
  // 1inch API is available even without API key (with rate limits)
  return true;
}

/**
 * Format quote for display
 */
export function formatAggregatedQuote(quote: AggregatedQuote, fromSymbol: string, toSymbol: string): string {
  return `${fromSymbol} → ${quote.amountOutFormatted} ${toSymbol} via ${quote.provider}`;
}

export default getAggregatedQuote;
