/**
 * Uniswap V3 fee wrapper **V2** transaction encoding (Ethereum chain 1).
 *
 * Supports ERC20 → ERC20, ETH → ERC20 (`value` = `amountIn`), ERC20 → ETH (`value` = `0`).
 * **Disabled by default** — requires `VITE_UNISWAP_WRAPPER_V2_ENABLED` + valid address.
 */

import { Interface, MaxUint256, getAddress, isAddress, parseUnits } from 'ethers';
import { getTokenBySymbol, getSwapAddress, isNativeToken } from '@/tokens';
import type { SwapParams } from './uniswapTxBuilder';
import { FEE_TIERS } from './uniswapQuote';
import { buildApprovalTx } from './uniswapTxBuilder';
import { getUniswapWrapperV2Config } from '@/config/uniswapWrapperV2';

const WRAPPER_V2_ABI_ERC20 = [
  {
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMinNet', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
    ],
    name: 'swapExactInputSingleERC20',
    outputs: [
      { name: 'amountOutGross', type: 'uint256' },
      { name: 'feeAmount', type: 'uint256' },
      { name: 'amountOutNet', type: 'uint256' },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

const WRAPPER_V2_ABI_ETH_FOR_TOKENS = [
  {
    inputs: [
      { name: 'tokenOut', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMinNet', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
    ],
    name: 'swapExactInputSingleEthForTokens',
    outputs: [
      { name: 'amountOutGross', type: 'uint256' },
      { name: 'feeAmount', type: 'uint256' },
      { name: 'amountOutNet', type: 'uint256' },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

const WRAPPER_V2_ABI_TOKENS_FOR_ETH = [
  {
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMinNet', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
    ],
    name: 'swapExactInputSingleTokensForEth',
    outputs: [
      { name: 'amountOutGross', type: 'uint256' },
      { name: 'feeAmount', type: 'uint256' },
      { name: 'amountOutNet', type: 'uint256' },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

export interface UnsignedUniswapWrapperV2SwapTx {
  to: string;
  data: string;
  value: string;
}

function requireV2(wrapperAddress: string): void {
  const cfg = getUniswapWrapperV2Config();
  if (!cfg.enabled || !cfg.wrapperAddress) {
    throw new Error('Uniswap fee wrapper V2 is not enabled or not configured');
  }
  if (getAddress(wrapperAddress) !== getAddress(cfg.wrapperAddress)) {
    throw new Error('Uniswap fee wrapper V2 address mismatch vs env configuration');
  }
}

/**
 * Encode a V2 wrapper swap. Throws if native legs are used while `VITE_UNISWAP_WRAPPER_V2_NATIVE_ENABLED` is off.
 */
export function buildUniswapWrapperV2SwapTx(
  wrapperAddress: string,
  params: SwapParams,
): UnsignedUniswapWrapperV2SwapTx {
  if (!isAddress(wrapperAddress)) {
    throw new Error('Invalid Uniswap wrapper V2 address');
  }
  const wrapper = getAddress(wrapperAddress);
  requireV2(wrapper);

  const {
    tokenIn,
    tokenOut,
    amountIn,
    amountOutMin,
    feeTier = FEE_TIERS.MEDIUM,
    deadline = Math.floor(Date.now() / 1000) + 20 * 60,
  } = params;

  const tokenInData = getTokenBySymbol(tokenIn, 1);
  const tokenOutData = getTokenBySymbol(tokenOut, 1);
  if (!tokenInData) throw new Error(`Unknown token: ${tokenIn}`);
  if (!tokenOutData) throw new Error(`Unknown token: ${tokenOut}`);

  const cfg = getUniswapWrapperV2Config();
  const inNative = isNativeToken(tokenInData.address);
  const outNative = isNativeToken(tokenOutData.address);
  if (inNative && outNative) {
    throw new Error('Uniswap fee wrapper V2 does not support native→native');
  }
  if ((inNative || outNative) && !cfg.nativeEnabled) {
    throw new Error(
      'Uniswap fee wrapper V2 native legs are disabled (set VITE_UNISWAP_WRAPPER_V2_NATIVE_ENABLED when canarying)',
    );
  }

  const tokenOutAddress = getSwapAddress(tokenOutData, 1);

  if (inNative && !outNative) {
    const amountInWei = parseUnits(amountIn, tokenInData.decimals);
    const amountOutMinNetWei = parseUnits(amountOutMin, tokenOutData.decimals);
    const iface = new Interface(WRAPPER_V2_ABI_ETH_FOR_TOKENS);
    const calldata = iface.encodeFunctionData('swapExactInputSingleEthForTokens', [
      tokenOutAddress,
      feeTier,
      amountInWei,
      amountOutMinNetWei,
      deadline,
      0n,
    ]);
    return { to: wrapper, data: calldata, value: amountInWei.toString() };
  }

  if (!inNative && outNative) {
    const tokenInAddress = getSwapAddress(tokenInData, 1);
    const amountInWei = parseUnits(amountIn, tokenInData.decimals);
    const amountOutMinNetWei = parseUnits(amountOutMin, tokenOutData.decimals);
    const iface = new Interface(WRAPPER_V2_ABI_TOKENS_FOR_ETH);
    const calldata = iface.encodeFunctionData('swapExactInputSingleTokensForEth', [
      tokenInAddress,
      feeTier,
      amountInWei,
      amountOutMinNetWei,
      deadline,
      0n,
    ]);
    return { to: wrapper, data: calldata, value: '0' };
  }

  const tokenInAddress = getSwapAddress(tokenInData, 1);
  const amountInWei = parseUnits(amountIn, tokenInData.decimals);
  const amountOutMinNetWei = parseUnits(amountOutMin, tokenOutData.decimals);
  const iface = new Interface(WRAPPER_V2_ABI_ERC20);
  const calldata = iface.encodeFunctionData('swapExactInputSingleERC20', [
    tokenInAddress,
    tokenOutAddress,
    feeTier,
    amountInWei,
    amountOutMinNetWei,
    deadline,
    0n,
  ]);
  return { to: wrapper, data: calldata, value: '0' };
}

export function buildUniswapWrapperV2ApprovalTx(
  tokenSymbol: string,
  wrapperAddress: string,
  chainId: number = 1,
  amount: bigint = MaxUint256,
): ReturnType<typeof buildApprovalTx> {
  if (chainId !== 1) {
    throw new Error('Uniswap fee wrapper V2 approvals are only supported on Ethereum mainnet');
  }
  requireV2(wrapperAddress);
  const token = getTokenBySymbol(tokenSymbol, chainId);
  if (!token) throw new Error(`Unknown token: ${tokenSymbol}`);
  if (isNativeToken(token.address)) {
    throw new Error('Native ETH does not require ERC20 allowance for wrapper V2');
  }
  return buildApprovalTx(token.address, getAddress(wrapperAddress), amount);
}
