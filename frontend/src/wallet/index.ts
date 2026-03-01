/**
 * Wallet module public API
 */

export { CHAINS, SUPPORTED_CHAIN_IDS, CHAIN_BY_ID, getChain, isSupportedChain, RPC_MAP, DEFAULT_CHAIN_ID } from './chains';
export { connectInjected, connectWalletConnect, autoReconnect, disconnectAll, detectInjectedWallet, getWcProvider, getLastConnector } from './connectors';
export type { ConnectorId, WalletInfo, ChainConfig, EIP1193Provider, AddEthereumChainParameter } from './types';
