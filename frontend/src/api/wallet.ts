/**
 * Wallet API - /wallet endpoints
 *
 * Manages wallet sessions. Backend NEVER receives private keys.
 */

import apiClient from './client';
import type {
  ConnectWalletRequest,
  ConnectWalletResponse,
  WalletSession,
  WalletCapabilities,
  WalletType,
} from '@/types/api';

export async function connectWallet(
  request: ConnectWalletRequest
): Promise<ConnectWalletResponse> {
  const response = await apiClient.post<ConnectWalletResponse>('/wallet/connect', request);
  return response.data;
}

export async function disconnectWallet(address: string): Promise<{ success: boolean }> {
  const response = await apiClient.post('/wallet/disconnect', null, {
    params: { address },
  });
  return response.data;
}

export async function getSession(address: string): Promise<WalletSession> {
  const response = await apiClient.get<WalletSession>(`/wallet/session/${address}`);
  return response.data;
}

export async function switchChain(
  address: string,
  chainId: number
): Promise<{ success: boolean; chain_id: number }> {
  const response = await apiClient.post('/wallet/switch-chain', {
    address,
    chain_id: chainId,
  });
  return response.data;
}

export async function getCapabilities(
  walletType: WalletType,
  readOnly: boolean = false
): Promise<WalletCapabilities> {
  const response = await apiClient.get<WalletCapabilities>(
    `/wallet/capabilities/${walletType}`,
    { params: { read_only: readOnly } }
  );
  return response.data;
}

export async function listSessions(): Promise<{ count: number; sessions: WalletSession[] }> {
  const response = await apiClient.get('/wallet/sessions');
  return response.data;
}

export const walletApi = {
  connectWallet,
  disconnectWallet,
  getSession,
  switchChain,
  getCapabilities,
  listSessions,
};

export default walletApi;
