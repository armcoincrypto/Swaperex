/**
 * Jupiter Quote Service (Solana)
 *
 * Fetches swap quotes from Jupiter aggregator API.
 * Jupiter is the main DEX aggregator for Solana.
 *
 * API: https://station.jup.ag/docs/apis/swap-api
 *
 * SECURITY:
 * - This module NEVER signs transactions
 * - This module NEVER sends transactions
 * - Only fetches quotes and returns unsigned transaction data
 */

import { SOLANA_TOKENS, SOLANA_DECIMALS } from '@/config/tokens';
import { JUPITER_CONFIG } from '@/config/dex';

/**
 * Jupiter quote response from /quote endpoint
 */
export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: 'ExactIn' | 'ExactOut';
  slippageBps: number;
  platformFee: null | { amount: string; feeBps: number };
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  contextSlot: number;
  timeTaken: number;
}

/**
 * Jupiter swap response from /swap endpoint
 */
export interface JupiterSwapResponse {
  swapTransaction: string; // Base64 encoded VersionedTransaction
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
}

/**
 * Normalized quote result for UI
 */
export interface JupiterQuoteResult {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  outAmountFormatted: string;
  minOutAmount: string;
  minOutAmountFormatted: string;
  priceImpact: string;
  slippageBps: number;
  route: string[];
  provider: 'jupiter';
  // Original response for swap execution
  quoteResponse: JupiterQuoteResponse;
}

/**
 * Get token mint address by symbol
 */
export function getSolanaTokenMint(symbol: string): string | undefined {
  return SOLANA_TOKENS[symbol.toUpperCase()];
}

/**
 * Get token decimals by symbol
 */
export function getSolanaTokenDecimals(symbol: string): number {
  return SOLANA_DECIMALS[symbol.toUpperCase()] ?? 9; // Default to 9 (SOL decimals)
}

/**
 * Format lamports to human readable amount
 */
export function formatSolanaAmount(
  lamports: string | bigint,
  decimals: number
): string {
  const value = typeof lamports === 'string' ? BigInt(lamports) : lamports;
  const divisor = BigInt(10 ** decimals);
  const whole = value / divisor;
  const fraction = value % divisor;

  // Pad fraction with leading zeros
  const fractionStr = fraction.toString().padStart(decimals, '0');
  // Trim trailing zeros but keep at least 2 decimal places
  const trimmed = fractionStr.replace(/0+$/, '') || '00';
  const display = trimmed.length < 2 ? trimmed.padEnd(2, '0') : trimmed;

  return `${whole}.${display}`;
}

/**
 * Parse human readable amount to lamports
 */
export function parseSolanaAmount(amount: string, decimals: number): string {
  const [whole, fraction = ''] = amount.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  const lamports = BigInt(whole + paddedFraction);
  return lamports.toString();
}

/**
 * Fetch quote from Jupiter API
 *
 * @param inputSymbol - Input token symbol (e.g., 'SOL')
 * @param outputSymbol - Output token symbol (e.g., 'USDC')
 * @param amountIn - Human readable input amount
 * @param slippageBps - Slippage in basis points (default: 50 = 0.5%)
 */
export async function getJupiterQuote(
  inputSymbol: string,
  outputSymbol: string,
  amountIn: string,
  slippageBps: number = JUPITER_CONFIG.defaultSlippage
): Promise<JupiterQuoteResult> {
  const inputMint = getSolanaTokenMint(inputSymbol);
  const outputMint = getSolanaTokenMint(outputSymbol);

  if (!inputMint) {
    throw new Error(`Unknown Solana token: ${inputSymbol}`);
  }
  if (!outputMint) {
    throw new Error(`Unknown Solana token: ${outputSymbol}`);
  }

  const inputDecimals = getSolanaTokenDecimals(inputSymbol);
  const outputDecimals = getSolanaTokenDecimals(outputSymbol);

  // Convert to lamports
  const amountInLamports = parseSolanaAmount(amountIn, inputDecimals);

  console.log('[Jupiter] Fetching quote:', {
    inputSymbol,
    outputSymbol,
    amountIn,
    amountInLamports,
    slippageBps,
  });

  // Build quote URL
  const quoteUrl = new URL(`${JUPITER_CONFIG.apiBase}/quote`);
  quoteUrl.searchParams.set('inputMint', inputMint);
  quoteUrl.searchParams.set('outputMint', outputMint);
  quoteUrl.searchParams.set('amount', amountInLamports);
  quoteUrl.searchParams.set('slippageBps', slippageBps.toString());
  quoteUrl.searchParams.set('swapMode', 'ExactIn');

  const response = await fetch(quoteUrl.toString());

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Jupiter] Quote error:', response.status, errorText);
    throw new Error(`Jupiter quote failed: ${response.status} - ${errorText}`);
  }

  const quoteResponse: JupiterQuoteResponse = await response.json();

  console.log('[Jupiter] Quote received:', {
    outAmount: quoteResponse.outAmount,
    priceImpact: quoteResponse.priceImpactPct,
    routes: quoteResponse.routePlan.length,
  });

  // Calculate min amount with slippage
  const outAmountBigInt = BigInt(quoteResponse.outAmount);
  const minOutAmount = (outAmountBigInt * BigInt(10000 - slippageBps)) / 10000n;

  // Format amounts for display
  const outAmountFormatted = formatSolanaAmount(quoteResponse.outAmount, outputDecimals);
  const minOutAmountFormatted = formatSolanaAmount(minOutAmount.toString(), outputDecimals);

  // Extract route labels
  const route = quoteResponse.routePlan.map(
    (r) => r.swapInfo.label || 'Unknown'
  );

  return {
    inputMint,
    outputMint,
    inAmount: amountInLamports,
    outAmount: quoteResponse.outAmount,
    outAmountFormatted,
    minOutAmount: minOutAmount.toString(),
    minOutAmountFormatted,
    priceImpact: quoteResponse.priceImpactPct,
    slippageBps,
    route,
    provider: 'jupiter',
    quoteResponse,
  };
}

/**
 * Get minimum output amount with slippage applied
 */
export function getJupiterMinAmountOut(
  quote: JupiterQuoteResult,
  slippagePercent: number = 0.5
): string {
  const slippageBps = Math.floor(slippagePercent * 100);
  const outAmount = BigInt(quote.outAmount);
  const minAmount = (outAmount * BigInt(10000 - slippageBps)) / 10000n;
  return minAmount.toString();
}

/**
 * Format quote for display
 */
export function formatJupiterQuoteForDisplay(
  quote: JupiterQuoteResult,
  inputSymbol: string,
  outputSymbol: string
): string {
  const rate = (
    parseFloat(quote.outAmountFormatted) /
    parseFloat(formatSolanaAmount(quote.inAmount, getSolanaTokenDecimals(inputSymbol)))
  ).toFixed(6);

  return `${quote.outAmountFormatted} ${outputSymbol} (1 ${inputSymbol} = ${rate} ${outputSymbol})`;
}

export default getJupiterQuote;
