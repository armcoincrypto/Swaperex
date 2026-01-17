/**
 * Wallet Module
 *
 * Token discovery and scanning for connected wallets.
 * Primary provider: 1inch (free, no key needed)
 * Fallback: Covalent (if configured), then block explorer APIs
 */

export {
  scanWalletTokens,
  getSupportedChains,
  isChainSupported,
  type WalletToken,
  type WalletScanResult,
} from './scan.js';

export {
  isOneInchAvailable,
  getOneInchSupportedChains,
} from './oneinch.js';

export {
  isCovalentConfigured,
  getCovalentSupportedChains,
} from './covalent.js';
