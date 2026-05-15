/**
 * Uniswap V3 fee wrapper **V3** transaction encoding (Ethereum chain 1).
 * ERC20 `swapExactInputERC20` only (P4.4-F). Native ETH deferred.
 */

import { Interface, MaxUint256, getAddress, isAddress, parseUnits } from 'ethers';
import { getTokenBySymbol, getSwapAddress, isNativeToken } from '@/tokens';
import type { SwapParams } from './uniswapTxBuilder';
import { buildApprovalTx } from './uniswapTxBuilder';
import { getUniswapWrapperV3Config } from '@/config/uniswapWrapperV3';
import type { UniswapWrapperV3QuoteResult } from './uniswapWrapperQuoteV3';

const WRAPPER_V3_SWAP_ABI = [
  {
    inputs: [
      { name: 'path', type: 'bytes' },
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMinNet', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactInputERC20',
    outputs: [
      { name: 'amountOutGross', type: 'uint256' },
      { name: 'feeAmount', type: 'uint256' },
      { name: 'amountOutNet', type: 'uint256' },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

export interface UnsignedUniswapWrapperV3SwapTx {
  to: string;
  data: string;
  value: string;
}

function requireV3(wrapperAddress: string): void {
  const cfg = getUniswapWrapperV3Config();
  if (!cfg.enabled || !cfg.wrapperAddress) {
    throw new Error('Uniswap fee wrapper V3 is not enabled or not configured');
  }
  if (getAddress(wrapperAddress) !== getAddress(cfg.wrapperAddress)) {
    throw new Error('Uniswap fee wrapper V3 address mismatch vs env configuration');
  }
}

export function buildUniswapWrapperV3SwapTx(
  wrapperAddress: string,
  params: SwapParams & { path: `0x${string}`; tokenInAddress: string; tokenOutAddress: string },
): UnsignedUniswapWrapperV3SwapTx {
  if (!isAddress(wrapperAddress)) {
    throw new Error('Invalid Uniswap wrapper V3 address');
  }
  const wrapper = getAddress(wrapperAddress);
  requireV3(wrapper);

  const {
    path,
    tokenInAddress,
    tokenOutAddress,
    tokenIn,
    tokenOut,
    amountIn,
    amountOutMin,
    deadline = Math.floor(Date.now() / 1000) + 20 * 60,
  } = params;

  const tokenInData = getTokenBySymbol(tokenIn, 1);
  const tokenOutData = getTokenBySymbol(tokenOut, 1);
  if (!tokenInData) throw new Error(`Unknown token: ${tokenIn}`);
  if (!tokenOutData) throw new Error(`Unknown token: ${tokenOut}`);
  if (isNativeToken(tokenInData.address) || isNativeToken(tokenOutData.address)) {
    throw new Error('Uniswap fee wrapper V3 (P4.4-F) does not support native ETH legs');
  }

  const amountInWei = parseUnits(amountIn, tokenInData.decimals);
  const amountOutMinNetWei = parseUnits(amountOutMin, tokenOutData.decimals);

  const iface = new Interface(WRAPPER_V3_SWAP_ABI);
  const calldata = iface.encodeFunctionData('swapExactInputERC20', [
    path,
    getAddress(tokenInAddress),
    getAddress(tokenOutAddress),
    amountInWei,
    amountOutMinNetWei,
    deadline,
  ]);
  return { to: wrapper, data: calldata, value: '0' };
}

/** Extract packed path + endpoint addresses from a V3 quote result. */
export function getUniswapWrapperV3TxParamsFromQuote(
  q: UniswapWrapperV3QuoteResult,
  tokenInSymbol: string,
  tokenOutSymbol: string,
): { path: `0x${string}`; tokenInAddress: string; tokenOutAddress: string } {
  const tokenInData = getTokenBySymbol(tokenInSymbol, 1);
  const tokenOutData = getTokenBySymbol(tokenOutSymbol, 1);
  if (!tokenInData || !tokenOutData) throw new Error('Unknown token for V3 tx params');
  return {
    path: q.wrapperPath,
    tokenInAddress: getSwapAddress(tokenInData, 1),
    tokenOutAddress: getSwapAddress(tokenOutData, 1),
  };
}

export function buildUniswapWrapperV3ApprovalTx(
  tokenSymbol: string,
  wrapperAddress: string,
  chainId: number = 1,
  amount?: bigint,
): ReturnType<typeof buildApprovalTx> {
  if (chainId !== 1) {
    throw new Error('Uniswap fee wrapper V3 approvals are only supported on Ethereum mainnet');
  }
  requireV3(wrapperAddress);
  const token = getTokenBySymbol(tokenSymbol, chainId);
  if (!token) throw new Error(`Unknown token: ${tokenSymbol}`);
  if (isNativeToken(token.address)) {
    throw new Error('Native ETH does not require ERC20 allowance for wrapper V3');
  }
  const approveAmt = amount ?? MaxUint256;
  return buildApprovalTx(token.address, getAddress(wrapperAddress), approveAmt);
}
