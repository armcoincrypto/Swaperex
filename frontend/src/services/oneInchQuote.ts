/**
 * 1inch DEX Aggregator - Quote Service
 *
 * Fetches best swap quotes from 1inch aggregation protocol.
 * Supports ETH, BSC, Polygon, Arbitrum, Optimism, Base, Avalanche.
 *
 * API Docs: https://portal.1inch.dev/documentation/apis/swap/introduction
 *
 * SECURITY:
 * - This service only fetches quotes (read-only)
 * - Never signs or sends transactions
 * - API key is optional but recommended for production
 */

import { getTokenBySymbol, type Token } from '@/tokens';

/**
 * 1inch API v6 base URL
 */
const ONEINCH_API_V6 = 'https://api.1inch.dev/swap/v6.0';

/**
 * Supported chain IDs for 1inch
 */
export const ONEINCH_CHAIN_IDS = {
  ethereum: 1,
  bsc: 56,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
  avalanche: 43114,
  gnosis: 100,
  fantom: 250,
  base: 8453,
} as const;

export type OneInchChainId = (typeof ONEINCH_CHAIN_IDS)[keyof typeof ONEINCH_CHAIN_IDS];

/**
 * Native token placeholder address (used by 1inch for native tokens)
 */
export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

/**
 * Quote result from 1inch
 */
export interface OneInchQuoteResult {
  srcToken: string;
  dstToken: string;
  srcAmount: string;
  dstAmount: string;
  dstAmountFormatted: string;
  protocols: unknown[];
  gas: number;
  gasPrice: string;
  priceImpact: string;
  provider: string;
  chainId: number;
}

/**
 * 1inch API response for /quote endpoint
 */
interface OneInchQuoteResponse {
  dstAmount: string;
  srcToken: {
    address: string;
    symbol: string;
    decimals: number;
  };
  dstToken: {
    address: string;
    symbol: string;
    decimals: number;
  };
  protocols: unknown[];
  gas: number;
}

/**
 * Check if chain is supported by 1inch
 */
export function isOneInchSupported(chainId: number): boolean {
  return Object.values(ONEINCH_CHAIN_IDS).includes(chainId as OneInchChainId);
}

/**
 * Get native token symbol for chain
 */
export function getNativeSymbol(chainId: number): string {
  const symbols: Record<number, string> = {
    1: 'ETH',
    56: 'BNB',
    137: 'MATIC',
    42161: 'ETH',
    10: 'ETH',
    43114: 'AVAX',
    100: 'xDAI',
    250: 'FTM',
    8453: 'ETH',
  };
  return symbols[chainId] || 'ETH';
}

/**
 * Get token address for 1inch API
 * Returns native placeholder for native tokens
 */
function getOneInchTokenAddress(token: Token): string {
  // Check if it's a native token (ETH, BNB, MATIC, etc.)
  if (token.address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) {
    return NATIVE_TOKEN_ADDRESS;
  }
  return token.address;
}

/**
 * Build API headers with optional API key
 */
function getHeaders(apiKey?: string): HeadersInit {
  const headers: HeadersInit = {
    'Accept': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return headers;
}

/**
 * Parse amount to smallest units (wei)
 */
function parseAmountToWei(amount: string, decimals: number): string {
  const [whole, fraction = ''] = amount.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  const combined = whole + paddedFraction;
  // Remove leading zeros but keep at least one digit
  return combined.replace(/^0+/, '') || '0';
}

/**
 * Format amount from smallest units
 */
function formatAmountFromWei(amount: string, decimals: number): string {
  const padded = amount.padStart(decimals + 1, '0');
  const wholePart = padded.slice(0, -decimals) || '0';
  const fractionPart = padded.slice(-decimals).replace(/0+$/, '');
  return fractionPart ? `${wholePart}.${fractionPart}` : wholePart;
}

/**
 * Get swap quote from 1inch API
 *
 * @param tokenIn - Input token symbol
 * @param tokenOut - Output token symbol
 * @param amountIn - Amount of input token (human readable)
 * @param chainId - Chain ID (default: 1 = Ethereum)
 * @param apiKey - Optional 1inch API key
 *
 * @returns Quote result with output amount and gas estimate
 */
export async function getOneInchQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  chainId: number = 1,
  apiKey?: string
): Promise<OneInchQuoteResult> {
  // Validate chain support
  if (!isOneInchSupported(chainId)) {
    throw new Error(`1inch does not support chain ${chainId}`);
  }

  // Resolve tokens
  const tokenInData = getTokenBySymbol(tokenIn, chainId);
  const tokenOutData = getTokenBySymbol(tokenOut, chainId);

  if (!tokenInData) {
    throw new Error(`Unknown token: ${tokenIn}`);
  }
  if (!tokenOutData) {
    throw new Error(`Unknown token: ${tokenOut}`);
  }

  // Get addresses
  const srcAddress = getOneInchTokenAddress(tokenInData);
  const dstAddress = getOneInchTokenAddress(tokenOutData);

  // Convert amount to wei
  const amountWei = parseAmountToWei(amountIn, tokenInData.decimals);

  console.log('[1inch Quote] Fetching:', {
    tokenIn: tokenInData.symbol,
    tokenOut: tokenOutData.symbol,
    amountIn,
    amountWei,
    chainId,
    src: srcAddress,
    dst: dstAddress,
  });

  // Build request URL
  const url = new URL(`${ONEINCH_API_V6}/${chainId}/quote`);
  url.searchParams.set('src', srcAddress);
  url.searchParams.set('dst', dstAddress);
  url.searchParams.set('amount', amountWei);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: getHeaders(apiKey),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[1inch Quote] API Error:', response.status, errorText);

      if (response.status === 400) {
        throw new Error('Invalid swap parameters. Check token addresses and amounts.');
      }
      if (response.status === 429) {
        throw new Error('Rate limited. Please try again in a few seconds.');
      }
      if (response.status === 500) {
        throw new Error('1inch API is temporarily unavailable.');
      }

      throw new Error(`1inch API error: ${response.status}`);
    }

    const data: OneInchQuoteResponse = await response.json();

    // Format output amount
    const dstAmountFormatted = formatAmountFromWei(data.dstAmount, tokenOutData.decimals);

    // Calculate approximate price impact (simplified)
    const inputValue = parseFloat(amountIn);
    const outputValue = parseFloat(dstAmountFormatted);
    let priceImpact = '0';

    // For stablecoin pairs, calculate impact from 1:1
    const stablecoins = ['USDT', 'USDC', 'DAI', 'BUSD', 'FDUSD'];
    if (stablecoins.includes(tokenIn.toUpperCase()) && stablecoins.includes(tokenOut.toUpperCase())) {
      priceImpact = (Math.abs(1 - outputValue / inputValue) * 100).toFixed(2);
    }

    console.log('[1inch Quote] Result:', {
      dstAmount: dstAmountFormatted,
      gas: data.gas,
      protocols: data.protocols?.length || 0,
    });

    return {
      srcToken: srcAddress,
      dstToken: dstAddress,
      srcAmount: amountWei,
      dstAmount: data.dstAmount,
      dstAmountFormatted,
      protocols: data.protocols || [],
      gas: data.gas || 200000,
      gasPrice: '0', // Will be determined by wallet
      priceImpact,
      provider: '1inch',
      chainId,
    };
  } catch (error) {
    console.error('[1inch Quote] Error:', error);

    if (error instanceof Error) {
      throw error;
    }

    throw new Error('Failed to fetch quote from 1inch');
  }
}

/**
 * Get best quote by trying multiple fee configurations
 * (1inch automatically finds the best route)
 */
export async function getBestOneInchQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  chainId: number = 1,
  apiKey?: string
): Promise<OneInchQuoteResult | null> {
  try {
    // 1inch always returns the best route, no need to try multiple configs
    return await getOneInchQuote(tokenIn, tokenOut, amountIn, chainId, apiKey);
  } catch (error) {
    console.error('[1inch] Failed to get quote:', error);
    return null;
  }
}

/**
 * Get minimum amount out with slippage
 */
export function getOneInchMinAmountOut(dstAmount: string, slippagePercent: number): string {
  const amount = BigInt(dstAmount);
  const slippageBps = BigInt(Math.floor(slippagePercent * 100));
  const minAmount = amount - (amount * slippageBps) / 10000n;
  return minAmount.toString();
}

/**
 * Format quote for display
 */
export function formatOneInchQuote(quote: OneInchQuoteResult, fromSymbol: string, toSymbol: string): string {
  return `${fromSymbol} → ${quote.dstAmountFormatted} ${toSymbol} via 1inch`;
}

export default getOneInchQuote;
