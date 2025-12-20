/**
 * Solana Wallet Hook
 *
 * PHASE 12: Connects to Phantom, Solflare, or other Solana wallets.
 * Uses the standard Solana wallet adapter interface exposed on window.
 *
 * SECURITY:
 * - All signing happens in the wallet
 * - Private keys never leave the wallet
 * - Same security model as EVM wallets
 */

import { useState, useCallback, useEffect } from 'react';
import { Connection, VersionedTransaction, PublicKey } from '@solana/web3.js';
import { SOLANA_CONFIG } from '@/config/chains';

/**
 * Phantom wallet interface (standard Solana wallet adapter)
 */
interface PhantomProvider {
  isPhantom?: boolean;
  publicKey?: PublicKey;
  isConnected?: boolean;
  signTransaction<T extends VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends VersionedTransaction>(txs: T[]): Promise<T[]>;
  signMessage(message: Uint8Array): Promise<{ signature: Uint8Array }>;
  connect(): Promise<{ publicKey: PublicKey }>;
  disconnect(): Promise<void>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
}

/**
 * Solflare wallet interface
 */
interface SolflareProvider {
  isSolflare?: boolean;
  publicKey?: PublicKey;
  isConnected?: boolean;
  signTransaction<T extends VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends VersionedTransaction>(txs: T[]): Promise<T[]>;
  signMessage(message: Uint8Array): Promise<{ signature: Uint8Array }>;
  connect(): Promise<{ publicKey: PublicKey }>;
  disconnect(): Promise<void>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
}

/**
 * Generic Solana wallet provider
 */
type SolanaProvider = PhantomProvider | SolflareProvider;

/**
 * Wallet state
 */
interface SolanaWalletState {
  isConnected: boolean;
  address: string | null;
  publicKey: PublicKey | null;
  walletName: 'phantom' | 'solflare' | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Detect available Solana wallet
 */
function getSolanaProvider(): { provider: SolanaProvider | null; name: 'phantom' | 'solflare' | null } {
  if (typeof window === 'undefined') {
    return { provider: null, name: null };
  }

  // Check for Phantom
  const phantom = (window as unknown as { solana?: PhantomProvider }).solana;
  if (phantom?.isPhantom) {
    return { provider: phantom, name: 'phantom' };
  }

  // Check for Solflare
  const solflare = (window as unknown as { solflare?: SolflareProvider }).solflare;
  if (solflare?.isSolflare) {
    return { provider: solflare, name: 'solflare' };
  }

  return { provider: null, name: null };
}

/**
 * Solana wallet hook
 *
 * Provides connection management and signing for Solana wallets.
 */
export function useSolanaWallet() {
  const [state, setState] = useState<SolanaWalletState>({
    isConnected: false,
    address: null,
    publicKey: null,
    walletName: null,
    isLoading: false,
    error: null,
  });

  const [connection] = useState(() => new Connection(SOLANA_CONFIG.rpcUrl, 'confirmed'));

  /**
   * Check if wallet is available
   */
  const isWalletAvailable = useCallback(() => {
    const { provider } = getSolanaProvider();
    return provider !== null;
  }, []);

  /**
   * Connect to wallet
   */
  const connect = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));

    try {
      const { provider, name } = getSolanaProvider();

      if (!provider) {
        throw new Error('No Solana wallet found. Please install Phantom or Solflare.');
      }

      console.log('[SolanaWallet] Connecting to', name);

      const { publicKey } = await provider.connect();

      console.log('[SolanaWallet] Connected:', publicKey.toBase58());

      setState({
        isConnected: true,
        address: publicKey.toBase58(),
        publicKey,
        walletName: name,
        isLoading: false,
        error: null,
      });

      return publicKey.toBase58();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect wallet';
      console.error('[SolanaWallet] Connection error:', error);

      setState((s) => ({
        ...s,
        isConnected: false,
        isLoading: false,
        error: message,
      }));

      throw error;
    }
  }, []);

  /**
   * Disconnect from wallet
   */
  const disconnect = useCallback(async () => {
    try {
      const { provider } = getSolanaProvider();
      if (provider) {
        await provider.disconnect();
      }

      console.log('[SolanaWallet] Disconnected');

      setState({
        isConnected: false,
        address: null,
        publicKey: null,
        walletName: null,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('[SolanaWallet] Disconnect error:', error);
    }
  }, []);

  /**
   * Sign a transaction (wallet handles signing)
   */
  const signTransaction = useCallback(
    async (transaction: VersionedTransaction): Promise<VersionedTransaction> => {
      const { provider } = getSolanaProvider();

      if (!provider || !state.isConnected) {
        throw new Error('Wallet not connected');
      }

      console.log('[SolanaWallet] Signing transaction...');

      const signedTx = await provider.signTransaction(transaction);

      console.log('[SolanaWallet] Transaction signed');

      return signedTx;
    },
    [state.isConnected]
  );

  /**
   * Sign and send a transaction
   */
  const signAndSendTransaction = useCallback(
    async (
      transaction: VersionedTransaction,
      options?: { skipPreflight?: boolean }
    ): Promise<string> => {
      const signedTx = await signTransaction(transaction);

      console.log('[SolanaWallet] Sending transaction...');

      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: options?.skipPreflight ?? false,
        preflightCommitment: 'confirmed',
      });

      console.log('[SolanaWallet] Transaction sent:', signature);

      return signature;
    },
    [signTransaction, connection]
  );

  /**
   * Wait for transaction confirmation
   */
  const confirmTransaction = useCallback(
    async (signature: string, lastValidBlockHeight?: number): Promise<boolean> => {
      console.log('[SolanaWallet] Waiting for confirmation:', signature);

      try {
        const result = await connection.confirmTransaction(
          {
            signature,
            blockhash: (await connection.getLatestBlockhash()).blockhash,
            lastValidBlockHeight: lastValidBlockHeight ?? (await connection.getBlockHeight()) + 150,
          },
          'confirmed'
        );

        if (result.value.err) {
          console.error('[SolanaWallet] Transaction failed:', result.value.err);
          return false;
        }

        console.log('[SolanaWallet] Transaction confirmed');
        return true;
      } catch (error) {
        console.error('[SolanaWallet] Confirmation error:', error);
        return false;
      }
    },
    [connection]
  );

  /**
   * Listen for wallet events
   */
  useEffect(() => {
    const { provider, name } = getSolanaProvider();
    if (!provider) return;

    const handleConnect = () => {
      if (provider.publicKey) {
        setState({
          isConnected: true,
          address: provider.publicKey.toBase58(),
          publicKey: provider.publicKey,
          walletName: name,
          isLoading: false,
          error: null,
        });
      }
    };

    const handleDisconnect = () => {
      setState({
        isConnected: false,
        address: null,
        publicKey: null,
        walletName: null,
        isLoading: false,
        error: null,
      });
    };

    const handleAccountChange = (...args: unknown[]) => {
      const publicKey = args[0] as PublicKey | null;
      if (publicKey) {
        setState((s) => ({
          ...s,
          address: publicKey.toBase58(),
          publicKey,
        }));
      } else {
        handleDisconnect();
      }
    };

    provider.on('connect', handleConnect);
    provider.on('disconnect', handleDisconnect);
    provider.on('accountChanged', handleAccountChange);

    // Check if already connected
    if (provider.isConnected && provider.publicKey) {
      handleConnect();
    }

    return () => {
      provider.off('connect', handleConnect);
      provider.off('disconnect', handleDisconnect);
      provider.off('accountChanged', handleAccountChange);
    };
  }, []);

  return {
    // State
    ...state,
    connection,

    // Actions
    connect,
    disconnect,
    signTransaction,
    signAndSendTransaction,
    confirmTransaction,

    // Helpers
    isWalletAvailable: isWalletAvailable(),
    isSolana: true as const,
  };
}

export default useSolanaWallet;
