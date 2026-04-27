/**
 * PancakeSwap V3 fee wrapper **V2** transaction encoding (BSC chain 56).
 *
 * Supports:
 * - ERC20 → ERC20 (`swapExactInputSingleERC20`)
 * - Native BNB → ERC20 (`swapExactInputSingleEthForTokens`, `value` = `amountIn`)
 * - ERC20 → native BNB (`swapExactInputSingleTokensForEth`, `value` = `0`)
 *
 * **Disabled by default** — requires `VITE_PANCAKE_WRAPPER_V2_ENABLED` + valid address.
 * Native legs additionally require `VITE_PANCAKE_WRAPPER_V2_NATIVE_ENABLED`.
 *
 * Routed when the selected quote provider is `pancakeswap-v3-wrapper-v2` (env-gated; see `quoteAggregator` / `useSwap`).
 */

import { Interface, MaxUint256, getAddress, isAddress, parseUnits } from 'ethers';
import { getTokenBySymbol, getSwapAddress, isNativeToken } from '@/tokens';
import type { PancakeSwapParams } from './pancakeSwapTxBuilder';
import { PANCAKE_FEE_TIERS } from './pancakeSwapQuote';
import { buildApprovalTx } from './uniswapTxBuilder';
import { getPancakeWrapperV2Config } from '@/config/pancakeWrapperV2';

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

export interface UnsignedPancakeWrapperV2SwapTx {
  to: string;
  data: string;
  value: string;
}

function requireV2(wrapperAddress: string): void {
  const cfg = getPancakeWrapperV2Config();
  if (!cfg.enabled || !cfg.wrapperAddress) {
    throw new Error('Pancake fee wrapper V2 is not enabled or not configured');
  }
  if (getAddress(wrapperAddress) !== getAddress(cfg.wrapperAddress)) {
    throw new Error('Pancake fee wrapper V2 address mismatch vs env configuration');
  }
}

/**
 * Encode a V2 wrapper swap. Throws if native legs are used while `VITE_PANCAKE_WRAPPER_V2_NATIVE_ENABLED` is off.
 */
export function buildPancakeWrapperV2SwapTx(
  wrapperAddress: string,
  params: PancakeSwapParams,
): UnsignedPancakeWrapperV2SwapTx {
  if (!isAddress(wrapperAddress)) {
    throw new Error('Invalid Pancake wrapper V2 address');
  }
  const wrapper = getAddress(wrapperAddress);
  requireV2(wrapper);

  const {
    tokenIn,
    tokenOut,
    amountIn,
    amountOutMin,
    feeTier = PANCAKE_FEE_TIERS.MEDIUM,
    deadline = Math.floor(Date.now() / 1000) + 20 * 60,
  } = params;

  const tokenInData = getTokenBySymbol(tokenIn, 56);
  const tokenOutData = getTokenBySymbol(tokenOut, 56);
  if (!tokenInData) throw new Error(`Unknown token: ${tokenIn}`);
  if (!tokenOutData) throw new Error(`Unknown token: ${tokenOut}`);

  const cfg = getPancakeWrapperV2Config();
  const inNative = isNativeToken(tokenInData.address);
  const outNative = isNativeToken(tokenOutData.address);
  if (inNative && outNative) {
    throw new Error('Pancake fee wrapper V2 does not support native→native');
  }
  if ((inNative || outNative) && !cfg.nativeEnabled) {
    throw new Error(
      'Pancake fee wrapper V2 native legs are disabled (set VITE_PANCAKE_WRAPPER_V2_NATIVE_ENABLED when canarying)',
    );
  }

  const tokenOutAddress = getSwapAddress(tokenOutData, 56);

  // Native BNB → ERC20
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

  // ERC20 → native BNB
  if (!inNative && outNative) {
    const tokenInAddress = getSwapAddress(tokenInData, 56);
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

  // ERC20 → ERC20
  const tokenInAddress = getSwapAddress(tokenInData, 56);
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

export function buildPancakeWrapperV2ApprovalTx(
  tokenSymbol: string,
  wrapperAddress: string,
  chainId: number = 56,
  amount: bigint = MaxUint256,
): ReturnType<typeof buildApprovalTx> {
  if (chainId !== 56) {
    throw new Error('Pancake fee wrapper V2 approvals are only supported on BNB Chain');
  }
  requireV2(wrapperAddress);
  const token = getTokenBySymbol(tokenSymbol, chainId);
  if (!token) throw new Error(`Unknown token: ${tokenSymbol}`);
  if (isNativeToken(token.address)) {
    throw new Error('Native BNB does not require ERC20 allowance for wrapper V2');
  }
  return buildApprovalTx(token.address, getAddress(wrapperAddress), amount);
}
