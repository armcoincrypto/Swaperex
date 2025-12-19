/**
 * Transactions API - /transactions endpoints
 *
 * Builds UNSIGNED transactions for client-side signing.
 */

import apiClient from './client';
import type { TransactionRequest, UnsignedTransaction } from '@/types/api';

export async function buildTransaction(
  request: TransactionRequest
): Promise<UnsignedTransaction> {
  const response = await apiClient.post<UnsignedTransaction>('/transactions/build', request);
  return response.data;
}

export async function buildApproval(
  chain: string,
  tokenAddress: string,
  spender: string,
  unlimited: boolean = true
): Promise<UnsignedTransaction> {
  const response = await apiClient.post<UnsignedTransaction>('/transactions/approve', null, {
    params: {
      chain,
      token_address: tokenAddress,
      spender,
      unlimited,
    },
  });
  return response.data;
}

export const transactionsApi = {
  buildTransaction,
  buildApproval,
};

export default transactionsApi;
