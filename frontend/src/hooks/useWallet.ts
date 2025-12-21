/**
 * Wallet Connection Hook
 *
 * Provides wallet connection functionality using ethers.js.
 * Integrates with the wallet store and backend API.
 */

import { useCallback, useEffect, useState } from 'react';
import { BrowserProvider, JsonRpcSigner, isAddress } from 'ethers';
import { useWalletStore } from '@/stores/walletStore';
import { useBalanceStore } from '@/stores/balanceStore';
import { parseWalletError } from '@/utils/errors';
import { walletEvents } from '@/services/walletEvents';

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
    isReadOnly,
    address,
    chainId,
    walletType,
    supportedChainIds,
    connectionError,
    connect,
    disconnect,
    switchChain,
    updateChainId,
    setConnecting,
    setReadOnlyAddress,
    setConnectionError,
    clearError,
  } = useWalletStore();

  const { fetchBalances, clearBalances } = useBalanceStore();
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [isSwitchingChain, setIsSwitchingChain] = useState(false);

  // Check if MetaMask is available
  const hasInjectedWallet = typeof window !== 'undefined' && !!window.ethereum;

  // Connect to injected wallet (MetaMask)
  const connectInjected = useCallback(async () => {
    if (!window.ethereum) {
      setConnectionError('No wallet detected. Please install MetaMask.');
      return;
    }

    setConnecting(true);
    clearError();

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

      // Fetch balances (non-blocking - connection succeeds even if balances fail)
      fetchBalances(accounts[0], ['ethereum', 'bsc', 'polygon']).catch((err) => {
        console.warn('[Wallet] Balance fetch failed (non-critical):', err.message);
      });
    } catch (err) {
      const parsed = parseWalletError(err);
      setConnectionError(parsed.message);
      throw err;
    } finally {
      setConnecting(false);
    }
  }, [connect, fetchBalances, setConnecting, setConnectionError, clearError]);

  // Disconnect wallet
  const disconnectWallet = useCallback(async () => {
    const previousAddress = address;
    await disconnect();
    clearBalances();
    setProvider(null);
    setSigner(null);

    // Emit disconnect event for active operations to cancel
    walletEvents.emit('disconnect', { previousAddress: previousAddress || undefined });
  }, [disconnect, clearBalances, address]);

  // Enter read-only mode (view wallet without signing)
  const enterReadOnlyMode = useCallback((viewAddress: string): boolean => {
    // Validate address using ethers.js isAddress
    // This handles checksums, length, and format validation properly
    if (!isAddress(viewAddress)) {
      // Don't set connection error - let component handle inline error display
      // This prevents toast loops and keeps error handling in UI
      return false;
    }

    setReadOnlyAddress(viewAddress);

    // Fetch balances for read-only address
    fetchBalances(viewAddress, ['ethereum', 'bsc', 'polygon']);
    return true;
  }, [setReadOnlyAddress, fetchBalances]);

  // Exit read-only mode
  const exitReadOnlyMode = useCallback(async () => {
    await disconnect();
    clearBalances();
  }, [disconnect, clearBalances]);

  // Switch network
  const switchNetwork = useCallback(
    async (targetChainId: number) => {
      if (!window.ethereum) {
        throw new Error('No wallet detected');
      }

      if (isReadOnly) {
        throw new Error('Cannot switch network in view-only mode');
      }

      setIsSwitchingChain(true);

      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${targetChainId.toString(16)}` }],
        });

        await switchChain(targetChainId);
      } catch (err: unknown) {
        const parsed = parseWalletError(err);
        throw new Error(parsed.message);
      } finally {
        setIsSwitchingChain(false);
      }
    },
    [switchChain, isReadOnly]
  );

  // Get signer for transactions
  const getSigner = useCallback(async () => {
    if (!provider) {
      throw new Error('Not connected');
    }
    return provider.getSigner();
  }, [provider]);

  // Listen for account and chain changes
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = async (accounts: unknown) => {
      const accountList = accounts as string[];
      const previousAddress = address;

      if (accountList.length === 0) {
        // Wallet disconnected
        walletEvents.emit('disconnect', { previousAddress: previousAddress || undefined });
        await disconnectWallet();
      } else if (isConnected && accountList[0] !== address) {
        // Account changed - emit event BEFORE reconnecting so operations can cancel
        walletEvents.emit('account_changed', {
          previousAddress: previousAddress || undefined,
          newAddress: accountList[0],
        });
        await connect(accountList[0], chainId, walletType || 'injected');
      }
    };

    const handleChainChanged = (chainIdHex: unknown) => {
      const newChainId = parseInt(chainIdHex as string, 16);
      const previousChainId = chainId;

      // Emit event BEFORE updating so operations can cancel
      if (isConnected && newChainId !== chainId) {
        walletEvents.emit('chain_changed', {
          previousChainId,
          newChainId,
        });
      }

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
    isReadOnly,
    isSwitchingChain,
    address,
    chainId,
    walletType,
    supportedChainIds,
    hasInjectedWallet,
    error: connectionError,
    provider,
    signer,

    // Actions
    connectInjected,
    disconnect: disconnectWallet,
    switchNetwork,
    getSigner,
    enterReadOnlyMode,
    exitReadOnlyMode,
    clearError,
  };
}

export default useWallet;
