/**
 * Quote Aggregator Service
 *
 * PHASE 10: Routes swaps through best available provider.
 * PHASE 11: Extended to support BSC (PancakeSwap + 1inch)
 *
 * ETH Mainnet (chainId 1):
 * - 1inch (primary)
 * - Uniswap V3 (fallback)
 *
 * BSC (chainId 56):
 * - 1inch (primary)
 * - PancakeSwap V3 (fallback)
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

// PHASE 11: Supported chain IDs
const SUPPORTED_CHAINS = [1, 56] as const;
type SupportedChainId = (typeof SUPPORTED_CHAINS)[number];

/**
 * PHASE 11: Provider types for multi-chain support
 */
export type QuoteProvider = 'uniswap-v3' | 'pancakeswap-v3' | '1inch';

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
 * Quote comparison result
 */
interface QuoteComparison {
  best: AggregatedQuote;
  alternative: AggregatedQuote | null;
  reason: string;
}

/**
 * Get 1inch API key from environment
 */
function getOneInchApiKey(): string | undefined {
  // Check environment variable
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ONEINCH_API_KEY) {
    return import.meta.env.VITE_ONEINCH_API_KEY;
  }
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
 * @param chainId - Chain ID (1 = ETH, 56 = BSC)
 * @param slippage - Slippage tolerance percentage
 */
export async function getAggregatedQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  chainId: number = 1,
  slippage: number = 0.5
): Promise<AggregatedQuote> {
  // PHASE 11: Support ETH and BSC
  if (!SUPPORTED_CHAINS.includes(chainId as SupportedChainId)) {
    throw new Error(`Quote aggregator only supports chains: ${SUPPORTED_CHAINS.join(', ')}`);
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

  throw new Error(`Unsupported chain: ${chainId}`);
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
): Promise<AggregatedQuote> {
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

  console.log('[Aggregator] Selected:', comparison.best.provider, '|', comparison.reason);

  return comparison.best;
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
): Promise<AggregatedQuote> {
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

  console.log('[Aggregator] Selected:', comparison.best.provider, '|', comparison.reason);

  return comparison.best;
}

/**
 * Select the best quote based on output amount
 * @param fallbackName - Name of the direct DEX (Uniswap for ETH, PancakeSwap for BSC)
 */
function selectBestQuote(
  oneInchQuote: AggregatedQuote | null,
  directQuote: AggregatedQuote | null,
  fallbackName: string = 'Direct'
): QuoteComparison {
  // If only one quote available, use it
  if (oneInchQuote && !directQuote) {
    return {
      best: oneInchQuote,
      alternative: null,
      reason: `1inch only (${fallbackName} unavailable)`,
    };
  }

  if (!oneInchQuote && directQuote) {
    return {
      best: directQuote,
      alternative: null,
      reason: `${fallbackName} fallback (1inch unavailable)`,
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
      reason: `1inch better by ${Math.abs(diff).toFixed(2)}%`,
    };
  } else {
    return {
      best: directQuote!,
      alternative: oneInchQuote!,
      reason: `${fallbackName} better by ${Math.abs(diff).toFixed(2)}%`,
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
      throw new Error('1inch quote failed');
    }
    return normalizeOneInchQuote(quote, slippage, tokenOutData.decimals, chainId);
  } else if (provider === 'uniswap-v3') {
    if (chainId !== 1) {
      throw new Error('Uniswap V3 only supports Ethereum mainnet');
    }
    const quote = await getUniswapQuote(tokenIn, tokenOut, amountIn, chainId);
    if (!quote) {
      throw new Error('Uniswap quote failed');
    }
    return normalizeUniswapQuote(quote, slippage, tokenOutData.decimals);
  } else if (provider === 'pancakeswap-v3') {
    if (chainId !== 56) {
      throw new Error('PancakeSwap V3 only supports BSC');
    }
    const quote = await getBestPancakeQuote(tokenIn, tokenOut, amountIn);
    if (!quote) {
      throw new Error('PancakeSwap quote failed');
    }
    return normalizePancakeQuote(quote, slippage, tokenOutData.decimals);
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
