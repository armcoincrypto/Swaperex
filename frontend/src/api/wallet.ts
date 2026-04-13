/**
 * Wallet API - /wallet endpoints
 *
 * Manages wallet sessions. Backend NEVER receives private keys.
 *
 * Session registration (`/wallet/connect`, `/wallet/disconnect`) is optional: many
 * deployments only serve WalletConnect + read-only in the browser and do not expose
 * these routes. When disabled (default), those calls are skipped — no HTTP, no 404 noise.
 * Set `VITE_ENABLE_WALLET_SESSION_API=true` at build time if your backend implements them.
 */

import apiClient from './client';
import type {
  ConnectWalletRequest,
  ConnectWalletResponse,
  WalletSession,
  WalletCapabilities,
  WalletType,
} from '@/types/api';

/** Opt-in: only then POST /wallet/connect and /wallet/disconnect are sent. */
const WALLET_SESSION_API_ENABLED =
  import.meta.env.VITE_ENABLE_WALLET_SESSION_API === 'true';

export async function connectWallet(
  request: ConnectWalletRequest
): Promise<ConnectWalletResponse> {
  if (!WALLET_SESSION_API_ENABLED) {
    return { success: true };
  }

  const response = await apiClient.post<ConnectWalletResponse>('/wallet/connect', request);
  return response.data;
}

export async function disconnectWallet(address: string): Promise<{ success: boolean }> {
  if (!WALLET_SESSION_API_ENABLED) {
    return { success: true };
  }

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
