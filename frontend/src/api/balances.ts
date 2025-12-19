/**
 * Balances API - /balances endpoints
 *
 * Fetches balances directly from blockchain state,
 * NOT from any internal ledger.
 */

import apiClient from './client';
import type {
  WalletBalanceRequest,
  WalletBalanceResponse,
  MultiChainBalanceRequest,
  MultiChainBalanceResponse,
} from '@/types/api';

export async function getWalletBalance(
  request: WalletBalanceRequest
): Promise<WalletBalanceResponse> {
  const response = await apiClient.post<WalletBalanceResponse>('/balances/wallet', request);
  return response.data;
}

export async function getMultiChainBalance(
  request: MultiChainBalanceRequest
): Promise<MultiChainBalanceResponse> {
  const response = await apiClient.post<MultiChainBalanceResponse>('/balances/multi-chain', request);
  return response.data;
}

export async function getSimpleBalance(
  address: string,
  chain: string = 'ethereum'
): Promise<WalletBalanceResponse> {
  const response = await apiClient.get<WalletBalanceResponse>(
    `/balances/address/${address}/chain/${chain}`
  );
  return response.data;
}

export const balancesApi = {
  getWalletBalance,
  getMultiChainBalance,
  getSimpleBalance,
};

export default balancesApi;
