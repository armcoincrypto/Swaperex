/**
 * Quote Aggregator Service
 *
 * PHASE 10: Routes swaps through best available provider.
 *
 * Priority:
 * 1. 1inch (aggregator - finds best route across DEXes)
 * 2. Uniswap V3 (fallback - direct pool access)
 *
 * The provider with better output amount wins.
 * Falls back to Uniswap if 1inch fails.
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
import { getTokenBySymbol } from '@/tokens';

/**
 * Unified quote result that works with both providers
 */
export interface AggregatedQuote {
  // Core quote data
  amountIn: string;
  amountOut: string;
  amountOutFormatted: string;
  minAmountOut: string;
  minAmountOutFormatted: string;

  // Provider info
  provider: 'uniswap-v3' | '1inch';
  providerDetails: {
    feeTier?: number;      // Uniswap fee tier
    protocols?: unknown[]; // 1inch protocols used
    gas: number;
  };

  // Price impact
  priceImpact: string;

  // For comparison
  amountOutRaw: bigint;

  // Original quote for tx building
  originalQuote: OneInchQuoteResult | UniswapQuoteResult;
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
  tokenOutDecimals: number
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
 * PHASE 10 STRATEGY:
 * 1. Try 1inch first (aggregator usually finds better routes)
 * 2. Try Uniswap V3 as fallback/comparison
 * 3. Return the quote with best amountOut
 *
 * @param tokenIn - Input token symbol
 * @param tokenOut - Output token symbol
 * @param amountIn - Input amount (human readable)
 * @param chainId - Chain ID (must be 1 for Phase 10)
 * @param slippage - Slippage tolerance percentage
 */
export async function getAggregatedQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  chainId: number = 1,
  slippage: number = 0.5
): Promise<AggregatedQuote> {
  // PHASE 10: Only Ethereum mainnet
  if (chainId !== 1) {
    throw new Error('Quote aggregator only supports Ethereum mainnet (Phase 10)');
  }

  const tokenOutData = getTokenBySymbol(tokenOut, chainId);
  if (!tokenOutData) {
    throw new Error(`Unknown token: ${tokenOut}`);
  }

  const apiKey = getOneInchApiKey();

  console.log('[Aggregator] Fetching quotes...', { tokenIn, tokenOut, amountIn, chainId });

  // Fetch both quotes in parallel
  const [oneInchResult, uniswapResult] = await Promise.allSettled([
    getBestOneInchQuote(tokenIn, tokenOut, amountIn, chainId, apiKey),
    getUniswapQuote(tokenIn, tokenOut, amountIn, chainId),
  ]);

  // Extract successful quotes
  let oneInchQuote: AggregatedQuote | null = null;
  let uniswapQuote: AggregatedQuote | null = null;

  if (oneInchResult.status === 'fulfilled' && oneInchResult.value) {
    oneInchQuote = normalizeOneInchQuote(oneInchResult.value, slippage, tokenOutData.decimals);
    console.log('[Aggregator] 1inch quote:', oneInchQuote.amountOutFormatted, tokenOut);
  } else {
    console.warn('[Aggregator] 1inch quote failed:', oneInchResult.status === 'rejected' ? oneInchResult.reason : 'No quote returned');
  }

  if (uniswapResult.status === 'fulfilled' && uniswapResult.value) {
    uniswapQuote = normalizeUniswapQuote(uniswapResult.value, slippage, tokenOutData.decimals);
    console.log('[Aggregator] Uniswap quote:', uniswapQuote.amountOutFormatted, tokenOut);
  } else {
    console.warn('[Aggregator] Uniswap quote failed:', uniswapResult.status === 'rejected' ? uniswapResult.reason : 'No quote returned');
  }

  // Select best quote
  const comparison = selectBestQuote(oneInchQuote, uniswapQuote);

  console.log('[Aggregator] Selected:', comparison.best.provider, '|', comparison.reason);

  return comparison.best;
}

/**
 * Select the best quote based on output amount
 */
function selectBestQuote(
  oneInchQuote: AggregatedQuote | null,
  uniswapQuote: AggregatedQuote | null
): QuoteComparison {
  // If only one quote available, use it
  if (oneInchQuote && !uniswapQuote) {
    return {
      best: oneInchQuote,
      alternative: null,
      reason: '1inch only (Uniswap unavailable)',
    };
  }

  if (!oneInchQuote && uniswapQuote) {
    return {
      best: uniswapQuote,
      alternative: null,
      reason: 'Uniswap fallback (1inch unavailable)',
    };
  }

  if (!oneInchQuote && !uniswapQuote) {
    throw new Error('No quotes available from any provider');
  }

  // Both quotes available - compare amountOut
  const oneInchAmount = oneInchQuote!.amountOutRaw;
  const uniswapAmount = uniswapQuote!.amountOutRaw;

  // Calculate difference as percentage
  const diff = Number((oneInchAmount - uniswapAmount) * 10000n / uniswapAmount) / 100;

  if (oneInchAmount >= uniswapAmount) {
    return {
      best: oneInchQuote!,
      alternative: uniswapQuote!,
      reason: `1inch better by ${Math.abs(diff).toFixed(2)}%`,
    };
  } else {
    return {
      best: uniswapQuote!,
      alternative: oneInchQuote!,
      reason: `Uniswap better by ${Math.abs(diff).toFixed(2)}%`,
    };
  }
}

/**
 * Get quote with explicit provider preference
 * Used when user wants to force a specific provider
 */
export async function getQuoteFromProvider(
  provider: 'uniswap-v3' | '1inch',
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
    return normalizeOneInchQuote(quote, slippage, tokenOutData.decimals);
  } else {
    const quote = await getUniswapQuote(tokenIn, tokenOut, amountIn, chainId);
    if (!quote) {
      throw new Error('Uniswap quote failed');
    }
    return normalizeUniswapQuote(quote, slippage, tokenOutData.decimals);
  }
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
