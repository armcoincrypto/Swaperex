/**
 * Uniswap V3 Transaction Builder
 *
 * Builds swap transaction calldata WITHOUT signing or sending.
 * The wallet signs and sends the transaction.
 *
 * SECURITY:
 * - This module NEVER signs transactions
 * - This module NEVER sends transactions
 * - Only encodes calldata for wallet to sign
 */

import { Interface, parseUnits, MaxUint256 } from 'ethers';
import { getUniswapV3Addresses } from '@/config';
import { getTokenBySymbol, getSwapAddress, isNativeToken } from '@/tokens';
import { FEE_TIERS, type FeeTier } from './uniswapQuote';

/**
 * Swap parameters
 */
export interface SwapParams {
  tokenIn: string;           // Token symbol or address
  tokenOut: string;          // Token symbol or address
  amountIn: string;          // Human readable amount (e.g., "1.5")
  amountOutMin: string;      // Minimum output (from quote with slippage)
  recipient: string;         // Wallet address to receive tokens
  feeTier?: FeeTier;         // Uniswap fee tier (default: 3000)
  deadline?: number;         // Unix timestamp deadline (default: 20 mins)
  chainId?: number;          // Chain ID (default: 1)
}

/**
 * Unsigned transaction data
 */
export interface UnsignedSwapTx {
  to: string;                // Router address
  data: string;              // Encoded calldata
  value: string;             // ETH value (for native swaps)
  gasLimit?: string;         // Estimated gas
}

/**
 * Approval transaction data
 */
export interface ApprovalTx {
  to: string;                // Token address
  data: string;              // Encoded approve calldata
  value: string;             // Always "0"
}

/**
 * SwapRouter02 ABI - Only the functions we need
 * Source: https://docs.uniswap.org/contracts/v3/reference/periphery/SwapRouter
 */
const SWAP_ROUTER_ABI = [
  // exactInputSingle - Swap exact input for output
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'exactInputSingle',
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  // multicall - Batch multiple calls
  {
    inputs: [
      { name: 'deadline', type: 'uint256' },
      { name: 'data', type: 'bytes[]' },
    ],
    name: 'multicall',
    outputs: [{ name: 'results', type: 'bytes[]' }],
    stateMutability: 'payable',
    type: 'function',
  },
  // unwrapWETH9 - Unwrap WETH to ETH after swap
  {
    inputs: [
      { name: 'amountMinimum', type: 'uint256' },
      { name: 'recipient', type: 'address' },
    ],
    name: 'unwrapWETH9',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  // refundETH - Refund any remaining ETH
  {
    inputs: [],
    name: 'refundETH',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
];

/**
 * ERC20 ABI - For approval
 */
const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

/**
 * Build swap transaction calldata
 *
 * @param params - Swap parameters
 * @returns Unsigned transaction data for wallet to sign
 *
 * SECURITY: This function NEVER signs or sends transactions
 */
export function buildSwapTx(params: SwapParams): UnsignedSwapTx {
  const {
    tokenIn,
    tokenOut,
    amountIn,
    amountOutMin,
    recipient,
    feeTier = FEE_TIERS.MEDIUM,
    deadline = Math.floor(Date.now() / 1000) + 20 * 60, // 20 minutes
    chainId = 1,
  } = params;

  // Get Uniswap V3 addresses
  const uniswapAddresses = getUniswapV3Addresses(chainId);
  if (!uniswapAddresses) {
    throw new Error(`Uniswap V3 not available on chain ${chainId}`);
  }

  // Resolve tokens
  const tokenInData = getTokenBySymbol(tokenIn, chainId);
  const tokenOutData = getTokenBySymbol(tokenOut, chainId);

  if (!tokenInData) throw new Error(`Unknown token: ${tokenIn}`);
  if (!tokenOutData) throw new Error(`Unknown token: ${tokenOut}`);

  // Get addresses (ETH → WETH for swaps)
  const tokenInAddress = getSwapAddress(tokenInData);
  const tokenOutAddress = getSwapAddress(tokenOutData);

  // Parse amounts
  const amountInWei = parseUnits(amountIn, tokenInData.decimals);
  const amountOutMinWei = parseUnits(amountOutMin, tokenOutData.decimals);

  // Check if input is native ETH
  const isNativeIn = isNativeToken(tokenInData.address);
  const isNativeOut = isNativeToken(tokenOutData.address);

  // Create interface for encoding
  const routerInterface = new Interface(SWAP_ROUTER_ABI);

  // Build swap params
  const swapParams = {
    tokenIn: tokenInAddress,
    tokenOut: tokenOutAddress,
    fee: feeTier,
    recipient: isNativeOut ? uniswapAddresses.router : recipient, // Router if unwrapping
    amountIn: amountInWei,
    amountOutMinimum: amountOutMinWei,
    sqrtPriceLimitX96: 0n, // No price limit
  };

  console.log('[TxBuilder] Building swap:', {
    tokenIn: tokenInData.symbol,
    tokenOut: tokenOutData.symbol,
    amountIn,
    amountOutMin,
    feeTier,
    isNativeIn,
    isNativeOut,
  });

  let calldata: string;

  if (isNativeOut) {
    // Swapping TO native ETH - need multicall to unwrap
    const swapCalldata = routerInterface.encodeFunctionData('exactInputSingle', [swapParams]);
    const unwrapCalldata = routerInterface.encodeFunctionData('unwrapWETH9', [
      amountOutMinWei,
      recipient,
    ]);

    calldata = routerInterface.encodeFunctionData('multicall', [
      deadline,
      [swapCalldata, unwrapCalldata],
    ]);
  } else if (isNativeIn) {
    // Swapping FROM native ETH - simple call with value
    const swapCalldata = routerInterface.encodeFunctionData('exactInputSingle', [swapParams]);
    const refundCalldata = routerInterface.encodeFunctionData('refundETH', []);

    calldata = routerInterface.encodeFunctionData('multicall', [
      deadline,
      [swapCalldata, refundCalldata],
    ]);
  } else {
    // Token to token - simple exactInputSingle
    calldata = routerInterface.encodeFunctionData('exactInputSingle', [swapParams]);
  }

  return {
    to: uniswapAddresses.router,
    data: calldata,
    value: isNativeIn ? amountInWei.toString() : '0',
    gasLimit: '250000', // Estimate, wallet will refine
  };
}

/**
 * Build approval transaction for token spending
 *
 * @param tokenAddress - Token to approve
 * @param spender - Address to approve (usually router)
 * @param amount - Amount to approve (default: MaxUint256 for infinite)
 * @returns Unsigned approval transaction
 *
 * SECURITY: This function NEVER signs or sends transactions
 */
export function buildApprovalTx(
  tokenAddress: string,
  spender: string,
  amount: bigint = MaxUint256
): ApprovalTx {
  const erc20Interface = new Interface(ERC20_ABI);

  const calldata = erc20Interface.encodeFunctionData('approve', [spender, amount]);

  console.log('[TxBuilder] Building approval:', {
    token: tokenAddress,
    spender,
    amount: amount.toString(),
  });

  return {
    to: tokenAddress,
    data: calldata,
    value: '0',
  };
}

/**
 * Build approval for Uniswap Router
 */
export function buildRouterApproval(
  tokenSymbol: string,
  chainId: number = 1,
  amount: bigint = MaxUint256
): ApprovalTx {
  const token = getTokenBySymbol(tokenSymbol, chainId);
  if (!token) throw new Error(`Unknown token: ${tokenSymbol}`);

  // Native tokens don't need approval
  if (isNativeToken(token.address)) {
    throw new Error('Native tokens do not require approval');
  }

  const uniswapAddresses = getUniswapV3Addresses(chainId);
  if (!uniswapAddresses) {
    throw new Error(`Uniswap V3 not available on chain ${chainId}`);
  }

  return buildApprovalTx(token.address, uniswapAddresses.router, amount);
}

/**
 * Calculate minimum output with slippage
 *
 * @param amountOut - Expected output from quote
 * @param slippagePercent - Slippage tolerance (e.g., 0.5 for 0.5%)
 * @param decimals - Token decimals
 * @returns Minimum amount out as string
 */
export function calculateMinOutput(
  amountOut: string,
  slippagePercent: number,
  decimals: number
): string {
  const amount = parseUnits(amountOut, decimals);
  const slippageBps = BigInt(Math.floor(slippagePercent * 100));
  const minAmount = amount - (amount * slippageBps) / 10000n;
  return minAmount.toString();
}

/**
 * Validate swap parameters
 */
export function validateSwapParams(params: SwapParams): string[] {
  const errors: string[] = [];

  if (!params.tokenIn) errors.push('tokenIn is required');
  if (!params.tokenOut) errors.push('tokenOut is required');
  if (!params.amountIn || parseFloat(params.amountIn) <= 0) {
    errors.push('amountIn must be greater than 0');
  }
  if (!params.amountOutMin || parseFloat(params.amountOutMin) < 0) {
    errors.push('amountOutMin is required');
  }
  if (!params.recipient || !params.recipient.match(/^0x[a-fA-F0-9]{40}$/)) {
    errors.push('recipient must be a valid address');
  }
  if (params.tokenIn === params.tokenOut) {
    errors.push('tokenIn and tokenOut must be different');
  }

  return errors;
}

export default buildSwapTx;
