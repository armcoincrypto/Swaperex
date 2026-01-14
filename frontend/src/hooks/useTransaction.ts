/**
 * Transaction Hook
 *
 * Handles transaction building, signing, and broadcasting.
 * ALL signing happens client-side via the connected wallet.
 */

import { useCallback, useState } from 'react';
import { parseUnits, TransactionRequest as EthersTransactionRequest } from 'ethers';
import { useWallet } from './useWallet';
import type { UnsignedTransaction, UnsignedSwapTransaction } from '@/types/api';

export type TransactionStatus = 'idle' | 'signing' | 'broadcasting' | 'confirming' | 'success' | 'error';

interface TransactionState {
  status: TransactionStatus;
  txHash: string | null;
  error: string | null;
}

export function useTransaction() {
  const { getSigner, provider } = useWallet();
  const [state, setState] = useState<TransactionState>({
    status: 'idle',
    txHash: null,
    error: null,
  });

  // Reset state
  const reset = useCallback(() => {
    setState({ status: 'idle', txHash: null, error: null });
  }, []);

  // Execute a transaction from unsigned data
  const executeTransaction = useCallback(
    async (unsignedTx: UnsignedTransaction | UnsignedSwapTransaction): Promise<string> => {
      setState({ status: 'signing', txHash: null, error: null });

      try {
        const signer = await getSigner();

        // Build ethers transaction request
        const txRequest: EthersTransactionRequest = {
          to: unsignedTx.to,
          value: BigInt(unsignedTx.value),
          data: unsignedTx.data,
          chainId: unsignedTx.chain_id,
        };

        // Add gas parameters if provided
        // Handle both UnsignedTransaction (direct gas fields) and UnsignedSwapTransaction (gas_estimate object)
        const gasLimit = 'gas_limit' in unsignedTx ? unsignedTx.gas_limit : ('gas_estimate' in unsignedTx ? unsignedTx.gas_estimate?.gas_limit : undefined);
        const gasPrice = 'gas_price' in unsignedTx ? unsignedTx.gas_price : ('gas_estimate' in unsignedTx ? unsignedTx.gas_estimate?.gas_price : undefined);
        const maxFeePerGas = 'max_fee_per_gas' in unsignedTx ? unsignedTx.max_fee_per_gas : ('gas_estimate' in unsignedTx ? unsignedTx.gas_estimate?.max_fee_per_gas : undefined);
        const maxPriorityFeePerGas = 'max_priority_fee_per_gas' in unsignedTx ? unsignedTx.max_priority_fee_per_gas : ('gas_estimate' in unsignedTx ? unsignedTx.gas_estimate?.max_priority_fee_per_gas : undefined);

        if (gasLimit) {
          txRequest.gasLimit = BigInt(gasLimit);
        }
        if (maxFeePerGas) {
          txRequest.maxFeePerGas = BigInt(maxFeePerGas);
        }
        if (maxPriorityFeePerGas) {
          txRequest.maxPriorityFeePerGas = BigInt(maxPriorityFeePerGas);
        }
        if (gasPrice) {
          txRequest.gasPrice = BigInt(gasPrice);
        }

        setState({ status: 'broadcasting', txHash: null, error: null });

        // Send transaction (this opens wallet popup)
        const tx = await signer.sendTransaction(txRequest);

        setState({ status: 'confirming', txHash: tx.hash, error: null });

        // Wait for confirmation
        const receipt = await tx.wait();

        if (receipt?.status === 1) {
          setState({ status: 'success', txHash: tx.hash, error: null });
          return tx.hash;
        } else {
          throw new Error('Transaction failed');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
        setState({ status: 'error', txHash: null, error: errorMessage });
        throw err;
      }
    },
    [getSigner]
  );

  // Execute a simple transfer
  const transfer = useCallback(
    async (to: string, amount: string, decimals: number = 18): Promise<string> => {
      setState({ status: 'signing', txHash: null, error: null });

      try {
        const signer = await getSigner();
        const value = parseUnits(amount, decimals);

        setState({ status: 'broadcasting', txHash: null, error: null });

        const tx = await signer.sendTransaction({ to, value });

        setState({ status: 'confirming', txHash: tx.hash, error: null });

        await tx.wait();

        setState({ status: 'success', txHash: tx.hash, error: null });
        return tx.hash;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Transfer failed';
        setState({ status: 'error', txHash: null, error: errorMessage });
        throw err;
      }
    },
    [getSigner]
  );

  // Wait for transaction confirmation
  const waitForConfirmation = useCallback(
    async (txHash: string, confirmations: number = 1): Promise<boolean> => {
      if (!provider) {
        throw new Error('Not connected');
      }

      const receipt = await provider.waitForTransaction(txHash, confirmations);
      return receipt?.status === 1;
    },
    [provider]
  );

  return {
    ...state,
    executeTransaction,
    transfer,
    waitForConfirmation,
    reset,
  };
}

export default useTransaction;
