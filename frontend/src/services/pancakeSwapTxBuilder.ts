/**
 * PancakeSwap V3 Transaction Builder (BSC)
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
import { getTokenBySymbol } from '@/tokens';
import { PANCAKESWAP_V3_ADDRESSES, BSC_CONFIG, PANCAKE_FEE_TIERS, type PancakeFeeTier } from './pancakeSwapQuote';

/**
 * Swap parameters
 */
export interface PancakeSwapParams {
  tokenIn: string;           // Token symbol
  tokenOut: string;          // Token symbol
  amountIn: string;          // Human readable amount
  amountOutMin: string;      // Minimum output (from quote with slippage)
  recipient: string;         // Wallet address to receive tokens
  feeTier?: PancakeFeeTier;  // Fee tier (default: 2500)
  deadline?: number;         // Unix timestamp deadline
}

/**
 * Unsigned transaction data
 */
export interface UnsignedPancakeTx {
  to: string;                // Router address
  data: string;              // Encoded calldata
  value: string;             // BNB value (for native swaps)
  gasLimit?: string;         // Estimated gas
  chainId: number;           // Always 56 for BSC
}

/**
 * Approval transaction data
 */
export interface PancakeApprovalTx {
  to: string;                // Token address
  data: string;              // Encoded approve calldata
  value: string;             // Always "0"
  chainId: number;
}

/**
 * Native BNB placeholder address
 */
const NATIVE_BNB_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

/**
 * PancakeSwap SmartRouter ABI - exactInputSingle
 * Compatible with Uniswap V3 interface
 */
const SMART_ROUTER_ABI = [
  // exactInputSingle
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
  // multicall
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
  // unwrapWETH9 (for WBNB → BNB)
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
  // refundETH
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
];

/**
 * Check if address is native BNB
 */
function isNativeBNB(address: string): boolean {
  return address.toLowerCase() === NATIVE_BNB_ADDRESS.toLowerCase();
}

/**
 * Get swap address (BNB → WBNB)
 */
function getSwapAddress(tokenAddress: string): string {
  if (isNativeBNB(tokenAddress)) {
    return BSC_CONFIG.wrappedNativeAddress;
  }
  return tokenAddress;
}

/**
 * Build swap transaction calldata for PancakeSwap V3
 *
 * @param params - Swap parameters
 * @returns Unsigned transaction data for wallet to sign
 *
 * SECURITY: This function NEVER signs or sends transactions
 */
export function buildPancakeSwapTx(params: PancakeSwapParams): UnsignedPancakeTx {
  const {
    tokenIn,
    tokenOut,
    amountIn,
    amountOutMin,
    recipient,
    feeTier = PANCAKE_FEE_TIERS.MEDIUM,
    deadline = Math.floor(Date.now() / 1000) + 20 * 60,
  } = params;

  // Resolve tokens for BSC
  const tokenInData = getTokenBySymbol(tokenIn, 56);
  const tokenOutData = getTokenBySymbol(tokenOut, 56);

  if (!tokenInData) throw new Error(`Unknown token on BSC: ${tokenIn}`);
  if (!tokenOutData) throw new Error(`Unknown token on BSC: ${tokenOut}`);

  // Get addresses (BNB → WBNB for swaps)
  const tokenInAddress = getSwapAddress(tokenInData.address);
  const tokenOutAddress = getSwapAddress(tokenOutData.address);

  // Parse amounts
  const amountInWei = parseUnits(amountIn, tokenInData.decimals);
  const amountOutMinWei = parseUnits(amountOutMin, tokenOutData.decimals);

  // Check if native BNB involved
  const isNativeIn = isNativeBNB(tokenInData.address);
  const isNativeOut = isNativeBNB(tokenOutData.address);

  // Create interface for encoding
  const routerInterface = new Interface(SMART_ROUTER_ABI);

  // Build swap params
  const swapParams = {
    tokenIn: tokenInAddress,
    tokenOut: tokenOutAddress,
    fee: feeTier,
    recipient: isNativeOut ? PANCAKESWAP_V3_ADDRESSES.router : recipient,
    amountIn: amountInWei,
    amountOutMinimum: amountOutMinWei,
    sqrtPriceLimitX96: 0n,
  };

  console.log('[PancakeSwap TxBuilder] Building swap:', {
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
    // Swapping TO native BNB - need multicall to unwrap WBNB
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
    // Swapping FROM native BNB - simple call with value
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
    to: PANCAKESWAP_V3_ADDRESSES.router,
    data: calldata,
    value: isNativeIn ? amountInWei.toString() : '0',
    gasLimit: '300000', // BSC typically needs slightly more gas
    chainId: 56,
  };
}

/**
 * Build approval transaction for PancakeSwap Router
 *
 * SECURITY: This function NEVER signs or sends transactions
 */
export function buildPancakeApprovalTx(
  tokenSymbol: string,
  amount: bigint = MaxUint256
): PancakeApprovalTx {
  const token = getTokenBySymbol(tokenSymbol, 56);
  if (!token) throw new Error(`Unknown token on BSC: ${tokenSymbol}`);

  // Native BNB doesn't need approval
  if (isNativeBNB(token.address)) {
    throw new Error('Native BNB does not require approval');
  }

  const erc20Interface = new Interface(ERC20_ABI);
  const calldata = erc20Interface.encodeFunctionData('approve', [
    PANCAKESWAP_V3_ADDRESSES.router,
    amount,
  ]);

  console.log('[PancakeSwap TxBuilder] Building approval:', {
    token: tokenSymbol,
    spender: PANCAKESWAP_V3_ADDRESSES.router,
    amount: amount.toString(),
  });

  return {
    to: token.address,
    data: calldata,
    value: '0',
    chainId: 56,
  };
}

/**
 * Calculate minimum output with slippage
 */
export function calculatePancakeMinOutput(
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
export function validatePancakeSwapParams(params: PancakeSwapParams): string[] {
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

export default buildPancakeSwapTx;
