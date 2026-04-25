/**
 * PancakeSwap V3 fee wrapper transaction encoding (BSC chain 56, ERC20→ERC20 only).
 */

import { Interface, MaxUint256, getAddress, isAddress, parseUnits } from 'ethers';
import { getTokenBySymbol, getSwapAddress, isNativeToken } from '@/tokens';
import type { PancakeSwapParams } from './pancakeSwapTxBuilder';
import { PANCAKE_FEE_TIERS } from './pancakeSwapQuote';
import { buildApprovalTx } from './uniswapTxBuilder';

const WRAPPER_SWAP_ABI = [
  {
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'recipient', type: 'address' },
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

export interface UnsignedPancakeWrapperSwapTx {
  to: string;
  data: string;
  value: string;
}

export function buildPancakeWrapperSwapTx(
  wrapperAddress: string,
  params: PancakeSwapParams,
): UnsignedPancakeWrapperSwapTx {
  if (!isAddress(wrapperAddress)) {
    throw new Error('Invalid Pancake wrapper address');
  }
  const wrapper = getAddress(wrapperAddress);

  const {
    tokenIn,
    tokenOut,
    amountIn,
    amountOutMin,
    recipient,
    feeTier = PANCAKE_FEE_TIERS.MEDIUM,
    deadline = Math.floor(Date.now() / 1000) + 20 * 60,
  } = params;

  const tokenInData = getTokenBySymbol(tokenIn, 56);
  const tokenOutData = getTokenBySymbol(tokenOut, 56);
  if (!tokenInData) throw new Error(`Unknown token: ${tokenIn}`);
  if (!tokenOutData) throw new Error(`Unknown token: ${tokenOut}`);

  if (isNativeToken(tokenInData.address) || isNativeToken(tokenOutData.address)) {
    throw new Error('Pancake fee wrapper does not support native BNB');
  }

  const tokenInAddress = getSwapAddress(tokenInData, 56);
  const tokenOutAddress = getSwapAddress(tokenOutData, 56);
  const amountInWei = parseUnits(amountIn, tokenInData.decimals);
  const amountOutMinNetWei = parseUnits(amountOutMin, tokenOutData.decimals);

  const iface = new Interface(WRAPPER_SWAP_ABI);
  const calldata = iface.encodeFunctionData('swapExactInputSingleERC20', [
    tokenInAddress,
    tokenOutAddress,
    feeTier,
    recipient,
    amountInWei,
    amountOutMinNetWei,
    deadline,
    0n,
  ]);

  console.log('[PancakeWrapperTx] Building wrapper swap:', {
    tokenIn: tokenInData.symbol,
    tokenOut: tokenOutData.symbol,
    wrapper,
    feeTier,
  });

  return {
    to: wrapper,
    data: calldata,
    value: '0',
  };
}

export function buildPancakeWrapperApprovalTx(
  tokenSymbol: string,
  wrapperAddress: string,
  chainId: number = 56,
  amount: bigint = MaxUint256,
): ReturnType<typeof buildApprovalTx> {
  if (chainId !== 56) {
    throw new Error('Pancake fee wrapper approvals are only supported on BNB Chain');
  }
  if (!isAddress(wrapperAddress)) {
    throw new Error('Invalid Pancake wrapper address');
  }
  const token = getTokenBySymbol(tokenSymbol, chainId);
  if (!token) throw new Error(`Unknown token: ${tokenSymbol}`);
  if (isNativeToken(token.address)) {
    throw new Error('Native tokens do not require approval');
  }
  return buildApprovalTx(token.address, getAddress(wrapperAddress), amount);
}
