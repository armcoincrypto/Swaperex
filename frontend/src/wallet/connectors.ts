/**
 * Wallet Connectors
 *
 * Provides connect/disconnect for:
 * 1. Injected wallets (MetaMask, Rabby, Brave, Coinbase ext, OKX, etc.)
 * 2. WalletConnect session restore (auto-reconnect) via @walletconnect/ethereum-provider (UI connect is AppKit)
 *
 * Returns an EIP-1193 provider that ethers.js BrowserProvider can wrap.
 *
 * @walletconnect/ethereum-provider is loaded only when WC paths run (`import()`).
 * (With merged vendor-reown-walletconnect chunking, it may still ship in the same file;
 * this removes static coupling and preserves correct lazy invocation order.)
 */

import type { EIP1193Provider, ConnectorId, WalletInfo } from './types';
import { SUPPORTED_CHAIN_IDS, RPC_MAP, DEFAULT_CHAIN_ID } from './chains';
import { WALLETCONNECT_PROJECT_ID } from '@/utils/constants';

type WCEthereumProviderCtor = (typeof import('@walletconnect/ethereum-provider'))['default'];
type WcProviderInstance = InstanceType<WCEthereumProviderCtor>;

/** WalletConnect Cloud project ID. Required for QR/mobile wallets. Get one at https://cloud.walletconnect.com */
const WC_PROJECT_ID = WALLETCONNECT_PROJECT_ID;
const WC_PROJECT_ID_IS_PLACEHOLDER =
  !WC_PROJECT_ID ||
  WC_PROJECT_ID === 'PASTE_YOUR_PROJECT_ID_HERE' ||
  WC_PROJECT_ID === 'your_project_id_here';

// Persist last connector for auto-reconnect
const CONNECTOR_KEY = 'swaperex_last_connector';

let wcProviderCtorCache: WCEthereumProviderCtor | null = null;
let wcProviderCtorLoadPromise: Promise<WCEthereumProviderCtor> | null = null;

/** Singleton loader — one in-flight import; retries after failure. */
async function getWcEthereumProviderCtor(): Promise<WCEthereumProviderCtor> {
  if (wcProviderCtorCache) return wcProviderCtorCache;
  if (!wcProviderCtorLoadPromise) {
    wcProviderCtorLoadPromise = import('@walletconnect/ethereum-provider')
      .then((mod) => {
        wcProviderCtorCache = mod.default;
        return wcProviderCtorCache;
      })
      .catch((err) => {
        wcProviderCtorLoadPromise = null;
        throw err;
      });
  }
  return wcProviderCtorLoadPromise;
}

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
  const eth = window.ethereum as EIP1193Provider | undefined;
  if (!eth || typeof eth.request !== 'function') {
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

// ─── WalletConnect (@walletconnect/ethereum-provider) session handle ───

let wcProviderInstance: WcProviderInstance | null = null;

/** Get existing WC provider (for event listeners / disconnect) */
export function getWcProvider(): WcProviderInstance | null {
  return wcProviderInstance;
}

/**
 * Privacy-safe observability for the legacy `walletconnect` autoReconnect branch only.
 * Logs no addresses, chain IDs, or counts. Enable in production builds with
 * `VITE_LEGACY_WC_AUTORECONNECT_OBSERVABILITY=true` (otherwise DEV-only).
 */
const LEGACY_WC_AUTORECONNECT_LOG =
  import.meta.env.DEV ||
  import.meta.env.VITE_LEGACY_WC_AUTORECONNECT_OBSERVABILITY === 'true';

function logLegacyWcAutoReconnect(
  phase: 'entered' | 'success' | 'no_restorable_session' | 'failed',
): void {
  if (!LEGACY_WC_AUTORECONNECT_LOG) return;
  console.info('[Swaperex][legacy WC autoReconnect]', phase);
}

// ─── Auto-reconnect ──────────────────────────────────────────

/**
 * Attempt to restore the last session without prompting.
 * Returns null if no session can be restored.
 *
 * Reconnect semantics (read before deleting or “simplifying”):
 * - `swaperex_last_connector` is written only as `injected` by `connectInjected()` in the current app.
 *   The value `walletconnect` is not written anywhere in current code; it may still exist from stale
 *   storage or older builds.
 * - Live WalletConnect (QR/modal) session restore is handled by Reown AppKit persistence and
 *   `AppKitBridge`, not by this function’s WC branch.
 * - The `lastConnector === 'walletconnect'` branch below uses `@walletconnect/ethereum-provider`
 *   for legacy/stale-key sessions and populates `wcProviderInstance` when successful. Do not remove
 *   without migration or telemetry planning.
 */
export async function autoReconnect(): Promise<{
  provider: EIP1193Provider;
  info: WalletInfo;
} | null> {
  const lastConnector = getLastConnector();

  if (lastConnector === 'injected') {
    const eth = window.ethereum as EIP1193Provider | undefined;
    if (!eth || typeof eth.request !== 'function') return null;

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

  if (lastConnector === 'walletconnect' && !WC_PROJECT_ID_IS_PLACEHOLDER) {
    logLegacyWcAutoReconnect('entered');
    try {
      const EthereumProvider = await getWcEthereumProviderCtor();
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
        logLegacyWcAutoReconnect('success');
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
      logLegacyWcAutoReconnect('no_restorable_session');
    } catch {
      // Session expired or invalid
      logLegacyWcAutoReconnect('failed');
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
