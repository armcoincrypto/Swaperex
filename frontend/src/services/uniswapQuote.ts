/**
 * Uniswap V3 Quote Service
 *
 * READ-ONLY quote fetching using Uniswap V3 QuoterV2 contract.
 * Uses static calls only - NO signing, NO transactions.
 *
 * SECURITY: This service never sends transactions or signs anything.
 */

import { Contract, JsonRpcProvider, formatUnits, parseUnits } from 'ethers';
import { ETHEREUM_CONFIG, getUniswapV3Addresses } from '@/config';
import { getTokenBySymbol, getSwapAddress } from '@/tokens';

/**
 * Uniswap V3 Fee Tiers (in hundredths of a bip)
 * 100 = 0.01%, 500 = 0.05%, 3000 = 0.30%, 10000 = 1.00%
 */
export const FEE_TIERS = {
  LOWEST: 100,    // 0.01% - Very stable pairs
  LOW: 500,       // 0.05% - Stable pairs (USDC/USDT)
  MEDIUM: 3000,   // 0.30% - Most pairs (ETH/USDC)
  HIGH: 10000,    // 1.00% - Exotic pairs
} as const;

export type FeeTier = (typeof FEE_TIERS)[keyof typeof FEE_TIERS];

/**
 * Quote result from Uniswap V3
 */
export interface QuoteResult {
  amountIn: string;
  amountOut: string;
  amountOutFormatted: string;
  priceImpact: string;
  gasEstimate: string;
  feeTier: FeeTier;
  sqrtPriceX96After: string;
  initializedTicksCrossed: number;
  route: string;
  provider: string;
}

/**
 * QuoterV2 ABI - Only the functions we need
 * Source: https://docs.uniswap.org/contracts/v3/reference/periphery/interfaces/IQuoterV2
 */
const QUOTER_V2_ABI = [
  // quoteExactInputSingle
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'fee', type: 'uint24' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'quoteExactInputSingle',
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // quoteExactOutputSingle
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'fee', type: 'uint24' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'quoteExactOutputSingle',
    outputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

/**
 * Create a read-only provider
 */
function getProvider(chainId: number = 1): JsonRpcProvider {
  const rpcUrl = chainId === 1 ? ETHEREUM_CONFIG.rpcUrl : ETHEREUM_CONFIG.rpcUrl;
  return new JsonRpcProvider(rpcUrl);
}

/**
 * Get quote for exact input swap
 *
 * @param tokenIn - Input token symbol or address
 * @param tokenOut - Output token symbol or address
 * @param amountIn - Amount of input token (human readable, e.g. "1.5")
 * @param feeTier - Uniswap fee tier (default: 3000 = 0.30%)
 * @param chainId - Chain ID (default: 1 = Ethereum)
 *
 * @returns QuoteResult with amountOut, priceImpact, gasEstimate
 */
export async function getQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  feeTier: FeeTier = FEE_TIERS.MEDIUM,
  chainId: number = 1
): Promise<QuoteResult> {
  // Get Uniswap V3 addresses for chain
  const uniswapAddresses = getUniswapV3Addresses(chainId);
  if (!uniswapAddresses) {
    throw new Error(`Uniswap V3 not available on chain ${chainId}`);
  }

  // Resolve token addresses
  const tokenInData = getTokenBySymbol(tokenIn, chainId);
  const tokenOutData = getTokenBySymbol(tokenOut, chainId);

  if (!tokenInData) {
    throw new Error(`Unknown token: ${tokenIn}`);
  }
  if (!tokenOutData) {
    throw new Error(`Unknown token: ${tokenOut}`);
  }

  // Get swap addresses (converts ETH to WETH)
  const tokenInAddress = getSwapAddress(tokenInData);
  const tokenOutAddress = getSwapAddress(tokenOutData);

  // Parse amount to wei
  const amountInWei = parseUnits(amountIn, tokenInData.decimals);

  // Create provider and contract
  const provider = getProvider(chainId);
  const quoter = new Contract(uniswapAddresses.quoter, QUOTER_V2_ABI, provider);

  // Build quote params
  const params = {
    tokenIn: tokenInAddress,
    tokenOut: tokenOutAddress,
    amountIn: amountInWei,
    fee: feeTier,
    sqrtPriceLimitX96: 0n, // No price limit
  };

  console.log('[Quote] Fetching quote:', {
    tokenIn: tokenInData.symbol,
    tokenOut: tokenOutData.symbol,
    amountIn,
    feeTier,
    tokenInAddress,
    tokenOutAddress,
  });

  try {
    // Use staticCall to simulate without sending transaction
    const result = await quoter.quoteExactInputSingle.staticCall(params);

    const [amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate] = result;

    // Format output amount
    const amountOutFormatted = formatUnits(amountOut, tokenOutData.decimals);

    // Calculate price impact (simplified)
    // Real price impact requires fetching pool state
    const inputValue = parseFloat(amountIn);
    const outputValue = parseFloat(amountOutFormatted);
    const priceImpact = calculatePriceImpact(inputValue, outputValue, tokenInData.symbol, tokenOutData.symbol);

    console.log('[Quote] Result:', {
      amountOut: amountOutFormatted,
      gasEstimate: gasEstimate.toString(),
      priceImpact,
    });

    return {
      amountIn,
      amountOut: amountOut.toString(),
      amountOutFormatted,
      priceImpact: priceImpact.toFixed(2),
      gasEstimate: gasEstimate.toString(),
      feeTier,
      sqrtPriceX96After: sqrtPriceX96After.toString(),
      initializedTicksCrossed: Number(initializedTicksCrossed),
      route: `${tokenInData.symbol} → ${tokenOutData.symbol}`,
      provider: 'Uniswap V3',
    };
  } catch (error) {
    console.error('[Quote] Error:', error);

    // Check for common errors
    const errorMessage = String(error);
    if (errorMessage.includes('execution reverted')) {
      throw new Error('No liquidity available for this pair/amount');
    }

    throw error;
  }
}

/**
 * Get quotes for multiple fee tiers and return the best one
 */
export async function getBestQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  chainId: number = 1
): Promise<QuoteResult | null> {
  const feeTiers: FeeTier[] = [FEE_TIERS.LOW, FEE_TIERS.MEDIUM, FEE_TIERS.HIGH];
  const quotes: QuoteResult[] = [];

  // Try all fee tiers in parallel
  const results = await Promise.allSettled(
    feeTiers.map((fee) => getQuote(tokenIn, tokenOut, amountIn, fee, chainId))
  );

  // Collect successful quotes
  for (const result of results) {
    if (result.status === 'fulfilled') {
      quotes.push(result.value);
    }
  }

  if (quotes.length === 0) {
    return null;
  }

  // Return quote with highest output
  return quotes.reduce((best, current) =>
    BigInt(current.amountOut) > BigInt(best.amountOut) ? current : best
  );
}

/**
 * Calculate approximate price impact
 * Note: This is a simplified calculation. Real price impact requires pool state.
 */
function calculatePriceImpact(
  inputAmount: number,
  outputAmount: number,
  tokenIn: string,
  tokenOut: string
): number {
  // For stablecoin pairs, impact is deviation from 1:1
  const stablecoins = ['USDT', 'USDC', 'DAI'];
  if (stablecoins.includes(tokenIn) && stablecoins.includes(tokenOut)) {
    return Math.abs(1 - outputAmount / inputAmount) * 100;
  }

  // For other pairs, we can't calculate real impact without pool data
  // Return 0 as placeholder - real implementation would query pool
  return 0;
}

/**
 * Format quote for display
 */
export function formatQuoteForDisplay(quote: QuoteResult): string {
  return `${quote.amountIn} ${quote.route.split(' → ')[0]} = ${quote.amountOutFormatted} ${quote.route.split(' → ')[1]}`;
}

/**
 * Get minimum amount out with slippage
 */
export function getMinAmountOut(quote: QuoteResult, slippagePercent: number = 0.5): string {
  const amountOut = BigInt(quote.amountOut);
  const slippageBps = BigInt(Math.floor(slippagePercent * 100));
  const minAmount = amountOut - (amountOut * slippageBps) / 10000n;
  return minAmount.toString();
}

export default getQuote;
