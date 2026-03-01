/**
 * Wallet Connection Hook — Multi-connector
 *
 * Supports:
 * - Injected wallets (MetaMask, Rabby, Brave, Coinbase ext, OKX)
 * - WalletConnect v2 (QR + deep link for mobile wallets, Ledger Live)
 * - Read-only mode (view without signing)
 *
 * Provides ethers.js BrowserProvider/Signer for transaction signing.
 * Integrates with walletStore and walletEvents.
 *
 * SECURITY: NEVER receives private keys — only public address.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserProvider, JsonRpcSigner, isAddress } from 'ethers';
import { useWalletStore } from '@/stores/walletStore';
import { useBalanceStore } from '@/stores/balanceStore';
import { parseWalletError } from '@/utils/errors';
import { walletEvents } from '@/services/walletEvents';
import {
  connectInjected as doConnectInjected,
  connectWalletConnect as doConnectWalletConnect,
  autoReconnect,
  disconnectAll,
  detectInjectedWallet,
  getWcProvider,
  getChain,
} from '@/wallet';
import type { EIP1193Provider, ConnectorId } from '@/wallet';

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
  const [connectorLabel, setConnectorLabel] = useState<string>('');

  // Track the raw EIP-1193 provider for event listeners
  const rawProviderRef = useRef<EIP1193Provider | null>(null);
  const connectorIdRef = useRef<ConnectorId | null>(null);

  // Check if an injected wallet is available
  const { available: hasInjectedWallet, label: injectedLabel } = detectInjectedWallet();

  // ─── Helper: wrap raw provider into ethers ─────────────────

  const setupEthersProvider = useCallback(async (raw: EIP1193Provider) => {
    const browserProvider = new BrowserProvider(raw);
    let walletSigner: JsonRpcSigner | null = null;
    try {
      walletSigner = await browserProvider.getSigner();
    } catch {
      // Some providers (WC) may not support getSigner immediately
    }
    setProvider(browserProvider);
    setSigner(walletSigner);
    rawProviderRef.current = raw;
    return { browserProvider, walletSigner };
  }, []);

  // ─── Helper: fetch balances (non-blocking) ────────────────

  const safeFetchBalances = useCallback(
    (addr: string) => {
      fetchBalances(addr, ['ethereum', 'bsc', 'polygon']).catch((err) => {
        console.warn('[Wallet] Balance fetch failed (non-critical):', err.message);
      });
    },
    [fetchBalances],
  );

  // ─── Auto-reconnect on mount ──────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const tryAutoReconnect = async () => {
      if (isConnected || isConnecting) return;

      try {
        const result = await autoReconnect();
        if (cancelled || !result) return;

        console.log('[Wallet] Auto-reconnecting via', result.info.connectorId, 'to', result.info.address);

        await setupEthersProvider(result.provider);
        connectorIdRef.current = result.info.connectorId;
        setConnectorLabel(result.info.label);

        await connect(result.info.address, result.info.chainId, result.info.connectorId === 'walletconnect' ? 'walletconnect' : 'injected');
        safeFetchBalances(result.info.address);
      } catch (err) {
        console.warn('[Wallet] Auto-reconnect failed:', err);
      }
    };

    tryAutoReconnect();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  // ─── Connect: Injected ────────────────────────────────────

  const connectInjected = useCallback(async () => {
    setConnecting(true);
    clearError();

    try {
      const result = await doConnectInjected();

      await setupEthersProvider(result.provider);
      connectorIdRef.current = 'injected';
      setConnectorLabel(result.info.label);

      await connect(result.info.address, result.info.chainId, 'injected');
      safeFetchBalances(result.info.address);
    } catch (err) {
      const parsed = parseWalletError(err);
      setConnectionError(parsed.message);
      throw err;
    } finally {
      setConnecting(false);
    }
  }, [connect, safeFetchBalances, setConnecting, setConnectionError, clearError, setupEthersProvider]);

  // ─── Connect: WalletConnect ───────────────────────────────

  const connectWalletConnect = useCallback(async () => {
    setConnecting(true);
    clearError();

    try {
      const result = await doConnectWalletConnect();

      await setupEthersProvider(result.provider);
      connectorIdRef.current = 'walletconnect';
      setConnectorLabel('WalletConnect');

      await connect(result.info.address, result.info.chainId, 'walletconnect');
      safeFetchBalances(result.info.address);
    } catch (err) {
      // User closing the QR modal fires an error — treat as cancellation
      const msg = (err as Error)?.message?.toLowerCase() || '';
      if (msg.includes('user rejected') || msg.includes('connection request reset') || msg.includes('expired')) {
        setConnectionError('Connection cancelled');
      } else {
        const parsed = parseWalletError(err);
        setConnectionError(parsed.message);
      }
      throw err;
    } finally {
      setConnecting(false);
    }
  }, [connect, safeFetchBalances, setConnecting, setConnectionError, clearError, setupEthersProvider]);

  // ─── Disconnect ───────────────────────────────────────────

  const disconnectWallet = useCallback(async () => {
    const previousAddress = address;

    await disconnectAll();
    await disconnect();
    clearBalances();
    setProvider(null);
    setSigner(null);
    rawProviderRef.current = null;
    connectorIdRef.current = null;
    setConnectorLabel('');

    walletEvents.emit('disconnect', { previousAddress: previousAddress || undefined });
  }, [disconnect, clearBalances, address]);

  // ─── Read-only mode ───────────────────────────────────────

  const enterReadOnlyMode = useCallback((viewAddress: string): boolean => {
    if (!isAddress(viewAddress)) return false;

    setReadOnlyAddress(viewAddress);
    connectorIdRef.current = 'readonly';
    setConnectorLabel('View Only');
    safeFetchBalances(viewAddress);
    return true;
  }, [setReadOnlyAddress, safeFetchBalances]);

  const exitReadOnlyMode = useCallback(async () => {
    await disconnectAll();
    await disconnect();
    clearBalances();
    connectorIdRef.current = null;
    setConnectorLabel('');
  }, [disconnect, clearBalances]);

  // ─── Switch network ───────────────────────────────────────

  const switchNetwork = useCallback(
    async (targetChainId: number) => {
      const raw = rawProviderRef.current || window.ethereum;
      if (!raw) throw new Error('No wallet detected');
      if (isReadOnly) throw new Error('Cannot switch network in view-only mode');

      setIsSwitchingChain(true);

      try {
        await raw.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${targetChainId.toString(16)}` }],
        });
        await switchChain(targetChainId);
      } catch (err: unknown) {
        const code = (err as { code?: number }).code;

        // Chain not added to wallet — try wallet_addEthereumChain
        if (code === 4902) {
          const chainCfg = getChain(targetChainId);
          if (chainCfg) {
            await raw.request({
              method: 'wallet_addEthereumChain',
              params: [chainCfg.addChainParams],
            });
            await switchChain(targetChainId);
            return;
          }
        }

        const parsed = parseWalletError(err);
        throw new Error(parsed.message);
      } finally {
        setIsSwitchingChain(false);
      }
    },
    [switchChain, isReadOnly],
  );

  // ─── Get signer ───────────────────────────────────────────

  const getSigner = useCallback(async () => {
    if (provider) {
      return provider.getSigner();
    }

    // Recreate from raw provider
    const raw = rawProviderRef.current || window.ethereum;
    if (raw && address) {
      console.log('[Wallet] Recreating provider from raw provider');
      const browserProvider = new BrowserProvider(raw);
      const walletSigner = await browserProvider.getSigner();
      setProvider(browserProvider);
      setSigner(walletSigner);
      return walletSigner;
    }

    throw new Error('Not connected');
  }, [provider, address]);

  // ─── Event listeners: accountsChanged + chainChanged ──────

  useEffect(() => {
    const raw = rawProviderRef.current || window.ethereum;
    if (!raw) return;

    const handleAccountsChanged = async (accounts: unknown) => {
      const accountList = accounts as string[];
      const previousAddress = address;

      if (accountList.length === 0) {
        walletEvents.emit('disconnect', { previousAddress: previousAddress || undefined });
        await disconnectWallet();
      } else if (isConnected && accountList[0] !== address) {
        walletEvents.emit('account_changed', {
          previousAddress: previousAddress || undefined,
          newAddress: accountList[0],
        });
        await connect(accountList[0], chainId, walletType || 'injected');

        // Refresh provider/signer for new account
        if (rawProviderRef.current) {
          await setupEthersProvider(rawProviderRef.current);
        }
      }
    };

    const handleChainChanged = (chainIdHex: unknown) => {
      const newChainId = parseInt(chainIdHex as string, 16);
      const previousChainId = chainId;

      if (isConnected && newChainId !== chainId) {
        walletEvents.emit('chain_changed', { previousChainId, newChainId });
      }

      updateChainId(newChainId);
    };

    raw.on('accountsChanged', handleAccountsChanged);
    raw.on('chainChanged', handleChainChanged);

    // WalletConnect-specific: session_delete
    const wcProvider = getWcProvider();
    const handleWcDisconnect = () => {
      walletEvents.emit('disconnect', { previousAddress: address || undefined });
      disconnectWallet();
    };

    if (wcProvider && connectorIdRef.current === 'walletconnect') {
      wcProvider.on('session_delete', handleWcDisconnect);
    }

    return () => {
      raw.removeListener('accountsChanged', handleAccountsChanged);
      raw.removeListener('chainChanged', handleChainChanged);
      if (wcProvider) {
        wcProvider.removeListener('session_delete', handleWcDisconnect);
      }
    };
  }, [address, chainId, connect, disconnectWallet, isConnected, updateChainId, walletType, setupEthersProvider]);

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
    connectorLabel,
    injectedLabel,

    // Actions
    connectInjected,
    connectWalletConnect,
    disconnect: disconnectWallet,
    switchNetwork,
    getSigner,
    enterReadOnlyMode,
    exitReadOnlyMode,
    clearError,
  };
}

export default useWallet;
