/**
 * Wallet Module
 *
 * Token discovery and scanning for connected wallets.
 * Primary provider: Covalent (if configured)
 * Fallback: Block explorer APIs
 */

export {
  scanWalletTokens,
  getSupportedChains,
  isChainSupported,
  type WalletToken,
  type WalletScanResult,
} from './scan.js';

export {
  isCovalentConfigured,
  getCovalentSupportedChains,
} from './covalent.js';
