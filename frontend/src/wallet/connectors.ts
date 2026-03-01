/**
 * Wallet Connectors
 *
 * Provides connect/disconnect for:
 * 1. Injected wallets (MetaMask, Rabby, Brave, Coinbase ext, OKX, etc.)
 * 2. WalletConnect v2 (QR + deep link for mobile wallets, Ledger Live)
 *
 * Returns an EIP-1193 provider that ethers.js BrowserProvider can wrap.
 */

import EthereumProvider from '@walletconnect/ethereum-provider';
import type { EIP1193Provider, ConnectorId, WalletInfo } from './types';
import { SUPPORTED_CHAIN_IDS, RPC_MAP, DEFAULT_CHAIN_ID } from './chains';

const WC_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

// Persist last connector for auto-reconnect
const CONNECTOR_KEY = 'swaperex_last_connector';

export function saveLastConnector(id: ConnectorId): void {
  try { localStorage.setItem(CONNECTOR_KEY, id); } catch { /* noop */ }
}

export function getLastConnector(): ConnectorId | null {
  try { return localStorage.getItem(CONNECTOR_KEY) as ConnectorId | null; } catch { return null; }
}

export function clearLastConnector(): void {
  try { localStorage.removeItem(CONNECTOR_KEY); } catch { /* noop */ }
}

// ─── Injected Wallet Detection ───────────────────────────────

/** Detect which injected wallet is active */
export function detectInjectedWallet(): { available: boolean; label: string } {
  const eth = window.ethereum;
  if (!eth) return { available: false, label: 'Browser Wallet' };

  // Order matters: more specific checks first
  if (eth.isRabby) return { available: true, label: 'Rabby' };
  if (eth.isBraveWallet) return { available: true, label: 'Brave Wallet' };
  if (eth.isCoinbaseWallet) return { available: true, label: 'Coinbase Wallet' };
  if (eth.isOkxWallet) return { available: true, label: 'OKX Wallet' };
  if (eth.isMetaMask) return { available: true, label: 'MetaMask' };

  return { available: true, label: 'Browser Wallet' };
}

// ─── Injected Connector ──────────────────────────────────────

export async function connectInjected(): Promise<{
  provider: EIP1193Provider;
  info: WalletInfo;
}> {
  const eth = window.ethereum;
  if (!eth) {
    throw new Error('No browser wallet detected. Please install MetaMask or another wallet extension.');
  }

  const accounts = (await eth.request({
    method: 'eth_requestAccounts',
  })) as string[];

  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts returned. Please unlock your wallet.');
  }

  const chainIdHex = (await eth.request({ method: 'eth_chainId' })) as string;
  const chainId = parseInt(chainIdHex, 16);
  const { label } = detectInjectedWallet();

  saveLastConnector('injected');

  return {
    provider: eth,
    info: {
      connectorId: 'injected',
      label,
      address: accounts[0],
      chainId,
    },
  };
}

// ─── WalletConnect v2 Connector ──────────────────────────────

let wcProviderInstance: InstanceType<typeof EthereumProvider> | null = null;

export async function connectWalletConnect(): Promise<{
  provider: EIP1193Provider;
  info: WalletInfo;
}> {
  if (!WC_PROJECT_ID) {
    throw new Error(
      'WalletConnect Project ID not configured. Set VITE_WALLETCONNECT_PROJECT_ID in your .env file. ' +
      'Get one free at https://cloud.walletconnect.com',
    );
  }

  // Create fresh provider each time to ensure clean state
  if (wcProviderInstance) {
    try { await wcProviderInstance.disconnect(); } catch { /* noop */ }
    wcProviderInstance = null;
  }

  const provider = await EthereumProvider.init({
    projectId: WC_PROJECT_ID,
    chains: [DEFAULT_CHAIN_ID],
    optionalChains: SUPPORTED_CHAIN_IDS.filter((id) => id !== DEFAULT_CHAIN_ID),
    rpcMap: RPC_MAP,
    showQrModal: true,
    metadata: {
      name: 'Swaperex',
      description: 'Web3 Non-Custodial Swap Platform',
      url: window.location.origin,
      icons: [`${window.location.origin}/favicon.ico`],
    },
  });

  wcProviderInstance = provider;

  // This opens the QR modal and waits for user to scan/approve
  await provider.connect();

  const accounts = provider.accounts;
  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts returned from WalletConnect session.');
  }

  const chainId = provider.chainId;

  saveLastConnector('walletconnect');

  return {
    provider: provider as unknown as EIP1193Provider,
    info: {
      connectorId: 'walletconnect',
      label: 'WalletConnect',
      address: accounts[0],
      chainId,
    },
  };
}

/** Get existing WC provider (for event listeners / disconnect) */
export function getWcProvider(): InstanceType<typeof EthereumProvider> | null {
  return wcProviderInstance;
}

// ─── Auto-reconnect ──────────────────────────────────────────

/**
 * Attempt to restore the last session without prompting.
 * Returns null if no session can be restored.
 */
export async function autoReconnect(): Promise<{
  provider: EIP1193Provider;
  info: WalletInfo;
} | null> {
  const lastConnector = getLastConnector();

  if (lastConnector === 'injected') {
    const eth = window.ethereum;
    if (!eth) return null;

    try {
      // eth_accounts doesn't prompt — returns [] if not connected
      const accounts = (await eth.request({ method: 'eth_accounts' })) as string[];
      if (!accounts || accounts.length === 0) return null;

      const chainIdHex = (await eth.request({ method: 'eth_chainId' })) as string;
      const chainId = parseInt(chainIdHex, 16);
      const { label } = detectInjectedWallet();

      return {
        provider: eth,
        info: { connectorId: 'injected', label, address: accounts[0], chainId },
      };
    } catch {
      return null;
    }
  }

  if (lastConnector === 'walletconnect' && WC_PROJECT_ID) {
    try {
      const provider = await EthereumProvider.init({
        projectId: WC_PROJECT_ID,
        chains: [DEFAULT_CHAIN_ID],
        optionalChains: SUPPORTED_CHAIN_IDS.filter((id) => id !== DEFAULT_CHAIN_ID),
        rpcMap: RPC_MAP,
        showQrModal: false, // don't show modal on auto-reconnect
        metadata: {
          name: 'Swaperex',
          description: 'Web3 Non-Custodial Swap Platform',
          url: window.location.origin,
          icons: [`${window.location.origin}/favicon.ico`],
        },
      });

      // Check if session exists
      if (provider.session && provider.accounts.length > 0) {
        wcProviderInstance = provider;
        return {
          provider: provider as unknown as EIP1193Provider,
          info: {
            connectorId: 'walletconnect',
            label: 'WalletConnect',
            address: provider.accounts[0],
            chainId: provider.chainId,
          },
        };
      }
    } catch {
      // Session expired or invalid
      clearLastConnector();
    }
  }

  return null;
}

// ─── Disconnect ──────────────────────────────────────────────

export async function disconnectAll(): Promise<void> {
  clearLastConnector();

  if (wcProviderInstance) {
    try { await wcProviderInstance.disconnect(); } catch { /* noop */ }
    wcProviderInstance = null;
  }
}
