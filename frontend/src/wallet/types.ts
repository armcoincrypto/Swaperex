/**
 * Wallet module type definitions
 */

/** Connector identifiers */
export type ConnectorId = 'injected' | 'walletconnect' | 'coinbase' | 'readonly';

/** Wallet metadata returned after connection */
export interface WalletInfo {
  connectorId: ConnectorId;
  label: string;       // "MetaMask", "WalletConnect", "Rabby", etc.
  address: string;
  chainId: number;
}

/** EIP-3085 chain parameters for wallet_addEthereumChain */
export interface AddEthereumChainParameter {
  chainId: string;             // hex
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls: string[];
}

/** Chain configuration used across the app */
export interface ChainConfig {
  id: number;
  name: string;
  shortName: string;
  nativeSymbol: string;
  rpcUrl: string;
  explorer: string;
  logo: string;
  addChainParams: AddEthereumChainParameter;
}

/** EIP-1193 compatible provider */
export interface EIP1193Provider {
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isRabby?: boolean;
  isBraveWallet?: boolean;
  isOkxWallet?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
  disconnect?: () => Promise<void>;
}

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}
