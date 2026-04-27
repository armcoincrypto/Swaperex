/**
 * PancakeSwap V3 fee wrapper **V2** quotes (BSC). Read-only; no signing.
 * Canary: ERC20→ERC20 when native is disabled; native legs when env allows.
 */

import { Contract, JsonRpcProvider, Network, formatUnits, parseUnits } from 'ethers';
import { getTokenBySymbol, getSwapAddress, isNativeToken } from '@/tokens';
import { getPancakeWrapperV2Config, isPancakeWrapperV2ExecutionEligible } from '@/config';
import {
  BSC_CONFIG,
  PANCAKE_FEE_TIERS,
  type PancakeFeeTier,
  type PancakeQuoteResult,
} from './pancakeSwapQuote';

const WRAPPER_V2_QUOTE_ABI = [
  {
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
    ],
    name: 'quoteExactInputSingleERC20',
    outputs: [
      { name: 'amountOutGross', type: 'uint256' },
      { name: 'feeAmount', type: 'uint256' },
      { name: 'amountOutNet', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

let cachedBsc: JsonRpcProvider | null = null;

function getBscStaticProvider(): JsonRpcProvider {
  if (!cachedBsc) {
    const net = Network.from(BSC_CONFIG.chainId);
    cachedBsc = new JsonRpcProvider(BSC_CONFIG.rpcUrl, net, { staticNetwork: net });
  }
  return cachedBsc;
}

function calculatePriceImpact(
  inputAmount: number,
  outputAmount: number,
  tokenIn: string,
  tokenOut: string,
): number {
  const stablecoins = ['USDT', 'USDC', 'BUSD', 'DAI', 'FDUSD'];
  if (stablecoins.includes(tokenIn.toUpperCase()) && stablecoins.includes(tokenOut.toUpperCase())) {
    return Math.abs(1 - outputAmount / inputAmount) * 100;
  }
  return 0;
}

/** Single-tier quote via Swaperex Pancake V3 fee wrapper V2 (net output after protocol fee). */
export async function getPancakeWrapperV2Quote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  feeTier: PancakeFeeTier = PANCAKE_FEE_TIERS.MEDIUM,
): Promise<PancakeQuoteResult> {
  const cfg = getPancakeWrapperV2Config();
  if (!cfg.enabled || !cfg.wrapperAddress) {
    throw new Error('Pancake fee wrapper V2 is not enabled or not configured');
  }

  const tokenInData = getTokenBySymbol(tokenIn, 56);
  const tokenOutData = getTokenBySymbol(tokenOut, 56);
  if (!tokenInData) throw new Error(`Unknown token on BSC: ${tokenIn}`);
  if (!tokenOutData) throw new Error(`Unknown token on BSC: ${tokenOut}`);
  if (!isPancakeWrapperV2ExecutionEligible(56, tokenInData, tokenOutData)) {
    throw new Error(
      'Pancake fee wrapper V2 does not support this pair with current settings (enable VITE_PANCAKE_WRAPPER_V2_NATIVE_ENABLED for BNB legs).',
    );
  }
  if (isNativeToken(tokenInData.address) || isNativeToken(tokenOutData.address)) {
    throw new Error(
      'Pancake wrapper V2 native-leg quotes are not implemented in this module; use ERC20↔ERC20 or enable native in product routing when supported.',
    );
  }

  const tokenInAddress = getSwapAddress(tokenInData, 56);
  const tokenOutAddress = getSwapAddress(tokenOutData, 56);
  const amountInWei = parseUnits(amountIn, tokenInData.decimals);

  const rpc = getBscStaticProvider();
  const wrapper = new Contract(cfg.wrapperAddress, WRAPPER_V2_QUOTE_ABI, rpc);

  const quoteOnce = () =>
    wrapper.quoteExactInputSingleERC20.staticCall(tokenInAddress, tokenOutAddress, feeTier, amountInWei, 0n);

  let result;
  try {
    result = await quoteOnce();
  } catch (firstErr) {
    console.warn('[PancakeWrapperQuoteV2] staticCall failed, retrying once:', firstErr);
    await new Promise((r) => setTimeout(r, 400));
    result = await quoteOnce();
  }

  const [, , amountOutNet, sqrtPriceX96After, initializedTicksCrossed, gasEstimate] = result;

  const amountOutFormatted = formatUnits(amountOutNet, tokenOutData.decimals);
  const inputValue = parseFloat(amountIn);
  const outputValue = parseFloat(amountOutFormatted);
  const priceImpact = calculatePriceImpact(
    inputValue,
    outputValue,
    tokenInData.symbol,
    tokenOutData.symbol,
  );

  return {
    amountIn: amountInWei.toString(),
    amountOut: amountOutNet.toString(),
    amountOutFormatted,
    priceImpact: priceImpact.toFixed(2),
    gasEstimate: gasEstimate.toString(),
    feeTier,
    sqrtPriceX96After: sqrtPriceX96After.toString(),
    initializedTicksCrossed: Number(initializedTicksCrossed),
    route: `${tokenInData.symbol} → ${tokenOutData.symbol}`,
    provider: 'pancakeswap-v3-wrapper-v2',
    chainId: 56,
  };
}

/** Best wrapper V2 quote across fee tiers 500 / 2500 / 10000. */
export async function getBestPancakeWrapperV2Quote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
): Promise<PancakeQuoteResult | null> {
  const feeTiers: PancakeFeeTier[] = [
    PANCAKE_FEE_TIERS.LOW,
    PANCAKE_FEE_TIERS.MEDIUM,
    PANCAKE_FEE_TIERS.HIGH,
  ];
  const quotes: PancakeQuoteResult[] = [];

  const results = await Promise.allSettled(
    feeTiers.map((fee) => getPancakeWrapperV2Quote(tokenIn, tokenOut, amountIn, fee)),
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      quotes.push(result.value);
    }
  }

  if (quotes.length === 0) {
    return null;
  }

  return quotes.reduce((best, current) =>
    BigInt(current.amountOut) > BigInt(best.amountOut) ? current : best,
  );
}
