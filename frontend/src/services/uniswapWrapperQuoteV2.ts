/**
 * Uniswap V3 fee wrapper **V2** quotes (Ethereum). Read-only; no signing.
 * Uses WETH addresses for native ETH legs in `quoteExactInputSingleERC20`.
 */

import { Contract, JsonRpcProvider, Network, formatUnits, parseUnits } from 'ethers';
import { ETHEREUM_CONFIG } from '@/config';
import { getTokenBySymbol, getSwapAddress, isNativeToken } from '@/tokens';
import { getUniswapWrapperV2Config, isUniswapWrapperV2QuoteEligible } from '@/config/uniswapWrapperV2';
import { FEE_TIERS, type FeeTier, type QuoteResult } from './uniswapQuote';

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

let cachedEth: JsonRpcProvider | null = null;

function getEthereumStaticProvider(): JsonRpcProvider {
  if (!cachedEth) {
    const net = Network.from(ETHEREUM_CONFIG.id);
    cachedEth = new JsonRpcProvider(ETHEREUM_CONFIG.rpcUrl, net, { staticNetwork: net });
  }
  return cachedEth;
}

function calculatePriceImpact(
  inputAmount: number,
  outputAmount: number,
  tokenIn: string,
  tokenOut: string,
): number {
  const stablecoins = ['USDT', 'USDC', 'DAI', 'BUSD', 'FDUSD'];
  if (stablecoins.includes(tokenIn.toUpperCase()) && stablecoins.includes(tokenOut.toUpperCase())) {
    return Math.abs(1 - outputAmount / inputAmount) * 100;
  }
  return 0;
}

/** Single-tier quote via Swaperex Uniswap V3 fee wrapper V2 (net output after protocol fee). */
export async function getUniswapWrapperV2Quote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  feeTier: FeeTier = FEE_TIERS.MEDIUM,
): Promise<QuoteResult> {
  const cfg = getUniswapWrapperV2Config();
  if (!cfg.enabled || !cfg.wrapperAddress) {
    throw new Error('Uniswap fee wrapper V2 is not enabled or not configured');
  }

  const tokenInData = getTokenBySymbol(tokenIn, 1);
  const tokenOutData = getTokenBySymbol(tokenOut, 1);
  if (!tokenInData) throw new Error(`Unknown token on Ethereum: ${tokenIn}`);
  if (!tokenOutData) throw new Error(`Unknown token on Ethereum: ${tokenOut}`);
  if (!isUniswapWrapperV2QuoteEligible(1, tokenInData, tokenOutData)) {
    throw new Error(
      'Uniswap fee wrapper V2 does not support this pair with current settings (enable VITE_UNISWAP_WRAPPER_V2_NATIVE_QUOTE_ENABLED for ETH legs).',
    );
  }
  const inNative = isNativeToken(tokenInData.address);
  const outNative = isNativeToken(tokenOutData.address);
  if (inNative || outNative) {
    if (!cfg.nativeQuoteEnabled) {
      throw new Error(
        'Uniswap wrapper V2 native-leg quotes are disabled (set VITE_UNISWAP_WRAPPER_V2_NATIVE_QUOTE_ENABLED).',
      );
    }
  }

  const tokenInAddress = getSwapAddress(tokenInData, 1);
  const tokenOutAddress = getSwapAddress(tokenOutData, 1);
  const amountInWei = parseUnits(amountIn, tokenInData.decimals);

  const rpc = getEthereumStaticProvider();
  const wrapper = new Contract(cfg.wrapperAddress, WRAPPER_V2_QUOTE_ABI, rpc);

  const quoteOnce = () =>
    wrapper.quoteExactInputSingleERC20.staticCall(tokenInAddress, tokenOutAddress, feeTier, amountInWei, 0n);

  let result;
  try {
    result = await quoteOnce();
  } catch (firstErr) {
    console.warn('[UniswapWrapperQuoteV2] staticCall failed, retrying once:', firstErr);
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
    provider: 'uniswap-v3-wrapper-v2',
  };
}

/** Best wrapper V2 quote across fee tiers 100 / 500 / 3000 / 10000. */
export async function getBestUniswapWrapperV2Quote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
): Promise<QuoteResult | null> {
  const feeTiers: FeeTier[] = [FEE_TIERS.LOWEST, FEE_TIERS.LOW, FEE_TIERS.MEDIUM, FEE_TIERS.HIGH];
  const quotes: QuoteResult[] = [];

  const results = await Promise.allSettled(
    feeTiers.map((fee) => getUniswapWrapperV2Quote(tokenIn, tokenOut, amountIn, fee)),
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
