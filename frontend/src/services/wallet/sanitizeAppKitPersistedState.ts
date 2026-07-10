/**
 * Clears AppKit localStorage entries that reference injected/external connectors
 * when this deployment uses WalletConnect-only (enableInjected: false).
 *
 * Stale injected connector IDs can leave AppKit in a broken router state and trigger
 * vendor errors such as "w3m-connecting-view: No connector provided" on modal back.
 */

const EIP155_NAMESPACE = 'eip155';
const CONNECTED_CONNECTOR_KEY = `@appkit/${EIP155_NAMESPACE}:connected_connector_id`;
const ALLOWED_CONNECTOR_IDS = new Set(['walletConnect', 'AUTH']);
const SWAPEREX_LAST_CONNECTOR_KEY = 'swaperex_last_connector';

export function sanitizeAppKitPersistedState(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }

  try {
    const connectedId = localStorage.getItem(CONNECTED_CONNECTOR_KEY);
    if (connectedId && !ALLOWED_CONNECTOR_IDS.has(connectedId)) {
      localStorage.removeItem(CONNECTED_CONNECTOR_KEY);
    }
  } catch {
    /* private mode / blocked storage */
  }

  try {
    const last = localStorage.getItem(SWAPEREX_LAST_CONNECTOR_KEY);
    if (last === 'injected') {
      localStorage.removeItem(SWAPEREX_LAST_CONNECTOR_KEY);
    }
  } catch {
    /* noop */
  }
}
