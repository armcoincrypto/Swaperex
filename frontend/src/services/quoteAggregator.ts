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
  getMinAmountOut as getUniswapMinAmountOut,
  type QuoteResult as UniswapQuoteResult,
} from './uniswapQuote';
// PHASE 11: Import PancakeSwap for BSC
import {
  getBestPancakeQuote,
  getPancakeMinAmountOut,
  type PancakeQuoteResult,
} from './pancakeSwapQuote';
import { getTokenBySymbol } from '@/tokens';
import { swapObsLog } from '@/utils/swapObservability';

/** Keep [swap:obs] JSON lines compact in the console */
const OBS_REASON_MAX = 280;

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

// Supported chain IDs: all chains where 1inch works
const SUPPORTED_CHAINS = [1, 56, 137, 42161, 10, 43114, 100, 250, 8453] as const;
type SupportedChainId = (typeof SUPPORTED_CHAINS)[number];

/**
 * PHASE 11: Provider types for multi-chain support
 */
export type QuoteProvider =
  | 'uniswap-v3'
  | 'uniswap-v3-wrapper'
  | 'pancakeswap-v3'
  | 'pancakeswap-v3-wrapper'
  | '1inch';

/** User routing preference: compare all sources, or fix one execution venue. */
export type QuoteRouteMode = 'best' | QuoteProvider;

const ROUTE_PROVIDER_LABEL: Record<QuoteProvider, string> = {
  '1inch': '1inch',
  'uniswap-v3': 'Uniswap V3',
  'uniswap-v3-wrapper': 'Uniswap V3 (Swaperex wrapper)',
  'pancakeswap-v3': 'PancakeSwap V3',
  'pancakeswap-v3-wrapper': 'PancakeSwap V3 (Swaperex wrapper)',
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
  if (provider === 'pancakeswap-v3-wrapper') {
    throw new Error(
      'The Pancake fee wrapper cannot be selected as a fixed route. Choose Best price or Pancake; the wrapper applies automatically when enabled in the environment.',
    );
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

  const best = await getQuoteFromProvider(provider, tokenIn, tokenOut, amountIn, chainId, slippage);

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
  };

  // Chain info
  chainId: number;

  // Price impact
  priceImpact: string;

  // For comparison
  amountOutRaw: bigint;

  // Original quote for tx building
  originalQuote: OneInchQuoteResult | UniswapQuoteResult | PancakeQuoteResult;
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
): Promise<AggregatedQuoteResult> {
  if (!SUPPORTED_CHAINS.includes(chainId as SupportedChainId)) {
    throw new Error(`Quote aggregator only supports chains: ${SUPPORTED_CHAINS.join(', ')}`);
  }

  if (routeMode !== 'best') {
    console.log('[Aggregator] Fixed route mode:', routeMode, { tokenIn, tokenOut, amountIn, chainId });
    return getForcedProviderQuoteResult(tokenIn, tokenOut, amountIn, chainId, slippage, routeMode);
  }

  const tokenOutData = getTokenBySymbol(tokenOut, chainId);
  if (!tokenOutData) {
    throw new Error(`Unknown token: ${tokenOut}`);
  }

  const apiKey = getOneInchApiKey();

  console.log('[Aggregator] Fetching quotes...', { tokenIn, tokenOut, amountIn, chainId });

  // Route based on chain
  if (chainId === 1) {
    return getEthereumQuote(tokenIn, tokenOut, amountIn, slippage, tokenOutData.decimals, apiKey);
  } else if (chainId === 56) {
    return getBscQuote(tokenIn, tokenOut, amountIn, slippage, tokenOutData.decimals, apiKey);
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
    console.log('[Aggregator] 1inch quote:', oneInchQuote.amountOutFormatted, tokenOut);
  } else {
    console.warn('[Aggregator] 1inch quote failed:', oneInchResult.status === 'rejected' ? oneInchResult.reason : 'No quote returned');
  }

  if (uniswapResult.status === 'fulfilled' && uniswapResult.value) {
    directQuote = normalizeUniswapQuote(uniswapResult.value, slippage, tokenOutDecimals);
    console.log('[Aggregator] Uniswap quote:', directQuote.amountOutFormatted, tokenOut);
  } else {
    console.warn('[Aggregator] Uniswap quote failed:', uniswapResult.status === 'rejected' ? uniswapResult.reason : 'No quote returned');
  }

  // Select best quote
  const comparison = selectBestQuote(oneInchQuote, directQuote, 'Uniswap');

  console.log('[Aggregator] Selected:', comparison.best.provider, '|', comparison.selectionReason);

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
  apiKey?: string
): Promise<AggregatedQuoteResult> {
  console.log('[Aggregator] BSC quote request:', { tokenIn, tokenOut, amountIn });

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
    console.log('[Aggregator] 1inch (BSC) quote:', oneInchQuote.amountOutFormatted, tokenOut);
  } else {
    console.warn('[Aggregator] 1inch (BSC) quote failed:', oneInchResult.status === 'rejected' ? oneInchResult.reason : 'No quote returned');
  }

  if (pancakeResult.status === 'fulfilled' && pancakeResult.value) {
    directQuote = normalizePancakeQuote(pancakeResult.value, slippage, tokenOutDecimals);
    console.log('[Aggregator] PancakeSwap quote:', directQuote.amountOutFormatted, tokenOut);
  } else {
    console.warn('[Aggregator] PancakeSwap quote failed:', pancakeResult.status === 'rejected' ? pancakeResult.reason : 'No quote returned');
  }

  // Select best quote
  const comparison = selectBestQuote(oneInchQuote, directQuote, 'PancakeSwap');

  console.log('[Aggregator] Selected:', comparison.best.provider, '|', comparison.selectionReason);

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
  console.log('[Aggregator] 1inch-only quote request:', { tokenIn, tokenOut, amountIn, chainId });

  const oneInchResult = await getBestOneInchQuote(tokenIn, tokenOut, amountIn, chainId, apiKey);

  if (!oneInchResult) {
    throw new Error(`No quote available from 1inch for chain ${chainId}`);
  }

  const best = normalizeOneInchQuote(oneInchResult, slippage, tokenOutDecimals, chainId);
  console.log('[Aggregator] 1inch quote:', best.amountOutFormatted, tokenOut);

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
  slippage: number = 0.5
): Promise<AggregatedQuote> {
  const tokenOutData = getTokenBySymbol(tokenOut, chainId);
  if (!tokenOutData) {
    throw new Error(`Unknown token: ${tokenOut}`);
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
