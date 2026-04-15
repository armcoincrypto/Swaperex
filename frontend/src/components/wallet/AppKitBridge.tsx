/**
 * Syncs Reown AppKit connection state to our wallet store.
 * When user connects via AppKit modal (WalletConnect QR, MetaMask, etc.),
 * we update our store. Provider is provided via appKitProviderRef for useWallet.
 */

import { useEffect, useRef } from 'react';
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { useWalletStore } from '@/stores/walletStore';
import { useBalanceStore } from '@/stores/balanceStore';
import { appKitProviderRef } from '@/services/wallet/appKitProviderRef';

export function AppKitBridge() {
  const { address, isConnected: appKitConnected } = useAppKitAccount({ namespace: 'eip155' });
  const appKitProvider = useAppKitProvider('eip155');
  const walletProvider = appKitProvider?.walletProvider;

  const connect = useWalletStore((s) => s.connect);
  const disconnect = useWalletStore((s) => s.disconnect);
  const fetchBalances = useBalanceStore((s) => s.fetchBalances);
  const clearBalances = useBalanceStore((s) => s.clearBalances);

  const prevConnected = useRef(false);

  useEffect(() => {
    if (!appKitConnected || !address || !walletProvider) {
      appKitProviderRef.current = null;
      if (prevConnected.current) {
        prevConnected.current = false;
        disconnect();
        clearBalances();
      }
      return;
    }

    appKitProviderRef.current = walletProvider as import('@/wallet').EIP1193Provider;

    const sync = async () => {
      try {
        const { BrowserProvider } = await import('ethers');
        const browserProvider = new BrowserProvider(walletProvider as import('@/wallet').EIP1193Provider);
        const network = await browserProvider.getNetwork();
        const chainId = Number(network.chainId);

        await connect(address, chainId, 'walletconnect');
        fetchBalances(address, ['ethereum', 'bsc', 'polygon']).catch(() => {});
        prevConnected.current = true;
      } catch (err) {
        console.error('[AppKitBridge] Sync failed:', err);
      }
    };

    sync();
  }, [appKitConnected, address, walletProvider, connect, disconnect, fetchBalances, clearBalances]);

  return null;
}
