/**
 * 1inch DEX Aggregator - Transaction Builder
 *
 * Gets swap transaction data from 1inch API.
 * Returns unsigned tx for wallet to sign.
 *
 * SECURITY:
 * - This module NEVER signs transactions
 * - This module NEVER sends transactions
 * - Only returns tx data for wallet to sign
 *
 * API Docs: https://portal.1inch.dev/documentation/apis/swap/introduction
 */

import { getTokenBySymbol, type Token, isNativeToken } from '@/tokens';
import { NATIVE_TOKEN_ADDRESS, isOneInchSupported } from './oneInchQuote';

/**
 * 1inch API v6 base URL
 */
const ONEINCH_API_V6 = 'https://api.1inch.dev/swap/v6.0';

/**
 * Swap parameters for 1inch
 */
export interface OneInchSwapParams {
  tokenIn: string;           // Token symbol
  tokenOut: string;          // Token symbol
  amountIn: string;          // Human readable amount
  fromAddress: string;       // Wallet address
  slippage: number;          // Slippage percentage (e.g., 0.5 for 0.5%)
  chainId?: number;          // Chain ID (default: 1)
  receiver?: string;         // Recipient address (default: fromAddress)
  disableEstimate?: boolean; // Skip gas estimation (faster)
}

/**
 * Unsigned transaction data from 1inch
 */
export interface OneInchSwapTx {
  to: string;                // Router address
  data: string;              // Encoded calldata
  value: string;             // ETH value (for native swaps)
  gas: string;               // Estimated gas
  gasPrice: string;          // Suggested gas price
}

/**
 * Approval transaction data
 */
export interface OneInchApprovalTx {
  to: string;                // Token address
  data: string;              // Encoded approve calldata
  value: string;             // Always "0"
}

/**
 * 1inch swap response
 */
interface OneInchSwapResponse {
  tx: {
    from: string;
    to: string;
    data: string;
    value: string;
    gas: number;
    gasPrice: string;
  };
  toAmount: string;
  protocols: unknown[];
}

/**
 * 1inch approve response
 */
interface OneInchApproveResponse {
  data: string;
  gasPrice: string;
  to: string;
  value: string;
}

/**
 * Parse amount to smallest units (wei)
 */
function parseAmountToWei(amount: string, decimals: number): string {
  const [whole, fraction = ''] = amount.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  const combined = whole + paddedFraction;
  return combined.replace(/^0+/, '') || '0';
}

/**
 * Get token address for 1inch API
 */
function getOneInchTokenAddress(token: Token): string {
  if (token.address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) {
    return NATIVE_TOKEN_ADDRESS;
  }
  return token.address;
}

/**
 * Build API headers with optional API key
 */
function getHeaders(apiKey?: string): HeadersInit {
  const headers: HeadersInit = {
    'Accept': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return headers;
}

/**
 * Get 1inch Router address for approval
 */
export async function getOneInchRouterAddress(
  chainId: number = 1,
  apiKey?: string
): Promise<string> {
  const url = `${ONEINCH_API_V6}/${chainId}/approve/spender`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(apiKey),
    });

    if (!response.ok) {
      throw new Error(`Failed to get router address: ${response.status}`);
    }

    const data = await response.json();
    return data.address;
  } catch (error) {
    console.error('[1inch] Failed to get router address:', error);
    // Fallback to known addresses
    const routers: Record<number, string> = {
      1: '0x111111125421cA6dc452d289314280a0f8842A65',    // 1inch v6 Router
      56: '0x111111125421cA6dc452d289314280a0f8842A65',
      137: '0x111111125421cA6dc452d289314280a0f8842A65',
      42161: '0x111111125421cA6dc452d289314280a0f8842A65',
      10: '0x111111125421cA6dc452d289314280a0f8842A65',
      8453: '0x111111125421cA6dc452d289314280a0f8842A65',
    };
    return routers[chainId] || routers[1];
  }
}

/**
 * Build approval transaction for 1inch Router
 *
 * @param tokenSymbol - Token to approve
 * @param amount - Amount to approve (optional, defaults to unlimited)
 * @param chainId - Chain ID
 * @param apiKey - Optional API key
 *
 * @returns Approval transaction data
 *
 * SECURITY: This function NEVER signs or sends transactions
 */
export async function buildOneInchApproval(
  tokenSymbol: string,
  chainId: number = 1,
  amount?: string,
  apiKey?: string
): Promise<OneInchApprovalTx> {
  const token = getTokenBySymbol(tokenSymbol, chainId);
  if (!token) {
    throw new Error(`Unknown token: ${tokenSymbol}`);
  }

  // Native tokens don't need approval
  if (isNativeToken(token.address)) {
    throw new Error('Native tokens do not require approval');
  }

  // Build URL
  const url = new URL(`${ONEINCH_API_V6}/${chainId}/approve/transaction`);
  url.searchParams.set('tokenAddress', token.address);
  if (amount) {
    const amountWei = parseAmountToWei(amount, token.decimals);
    url.searchParams.set('amount', amountWei);
  }
  // If no amount, defaults to unlimited approval

  console.log('[1inch Approval] Building:', {
    token: tokenSymbol,
    address: token.address,
    amount: amount || 'unlimited',
    chainId,
  });

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: getHeaders(apiKey),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`1inch approval API error: ${response.status} - ${errorText}`);
    }

    const data: OneInchApproveResponse = await response.json();

    return {
      to: data.to,
      data: data.data,
      value: '0',
    };
  } catch (error) {
    console.error('[1inch Approval] Error:', error);
    throw error;
  }
}

/**
 * Check token allowance for 1inch Router
 */
export async function checkOneInchAllowance(
  tokenSymbol: string,
  walletAddress: string,
  chainId: number = 1,
  apiKey?: string
): Promise<string> {
  const token = getTokenBySymbol(tokenSymbol, chainId);
  if (!token) {
    throw new Error(`Unknown token: ${tokenSymbol}`);
  }

  // Native tokens have unlimited "allowance"
  if (isNativeToken(token.address)) {
    return 'unlimited';
  }

  const url = new URL(`${ONEINCH_API_V6}/${chainId}/approve/allowance`);
  url.searchParams.set('tokenAddress', token.address);
  url.searchParams.set('walletAddress', walletAddress);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: getHeaders(apiKey),
    });

    if (!response.ok) {
      throw new Error(`Failed to check allowance: ${response.status}`);
    }

    const data = await response.json();
    return data.allowance || '0';
  } catch (error) {
    console.error('[1inch] Failed to check allowance:', error);
    return '0';
  }
}

/**
 * Build swap transaction from 1inch API
 *
 * @param params - Swap parameters
 * @param apiKey - Optional 1inch API key
 *
 * @returns Unsigned transaction data for wallet to sign
 *
 * SECURITY: This function NEVER signs or sends transactions
 */
export async function buildOneInchSwapTx(
  params: OneInchSwapParams,
  apiKey?: string
): Promise<OneInchSwapTx> {
  const {
    tokenIn,
    tokenOut,
    amountIn,
    fromAddress,
    slippage,
    chainId = 1,
    receiver,
    disableEstimate = true,
  } = params;

  // Validate chain support
  if (!isOneInchSupported(chainId)) {
    throw new Error(`1inch does not support chain ${chainId}`);
  }

  // Resolve tokens
  const tokenInData = getTokenBySymbol(tokenIn, chainId);
  const tokenOutData = getTokenBySymbol(tokenOut, chainId);

  if (!tokenInData) throw new Error(`Unknown token: ${tokenIn}`);
  if (!tokenOutData) throw new Error(`Unknown token: ${tokenOut}`);

  // Get addresses
  const srcAddress = getOneInchTokenAddress(tokenInData);
  const dstAddress = getOneInchTokenAddress(tokenOutData);

  // Convert amount to wei
  const amountWei = parseAmountToWei(amountIn, tokenInData.decimals);

  console.log('[1inch TxBuilder] Building swap:', {
    tokenIn: tokenInData.symbol,
    tokenOut: tokenOutData.symbol,
    amountIn,
    amountWei,
    slippage,
    chainId,
    from: fromAddress,
  });

  // Build request URL
  const url = new URL(`${ONEINCH_API_V6}/${chainId}/swap`);
  url.searchParams.set('src', srcAddress);
  url.searchParams.set('dst', dstAddress);
  url.searchParams.set('amount', amountWei);
  url.searchParams.set('from', fromAddress);
  url.searchParams.set('slippage', slippage.toString());

  if (receiver && receiver !== fromAddress) {
    url.searchParams.set('receiver', receiver);
  }

  if (disableEstimate) {
    url.searchParams.set('disableEstimate', 'true');
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: getHeaders(apiKey),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[1inch TxBuilder] API Error:', response.status, errorText);

      if (response.status === 400) {
        // Parse error for specific issues
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.description?.includes('insufficient')) {
            throw new Error('Insufficient balance for this swap');
          }
          if (errorData.description?.includes('allowance')) {
            throw new Error('Token approval required');
          }
          throw new Error(errorData.description || 'Invalid swap parameters');
        } catch {
          throw new Error('Invalid swap parameters. Check amounts and addresses.');
        }
      }
      if (response.status === 429) {
        throw new Error('Rate limited. Please try again in a few seconds.');
      }

      throw new Error(`1inch API error: ${response.status}`);
    }

    const data: OneInchSwapResponse = await response.json();

    console.log('[1inch TxBuilder] Swap tx ready:', {
      to: data.tx.to,
      value: data.tx.value,
      gas: data.tx.gas,
    });

    return {
      to: data.tx.to,
      data: data.tx.data,
      value: data.tx.value,
      gas: data.tx.gas.toString(),
      gasPrice: data.tx.gasPrice,
    };
  } catch (error) {
    console.error('[1inch TxBuilder] Error:', error);
    throw error;
  }
}

/**
 * Validate swap parameters before building tx
 */
export function validateOneInchSwapParams(params: OneInchSwapParams): string[] {
  const errors: string[] = [];

  if (!params.tokenIn) errors.push('tokenIn is required');
  if (!params.tokenOut) errors.push('tokenOut is required');
  if (!params.amountIn || parseFloat(params.amountIn) <= 0) {
    errors.push('amountIn must be greater than 0');
  }
  if (!params.fromAddress || !params.fromAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
    errors.push('fromAddress must be a valid address');
  }
  if (params.slippage < 0 || params.slippage > 50) {
    errors.push('slippage must be between 0 and 50');
  }
  if (params.tokenIn === params.tokenOut) {
    errors.push('tokenIn and tokenOut must be different');
  }

  return errors;
}

export default buildOneInchSwapTx;
