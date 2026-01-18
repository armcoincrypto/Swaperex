/**
 * Wallet Module
 *
 * Token discovery and scanning for connected wallets.
 * Primary provider: Moralis (reliable, 40k free/month)
 * Fallback: 1inch, Covalent, then block explorer APIs
 */

export {
  scanWalletTokens,
  getSupportedChains,
  isChainSupported,
  type WalletToken,
  type WalletScanResult,
} from './scan.js';

export {
  isMoralisConfigured,
  getMoralisSupportedChains,
} from './moralis.js';

export {
  isOneInchAvailable,
  getOneInchSupportedChains,
} from './oneinch.js';

export {
  isCovalentConfigured,
  getCovalentSupportedChains,
} from './covalent.js';
