/**
 * Central chain configuration
 *
 * Single source of truth for all supported EVM chains.
 * Used by connectors, NetworkSelector, and chain validation.
 */

import type { ChainConfig } from './types';

function hexChainId(id: number): string {
  return `0x${id.toString(16)}`;
}

function makeChain(
  id: number,
  name: string,
  shortName: string,
  nativeSymbol: string,
  rpcUrl: string,
  explorer: string,
  logo: string,
): ChainConfig {
  return {
    id,
    name,
    shortName,
    nativeSymbol,
    rpcUrl,
    explorer,
    logo,
    addChainParams: {
      chainId: hexChainId(id),
      chainName: name,
      nativeCurrency: { name: nativeSymbol, symbol: nativeSymbol, decimals: 18 },
      rpcUrls: [rpcUrl],
      blockExplorerUrls: [explorer],
    },
  };
}

/** All supported chains */
export const CHAINS: ChainConfig[] = [
  makeChain(1,     'Ethereum',  'ETH',  'ETH',  'https://eth.llamarpc.com',              'https://etherscan.io',                '/assets/chains/ethereum.svg'),
  makeChain(56,    'BNB Chain', 'BSC',  'BNB',  'https://bsc-dataseed.binance.org/',     'https://bscscan.com',                 '/assets/chains/bnb.svg'),
  makeChain(137,   'Polygon',   'MATIC','MATIC','https://polygon-rpc.com/',               'https://polygonscan.com',             '/assets/chains/polygon.svg'),
  makeChain(42161, 'Arbitrum',  'ARB',  'ETH',  'https://arb1.arbitrum.io/rpc',          'https://arbiscan.io',                 '/assets/chains/arbitrum.svg'),
  makeChain(10,    'Optimism',  'OP',   'ETH',  'https://mainnet.optimism.io',           'https://optimistic.etherscan.io',     '/assets/chains/optimism.svg'),
  makeChain(43114, 'Avalanche', 'AVAX', 'AVAX', 'https://api.avax.network/ext/bc/C/rpc', 'https://snowtrace.io',                '/assets/chains/avalanche.svg'),
];

/** Chain IDs as a number array (for store/validation) */
export const SUPPORTED_CHAIN_IDS: number[] = CHAINS.map((c) => c.id);

/** Lookup by chain ID */
export const CHAIN_BY_ID: Record<number, ChainConfig> = Object.fromEntries(
  CHAINS.map((c) => [c.id, c]),
);

/** Get chain config or undefined */
export function getChain(chainId: number): ChainConfig | undefined {
  return CHAIN_BY_ID[chainId];
}

/** Check if a chain ID is supported */
export function isSupportedChain(chainId: number): boolean {
  return chainId in CHAIN_BY_ID;
}

/** RPC URLs keyed by chain ID — used by WalletConnect provider */
export const RPC_MAP: Record<number, string> = Object.fromEntries(
  CHAINS.map((c) => [c.id, c.rpcUrl]),
);

/** Default chain */
export const DEFAULT_CHAIN_ID = Number(
  import.meta.env.VITE_DEFAULT_CHAIN_ID || 1,
);
