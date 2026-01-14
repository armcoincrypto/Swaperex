/**
 * Jupiter Transaction Builder (Solana)
 *
 * Builds swap transactions using Jupiter API.
 * Returns serialized VersionedTransaction for wallet to sign.
 *
 * SECURITY:
 * - This module NEVER signs transactions
 * - This module NEVER sends transactions
 * - Only builds transaction data for wallet to sign
 */

import { VersionedTransaction, Connection, PublicKey } from '@solana/web3.js';
import { JUPITER_CONFIG } from '@/config/dex';
import type { JupiterQuoteResponse } from './jupiterQuote';

/**
 * Solana RPC endpoints
 */
export const SOLANA_RPC = {
  mainnet: 'https://api.mainnet-beta.solana.com',
  // Fallback RPCs if needed
  helius: 'https://mainnet.helius-rpc.com',
  quicknode: 'https://solana-mainnet.quiknode.pro',
};

/**
 * Solana explorer URLs
 */
export const SOLANA_EXPLORER = {
  solscan: 'https://solscan.io',
  explorer: 'https://explorer.solana.com',
};

/**
 * Jupiter swap request parameters
 */
export interface JupiterSwapRequest {
  quoteResponse: JupiterQuoteResponse;
  userPublicKey: string;
  wrapAndUnwrapSol?: boolean;
  useSharedAccounts?: boolean;
  dynamicComputeUnitLimit?: boolean;
  prioritizationFeeLamports?: number | 'auto';
}

/**
 * Jupiter swap response
 */
export interface JupiterSwapApiResponse {
  swapTransaction: string; // Base64 encoded VersionedTransaction
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
}

/**
 * Unsigned Solana transaction data
 */
export interface UnsignedSolanaTx {
  serializedTransaction: string; // Base64 encoded
  lastValidBlockHeight: number;
  priorityFee?: number;
}

/**
 * Build swap transaction from Jupiter API
 *
 * @param quoteResponse - Quote from getJupiterQuote
 * @param userPublicKey - User's Solana wallet address (base58)
 * @param options - Additional options
 *
 * SECURITY: This function NEVER signs or sends transactions
 */
export async function buildJupiterSwapTx(
  quoteResponse: JupiterQuoteResponse,
  userPublicKey: string,
  options: {
    wrapAndUnwrapSol?: boolean;
    priorityFee?: number | 'auto';
  } = {}
): Promise<UnsignedSolanaTx> {
  const { wrapAndUnwrapSol = true, priorityFee = 'auto' } = options;

  console.log('[Jupiter TxBuilder] Building swap transaction:', {
    userPublicKey,
    inputMint: quoteResponse.inputMint,
    outputMint: quoteResponse.outputMint,
    inAmount: quoteResponse.inAmount,
    outAmount: quoteResponse.outAmount,
  });

  // Request swap transaction from Jupiter
  const swapRequest: JupiterSwapRequest = {
    quoteResponse,
    userPublicKey,
    wrapAndUnwrapSol,
    useSharedAccounts: true,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: priorityFee,
  };

  const response = await fetch(`${JUPITER_CONFIG.apiBase}/swap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(swapRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Jupiter TxBuilder] Swap API error:', response.status, errorText);
    throw new Error(`Jupiter swap failed: ${response.status} - ${errorText}`);
  }

  const swapResponse: JupiterSwapApiResponse = await response.json();

  console.log('[Jupiter TxBuilder] Swap transaction built:', {
    lastValidBlockHeight: swapResponse.lastValidBlockHeight,
    priorityFee: swapResponse.prioritizationFeeLamports,
    txLength: swapResponse.swapTransaction.length,
  });

  return {
    serializedTransaction: swapResponse.swapTransaction,
    lastValidBlockHeight: swapResponse.lastValidBlockHeight,
    priorityFee: swapResponse.prioritizationFeeLamports,
  };
}

/**
 * Deserialize transaction from base64
 * Used by wallet adapters to sign
 */
export function deserializeTransaction(base64Tx: string): VersionedTransaction {
  const buffer = Buffer.from(base64Tx, 'base64');
  return VersionedTransaction.deserialize(buffer);
}

/**
 * Serialize signed transaction for sending
 */
export function serializeTransaction(tx: VersionedTransaction): Uint8Array {
  return tx.serialize();
}

/**
 * Get Solana explorer URL for transaction
 */
export function getSolanaExplorerUrl(signature: string, explorer: 'solscan' | 'explorer' = 'solscan'): string {
  if (explorer === 'solscan') {
    return `${SOLANA_EXPLORER.solscan}/tx/${signature}`;
  }
  return `${SOLANA_EXPLORER.explorer}/tx/${signature}?cluster=mainnet-beta`;
}

/**
 * Create Solana connection
 */
export function createSolanaConnection(rpc: string = SOLANA_RPC.mainnet): Connection {
  return new Connection(rpc, 'confirmed');
}

/**
 * Validate Solana address
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get transaction confirmation status
 */
export async function getTransactionStatus(
  connection: Connection,
  signature: string
): Promise<'confirmed' | 'finalized' | 'failed' | 'pending'> {
  try {
    const status = await connection.getSignatureStatus(signature);

    if (!status.value) {
      return 'pending';
    }

    if (status.value.err) {
      return 'failed';
    }

    if (status.value.confirmationStatus === 'finalized') {
      return 'finalized';
    }

    if (status.value.confirmationStatus === 'confirmed') {
      return 'confirmed';
    }

    return 'pending';
  } catch (error) {
    console.error('[Jupiter TxBuilder] Error getting tx status:', error);
    return 'pending';
  }
}

/**
 * Wait for transaction confirmation
 */
export async function waitForConfirmation(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number,
  timeout: number = 60000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const status = await getTransactionStatus(connection, signature);

    if (status === 'confirmed' || status === 'finalized') {
      return true;
    }

    if (status === 'failed') {
      return false;
    }

    // Check if block height has passed
    const currentBlockHeight = await connection.getBlockHeight();
    if (currentBlockHeight > lastValidBlockHeight) {
      console.warn('[Jupiter TxBuilder] Transaction expired (block height exceeded)');
      return false;
    }

    // Wait before checking again
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.warn('[Jupiter TxBuilder] Transaction confirmation timeout');
  return false;
}

export default buildJupiterSwapTx;
