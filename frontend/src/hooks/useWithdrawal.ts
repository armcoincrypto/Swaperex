/**
 * Withdrawal Hook
 *
 * Handles withdrawal template fetching and transaction execution.
 * ALL signing happens client-side via connected wallet.
 */

import { useCallback, useState } from 'react';
import { isAddress } from 'ethers';
import { useWallet } from './useWallet';
import { useTransaction } from './useTransaction';
import { useBalanceStore } from '@/stores/balanceStore';
import { withdrawalsApi, transactionsApi } from '@/api';
import { toast } from '@/stores/toastStore';
import { isUserRejection, parseTransactionError } from '@/utils/errors';
import type { WithdrawalResponse } from '@/types/api';

export type WithdrawalStatus =
  | 'idle'
  | 'validating'
  | 'fetching_template'
  | 'previewing'
  | 'approving'
  | 'signing'
  | 'broadcasting'
  | 'success'
  | 'error';

interface WithdrawalState {
  status: WithdrawalStatus;
  template: WithdrawalResponse | null;
  txHash: string | null;
  error: string | null;
}

interface WithdrawalInput {
  asset: string;
  amount: string;
  destinationAddress: string;
  chain: string;
}

export function useWithdrawal() {
  const { address, isWrongChain } = useWallet();
  const { executeTransaction } = useTransaction();
  const { fetchBalances } = useBalanceStore();

  const [state, setState] = useState<WithdrawalState>({
    status: 'idle',
    template: null,
    txHash: null,
    error: null,
  });

  const [input, setInput] = useState<WithdrawalInput>({
    asset: '',
    amount: '',
    destinationAddress: '',
    chain: 'ethereum',
  });

  // Validation helpers - use ethers.js isAddress for proper validation
  // This handles checksums, format, and edge cases correctly
  const isValidAddress = useCallback((addr: string): boolean => {
    if (!addr) return false;
    return isAddress(addr);
  }, []);

  const isValidAmount = useCallback((amt: string): boolean => {
    const num = parseFloat(amt);
    return !isNaN(num) && num > 0;
  }, []);

  // Reset state
  const reset = useCallback(() => {
    setState({ status: 'idle', template: null, txHash: null, error: null });
    setInput({ asset: '', amount: '', destinationAddress: '', chain: 'ethereum' });
  }, []);

  // Update input fields
  const updateInput = useCallback((field: keyof WithdrawalInput, value: string) => {
    setInput((prev) => ({ ...prev, [field]: value }));
    // Clear any previous errors when user types
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  // Validate inputs
  const validateInputs = useCallback((): { valid: boolean; error: string | null } => {
    if (!address) {
      return { valid: false, error: 'Wallet not connected' };
    }
    if (!input.asset) {
      return { valid: false, error: 'Please select an asset' };
    }
    if (!isValidAmount(input.amount)) {
      return { valid: false, error: 'Please enter a valid amount' };
    }
    if (!input.destinationAddress) {
      return { valid: false, error: 'Please enter a destination address' };
    }
    if (!isValidAddress(input.destinationAddress)) {
      return { valid: false, error: 'Invalid address format (must be 0x...)' };
    }
    if (input.destinationAddress.toLowerCase() === address.toLowerCase()) {
      return { valid: false, error: 'Cannot withdraw to your own address' };
    }
    return { valid: true, error: null };
  }, [address, input, isValidAddress, isValidAmount]);

  // Check if ready to preview
  const canPreview = address &&
    input.asset &&
    isValidAmount(input.amount) &&
    isValidAddress(input.destinationAddress) &&
    input.destinationAddress.toLowerCase() !== address.toLowerCase() &&
    !isWrongChain;

  // Fetch withdrawal template
  const fetchTemplate = useCallback(async () => {
    const validation = validateInputs();
    if (!validation.valid) {
      setState((prev) => ({ ...prev, error: validation.error }));
      return null;
    }

    if (!address) return null;

    setState((prev) => ({ ...prev, status: 'fetching_template', error: null }));

    try {
      const template = await withdrawalsApi.getWithdrawalTemplate({
        asset: input.asset,
        amount: input.amount,
        destination_address: input.destinationAddress,
        from_address: address,
        chain: input.chain,
      });

      if (!template.success) {
        throw new Error(template.error || 'Failed to get withdrawal template');
      }

      setState((prev) => ({ ...prev, status: 'previewing', template }));
      return template;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to fetch template';
      setState((prev) => ({ ...prev, status: 'error', error }));
      toast.error(error);
      return null;
    }
  }, [address, input, validateInputs]);

  // Execute the withdrawal
  const executeWithdrawal = useCallback(async () => {
    if (!state.template?.transaction || !address) {
      throw new Error('No withdrawal template available');
    }

    try {
      const transaction = state.template.transaction;
      const needsApproval = state.template.is_token_transfer;

      // Step 1: Handle token approval if needed (ERC-20 transfer)
      if (needsApproval && state.template.token_contract) {
        setState((prev) => ({ ...prev, status: 'approving' }));
        toast.info('Approving token transfer...');

        try {
          // Build approval transaction
          const approvalTx = await transactionsApi.buildApproval(
            transaction.chain,
            state.template.token_contract,
            transaction.to, // spender is the destination for direct transfer
            true
          );

          // User signs approval in wallet
          await executeTransaction(approvalTx);
          toast.success('Token approved!');
        } catch (approvalErr) {
          // For direct transfers, approval may not be needed
          console.log('Approval not required for direct transfer');
        }
      }

      // Step 2: Execute the withdrawal
      setState((prev) => ({ ...prev, status: 'signing' }));
      toast.info('Confirm withdrawal in your wallet...');

      // User signs withdrawal in wallet
      const txHash = await executeTransaction(transaction as any);

      setState((prev) => ({ ...prev, status: 'broadcasting', txHash }));

      // Step 3: Wait for confirmation (handled in executeTransaction)
      setState((prev) => ({ ...prev, status: 'success', txHash }));
      toast.success('Withdrawal sent!');

      // Refresh balances
      if (address) {
        await fetchBalances(address, [transaction.chain]);
      }

      return txHash;
    } catch (err) {
      const parsed = parseTransactionError(err);
      setState((prev) => ({ ...prev, status: 'error', error: parsed.message }));

      // User rejections show as warnings, actual errors show as errors
      if (isUserRejection(err)) {
        toast.warning(parsed.message);
      } else {
        toast.error(parsed.message);
      }

      throw err;
    }
  }, [state.template, address, executeTransaction, fetchBalances]);

  // Preview withdrawal (fetch template and show modal)
  const preview = useCallback(async () => {
    if (!canPreview) {
      const validation = validateInputs();
      setState((prev) => ({ ...prev, error: validation.error }));
      return null;
    }

    return fetchTemplate();
  }, [canPreview, validateInputs, fetchTemplate]);

  // Confirm and execute after preview
  const confirmWithdrawal = useCallback(async () => {
    if (state.status !== 'previewing' || !state.template) {
      throw new Error('No withdrawal to confirm');
    }

    return executeWithdrawal();
  }, [state.status, state.template, executeWithdrawal]);

  // Cancel preview
  const cancelPreview = useCallback(() => {
    if (state.status === 'previewing' || state.status === 'error') {
      setState((prev) => ({ ...prev, status: 'idle', template: null, error: null }));
    }
  }, [state.status]);

  return {
    // State
    ...state,
    input,
    canPreview,
    isWrongChain,

    // Actions
    updateInput,
    preview,
    confirmWithdrawal,
    cancelPreview,
    reset,

    // Validation
    validateInputs,
    isValidAddress,
    isValidAmount,
  };
}

export default useWithdrawal;
