/**
 * RPC Configuration for Wallet Scan (v3)
 *
 * Configurable RPC endpoints per chain with fallback support,
 * degraded mode timing, and block explorer URLs.
 */

import type { ScanChainName } from './types';

export interface RpcEndpoint {
  url: string;
  name: string;
  /** Timeout in ms for this RPC */
  timeout: number;
}

/** RPC endpoints per chain, ordered by priority */
const RPC_CONFIG: Record<ScanChainName, RpcEndpoint[]> = {
  ethereum: [
    { url: 'https://eth.llamarpc.com', name: 'LlamaRPC', timeout: 8000 },
    { url: 'https://rpc.ankr.com/eth', name: 'Ankr', timeout: 8000 },
    { url: 'https://ethereum-rpc.publicnode.com', name: 'PublicNode', timeout: 10000 },
  ],
  bsc: [
    { url: 'https://bsc-dataseed.binance.org', name: 'Binance', timeout: 8000 },
    { url: 'https://bsc-dataseed1.defibit.io', name: 'DeFiBit', timeout: 8000 },
    { url: 'https://rpc.ankr.com/bsc', name: 'Ankr', timeout: 10000 },
  ],
  polygon: [
    { url: 'https://polygon-rpc.com', name: 'PolygonRPC', timeout: 10000 },
    { url: 'https://rpc.ankr.com/polygon', name: 'Ankr', timeout: 10000 },
    { url: 'https://polygon-bor-rpc.publicnode.com', name: 'PublicNode', timeout: 12000 },
  ],
};

/** Seconds after which a non-responding chain is moved to degraded */
export const DEGRADED_AFTER_SEC = 15;

/** Get all RPC endpoints for a chain (primary first) */
export function getRpcEndpoints(chain: ScanChainName): RpcEndpoint[] {
  return RPC_CONFIG[chain] || [];
}

/** Get chain display name */
export function getChainDisplayName(chain: ScanChainName): string {
  switch (chain) {
    case 'ethereum': return 'Ethereum';
    case 'bsc': return 'BSC';
    case 'polygon': return 'Polygon';
  }
}

/** Get chain native token symbol */
export function getChainNativeSymbol(chain: ScanChainName): string {
  switch (chain) {
    case 'ethereum': return 'ETH';
    case 'bsc': return 'BNB';
    case 'polygon': return 'MATIC';
  }
}

/** All scannable chains */
export const ALL_SCAN_CHAINS: ScanChainName[] = ['ethereum', 'bsc', 'polygon'];

/** Block explorer base URLs for token/address pages */
const EXPLORER_BASE: Record<ScanChainName, string> = {
  ethereum: 'https://etherscan.io',
  bsc: 'https://bscscan.com',
  polygon: 'https://polygonscan.com',
};

/** Get block explorer URL for a token address */
export function getExplorerTokenUrl(chain: ScanChainName, address: string): string {
  return `${EXPLORER_BASE[chain]}/token/${address}`;
}

/** Get block explorer URL for a wallet address */
export function getExplorerAddressUrl(chain: ScanChainName, address: string): string {
  return `${EXPLORER_BASE[chain]}/address/${address}`;
}

/** Get DexScreener URL for a token */
export function getDexScreenerUrl(chain: ScanChainName, address: string): string {
  const chainSlug = chain === 'bsc' ? 'bsc' : chain;
  return `https://dexscreener.com/${chainSlug}/${address}`;
}
