/**
 * Wallet Connection Hook
 *
 * Provides wallet connection functionality using ethers.js.
 * Integrates with the wallet store and backend API.
 */

import { useCallback, useEffect, useState } from 'react';
import { BrowserProvider, JsonRpcSigner } from 'ethers';
import { useWalletStore } from '@/stores/walletStore';
import { useBalanceStore } from '@/stores/balanceStore';
import type { WalletType } from '@/types/api';

declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, callback: (...args: unknown[]) => void) => void;
      removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
    };
  }
}

export function useWallet() {
  const {
    isConnected,
    isConnecting,
    isWrongChain,
    address,
    chainId,
    walletType,
    supportedChainIds,
    connect,
    disconnect,
    switchChain,
    updateChainId,
    setConnecting,
  } = useWalletStore();

  const { fetchBalances, clearBalances } = useBalanceStore();
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if MetaMask is available
  const hasInjectedWallet = typeof window !== 'undefined' && !!window.ethereum;

  // Connect to injected wallet (MetaMask)
  const connectInjected = useCallback(async () => {
    if (!window.ethereum) {
      setError('No wallet detected. Please install MetaMask.');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      // Request accounts
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[];

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts found');
      }

      // Get chain ID
      const chainIdHex = (await window.ethereum.request({
        method: 'eth_chainId',
      })) as string;
      const currentChainId = parseInt(chainIdHex, 16);

      // Create provider and signer
      const browserProvider = new BrowserProvider(window.ethereum);
      const walletSigner = await browserProvider.getSigner();

      setProvider(browserProvider);
      setSigner(walletSigner);

      // Connect to backend
      await connect(accounts[0], currentChainId, 'injected');

      // Fetch balances
      await fetchBalances(accounts[0], ['ethereum', 'bsc', 'polygon']);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      throw err;
    } finally {
      setConnecting(false);
    }
  }, [connect, fetchBalances, setConnecting]);

  // Disconnect wallet
  const disconnectWallet = useCallback(async () => {
    await disconnect();
    clearBalances();
    setProvider(null);
    setSigner(null);
  }, [disconnect, clearBalances]);

  // Switch network
  const switchNetwork = useCallback(
    async (targetChainId: number) => {
      if (!window.ethereum) {
        throw new Error('No wallet detected');
      }

      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${targetChainId.toString(16)}` }],
        });

        await switchChain(targetChainId);
      } catch (err: unknown) {
        // Chain not added to wallet
        if ((err as { code?: number })?.code === 4902) {
          throw new Error('Please add this network to your wallet first');
        }
        throw err;
      }
    },
    [switchChain]
  );

  // Get signer for transactions
  const getSigner = useCallback(async () => {
    if (!provider) {
      throw new Error('Not connected');
    }
    return provider.getSigner();
  }, [provider]);

  // Listen for account changes
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = async (accounts: unknown) => {
      const accountList = accounts as string[];
      if (accountList.length === 0) {
        await disconnectWallet();
      } else if (isConnected && accountList[0] !== address) {
        // Account changed, reconnect
        await connect(accountList[0], chainId, walletType || 'injected');
      }
    };

    const handleChainChanged = (chainIdHex: unknown) => {
      const newChainId = parseInt(chainIdHex as string, 16);
      // Use updateChainId for wallet-initiated changes (not switchChain)
      updateChainId(newChainId);
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum?.removeListener('chainChanged', handleChainChanged);
    };
  }, [address, chainId, connect, disconnectWallet, isConnected, updateChainId, walletType]);

  return {
    // State
    isConnected,
    isConnecting,
    isWrongChain,
    address,
    chainId,
    walletType,
    supportedChainIds,
    hasInjectedWallet,
    error,
    provider,
    signer,

    // Actions
    connectInjected,
    disconnect: disconnectWallet,
    switchNetwork,
    getSigner,
  };
}

export default useWallet;
