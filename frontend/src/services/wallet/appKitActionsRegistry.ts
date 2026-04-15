/**
 * Reown AppKit modal actions (open / disconnect) registered by WalletBootstrap after lazy load.
 * useWallet stays free of @reown imports so the main bundle does not pull WalletConnect vendor code.
 */

type OpenArgs = { view: 'Connect'; namespace: 'eip155' };
type OpenFn = (args: OpenArgs) => void;
type DisconnectFn = (args?: { namespace: 'eip155' }) => Promise<void>;

let openAppKit: OpenFn | null = null;
let appKitDisconnect: DisconnectFn | null = null;

const waiters: (() => void)[] = [];

export function registerAppKitActions(open: OpenFn, disconnect: DisconnectFn) {
  openAppKit = open;
  appKitDisconnect = disconnect;
}

export function unregisterAppKitActions() {
  openAppKit = null;
  appKitDisconnect = null;
  // Wake any waiters (e.g. React StrictMode remount) so connect/disconnect does not hang until timeout.
  signalAppKitActionsReady();
}

export function getOpenAppKit() {
  return openAppKit;
}

export function getAppKitDisconnect() {
  return appKitDisconnect;
}

export function signalAppKitActionsReady() {
  while (waiters.length) {
    const resolve = waiters.shift();
    resolve?.();
  }
}

export function requestWalletBootstrap() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('swaperex:wallet-bootstrap'));
}

export function subscribeWalletBootstrapRequest(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb();
  window.addEventListener('swaperex:wallet-bootstrap', handler);
  return () => window.removeEventListener('swaperex:wallet-bootstrap', handler);
}

/**
 * Heuristic: WalletConnect / Reown persistence often uses localStorage keys containing these tokens.
 * False negatives are acceptable (user taps Connect to load the wallet chunk and restore).
 */
export function hasWalletConnectStorageHint(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || '';
      if (/walletconnect|wc@|@reown|w3m|wcm|appkit/i.test(k)) return true;
    }
  } catch {
    /* private mode / blocked storage */
  }
  return false;
}

export async function waitForAppKitActions(timeoutMs = 25_000): Promise<void> {
  if (openAppKit) return;
  requestWalletBootstrap();
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      const i = waiters.indexOf(done);
      if (i >= 0) waiters.splice(i, 1);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    waiters.push(done);
  });
}
