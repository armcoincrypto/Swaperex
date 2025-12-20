/**
 * PancakeSwap V3 Quote Service (BSC)
 *
 * READ-ONLY quote fetching using PancakeSwap V3 QuoterV2 contract.
 * Uses static calls only - NO signing, NO transactions.
 *
 * SECURITY: This service never sends transactions or signs anything.
 */

import { Contract, JsonRpcProvider, formatUnits, parseUnits } from 'ethers';
import { getTokenBySymbol } from '@/tokens';

/**
 * PancakeSwap V3 Contract Addresses on BSC
 * Source: https://docs.pancakeswap.finance/developers/smart-contracts/pancakeswap-exchange/v3-contracts
 */
export const PANCAKESWAP_V3_ADDRESSES = {
  router: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4',       // SmartRouter
  quoter: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',       // QuoterV2
  factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',      // V3Factory
  positionManager: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364', // NFT Position Manager
};

/**
 * BSC Chain Configuration
 */
export const BSC_CONFIG = {
  chainId: 56,
  name: 'BNB Chain',
  rpcUrl: 'https://bsc-dataseed.binance.org/',
  explorerUrl: 'https://bscscan.com',
  nativeToken: 'BNB',
  nativeDecimals: 18,
  wrappedNativeToken: 'WBNB',
  wrappedNativeAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
};

/**
 * PancakeSwap V3 Fee Tiers (in hundredths of a bip)
 * Same as Uniswap V3: 100 = 0.01%, 500 = 0.05%, 2500 = 0.25%, 10000 = 1.00%
 */
export const PANCAKE_FEE_TIERS = {
  LOWEST: 100,    // 0.01% - Very stable pairs
  LOW: 500,       // 0.05% - Stable pairs (USDT/USDC)
  MEDIUM: 2500,   // 0.25% - Most pairs (BNB/USDT)
  HIGH: 10000,    // 1.00% - Exotic pairs
} as const;

export type PancakeFeeTier = (typeof PANCAKE_FEE_TIERS)[keyof typeof PANCAKE_FEE_TIERS];

/**
 * Quote result from PancakeSwap V3
 */
export interface PancakeQuoteResult {
  amountIn: string;
  amountOut: string;
  amountOutFormatted: string;
  priceImpact: string;
  gasEstimate: string;
  feeTier: PancakeFeeTier;
  sqrtPriceX96After: string;
  initializedTicksCrossed: number;
  route: string;
  provider: string;
  chainId: number;
}

/**
 * QuoterV2 ABI - Compatible with PancakeSwap V3
 */
const QUOTER_V2_ABI = [
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
];

/**
 * Native BNB placeholder address
 */
const NATIVE_BNB_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

/**
 * Check if address is native BNB
 */
function isNativeBNB(address: string): boolean {
  return address.toLowerCase() === NATIVE_BNB_ADDRESS.toLowerCase();
}

/**
 * Get swap address (converts BNB to WBNB)
 */
function getSwapAddress(tokenAddress: string): string {
  if (isNativeBNB(tokenAddress)) {
    return BSC_CONFIG.wrappedNativeAddress;
  }
  return tokenAddress;
}

/**
 * Create BSC provider
 */
function getProvider(): JsonRpcProvider {
  return new JsonRpcProvider(BSC_CONFIG.rpcUrl);
}

/**
 * Get quote for exact input swap on PancakeSwap V3
 *
 * @param tokenIn - Input token symbol
 * @param tokenOut - Output token symbol
 * @param amountIn - Amount of input token (human readable)
 * @param feeTier - PancakeSwap fee tier (default: 2500 = 0.25%)
 *
 * @returns Quote result with amountOut, priceImpact, gasEstimate
 */
export async function getPancakeQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  feeTier: PancakeFeeTier = PANCAKE_FEE_TIERS.MEDIUM
): Promise<PancakeQuoteResult> {
  // Resolve tokens for BSC (chainId: 56)
  const tokenInData = getTokenBySymbol(tokenIn, 56);
  const tokenOutData = getTokenBySymbol(tokenOut, 56);

  if (!tokenInData) {
    throw new Error(`Unknown token on BSC: ${tokenIn}`);
  }
  if (!tokenOutData) {
    throw new Error(`Unknown token on BSC: ${tokenOut}`);
  }

  // Get swap addresses (BNB → WBNB)
  const tokenInAddress = getSwapAddress(tokenInData.address);
  const tokenOutAddress = getSwapAddress(tokenOutData.address);

  // Parse amount to wei
  const amountInWei = parseUnits(amountIn, tokenInData.decimals);

  // Create provider and contract
  const provider = getProvider();
  const quoter = new Contract(PANCAKESWAP_V3_ADDRESSES.quoter, QUOTER_V2_ABI, provider);

  // Build quote params
  const params = {
    tokenIn: tokenInAddress,
    tokenOut: tokenOutAddress,
    amountIn: amountInWei,
    fee: feeTier,
    sqrtPriceLimitX96: 0n,
  };

  console.log('[PancakeSwap Quote] Fetching:', {
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
    const inputValue = parseFloat(amountIn);
    const outputValue = parseFloat(amountOutFormatted);
    const priceImpact = calculatePriceImpact(inputValue, outputValue, tokenInData.symbol, tokenOutData.symbol);

    console.log('[PancakeSwap Quote] Result:', {
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
      provider: 'PancakeSwap V3',
      chainId: 56,
    };
  } catch (error) {
    console.error('[PancakeSwap Quote] Error:', error);

    const errorMessage = String(error);
    if (errorMessage.includes('execution reverted')) {
      throw new Error('No liquidity available for this pair/amount on PancakeSwap');
    }

    throw error;
  }
}

/**
 * Get best quote across fee tiers
 */
export async function getBestPancakeQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string
): Promise<PancakeQuoteResult | null> {
  const feeTiers: PancakeFeeTier[] = [
    PANCAKE_FEE_TIERS.LOW,
    PANCAKE_FEE_TIERS.MEDIUM,
    PANCAKE_FEE_TIERS.HIGH,
  ];
  const quotes: PancakeQuoteResult[] = [];

  // Try all fee tiers in parallel
  const results = await Promise.allSettled(
    feeTiers.map((fee) => getPancakeQuote(tokenIn, tokenOut, amountIn, fee))
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
 */
function calculatePriceImpact(
  inputAmount: number,
  outputAmount: number,
  tokenIn: string,
  tokenOut: string
): number {
  // For stablecoin pairs
  const stablecoins = ['USDT', 'USDC', 'BUSD', 'DAI', 'FDUSD'];
  if (stablecoins.includes(tokenIn.toUpperCase()) && stablecoins.includes(tokenOut.toUpperCase())) {
    return Math.abs(1 - outputAmount / inputAmount) * 100;
  }
  return 0;
}

/**
 * Get minimum amount out with slippage
 */
export function getPancakeMinAmountOut(quote: PancakeQuoteResult, slippagePercent: number = 0.5): string {
  const amountOut = BigInt(quote.amountOut);
  const slippageBps = BigInt(Math.floor(slippagePercent * 100));
  const minAmount = amountOut - (amountOut * slippageBps) / 10000n;
  return minAmount.toString();
}

/**
 * Format quote for display
 */
export function formatPancakeQuote(quote: PancakeQuoteResult): string {
  return `${quote.amountIn} ${quote.route.split(' → ')[0]} = ${quote.amountOutFormatted} ${quote.route.split(' → ')[1]}`;
}

export default getPancakeQuote;
