/**
 * Token List Module
 *
 * Provides typed access to token lists per chain.
 * Supports multi-chain for 1inch aggregator.
 *
 * Chains: Ethereum, BSC, Polygon, Arbitrum, Optimism, Base
 */

import ethereumTokens from './ethereum.json';
import bscTokens from './bsc.json';
import polygonTokens from './polygon.json';
import arbitrumTokens from './arbitrum.json';
import optimismTokens from './optimism.json';
import avalancheTokens from './avalanche.json';

/**
 * Token interface matching Uniswap token list standard
 */
export interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoURI?: string;
  chainId?: number;
}

/**
 * Token list interface
 */
export interface TokenList {
  name: string;
  chainId: number;
  tokens: Token[];
}

/**
 * Chain-specific token lists
 */
export const ETHEREUM_TOKENS: TokenList = ethereumTokens as TokenList;
export const BSC_TOKENS: TokenList = bscTokens as TokenList;
export const POLYGON_TOKENS: TokenList = polygonTokens as TokenList;
export const ARBITRUM_TOKENS: TokenList = arbitrumTokens as TokenList;
export const OPTIMISM_TOKENS: TokenList = optimismTokens as TokenList;
export const AVALANCHE_TOKENS: TokenList = avalancheTokens as TokenList;

/**
 * All token lists by chain ID
 */
export const TOKEN_LISTS: Record<number, TokenList> = {
  1: ETHEREUM_TOKENS,
  56: BSC_TOKENS,
  137: POLYGON_TOKENS,
  42161: ARBITRUM_TOKENS,
  10: OPTIMISM_TOKENS,
  43114: AVALANCHE_TOKENS,
};

/**
 * Native token placeholder address (used by 1inch, Uniswap, etc.)
 */
export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
export const NATIVE_ETH_ADDRESS = NATIVE_TOKEN_ADDRESS; // Alias for compatibility

/**
 * Wrapped native token addresses by chain
 */
export const WRAPPED_NATIVE_ADDRESSES: Record<number, string> = {
  1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',      // WETH
  56: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',     // WBNB
  137: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',    // WMATIC
  42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',  // WETH (Arbitrum)
  10: '0x4200000000000000000000000000000000000006',     // WETH (Optimism)
  8453: '0x4200000000000000000000000000000000000006',   // WETH (Base)
};

/**
 * WETH address on Ethereum mainnet (for compatibility)
 */
export const WETH_ADDRESS = WRAPPED_NATIVE_ADDRESSES[1];

/**
 * Native token symbols by chain
 */
export const NATIVE_SYMBOLS: Record<number, string> = {
  1: 'ETH',
  56: 'BNB',
  137: 'MATIC',
  42161: 'ETH',
  10: 'ETH',
  8453: 'ETH',
  43114: 'AVAX',
};

/**
 * Get token by symbol (checks static list, then custom tokens)
 */
export function getTokenBySymbol(symbol: string, chainId: number = 1): Token | undefined {
  const list = getTokenList(chainId);
  const staticToken = list?.tokens.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase());
  if (staticToken) return staticToken;

  // Check custom tokens (if store is loaded)
  try {
    const stored = localStorage.getItem('swaperex-custom-tokens');
    if (stored) {
      const parsed = JSON.parse(stored);
      const customTokens = parsed?.state?.tokens?.[chainId] || [];
      return customTokens.find((t: Token) => t.symbol.toUpperCase() === symbol.toUpperCase());
    }
  } catch {
    // Ignore parse errors
  }
  return undefined;
}

/**
 * Get token by address (checks static list, then custom tokens)
 */
export function getTokenByAddress(address: string, chainId: number = 1): Token | undefined {
  const list = getTokenList(chainId);
  const staticToken = list?.tokens.find((t) => t.address.toLowerCase() === address.toLowerCase());
  if (staticToken) return staticToken;

  // Check custom tokens (if store is loaded)
  try {
    const stored = localStorage.getItem('swaperex-custom-tokens');
    if (stored) {
      const parsed = JSON.parse(stored);
      const customTokens = parsed?.state?.tokens?.[chainId] || [];
      return customTokens.find((t: Token) => t.address.toLowerCase() === address.toLowerCase());
    }
  } catch {
    // Ignore parse errors
  }
  return undefined;
}

/**
 * Get token list for chain
 */
export function getTokenList(chainId: number): TokenList | undefined {
  return TOKEN_LISTS[chainId];
}

/**
 * Get all tokens for a chain
 */
export function getTokens(chainId: number = 1): Token[] {
  return getTokenList(chainId)?.tokens ?? [];
}

/**
 * Check if address is native token
 */
export function isNativeToken(address: string): boolean {
  return address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
}

/**
 * Get wrapped native token address for chain
 */
export function getWrappedNativeAddress(chainId: number): string {
  return WRAPPED_NATIVE_ADDRESSES[chainId] || WRAPPED_NATIVE_ADDRESSES[1];
}

/**
 * Get token address for swap (converts native to wrapped for Uniswap)
 */
export function getSwapAddress(token: Token, chainId: number = 1): string {
  if (isNativeToken(token.address)) {
    return getWrappedNativeAddress(chainId);
  }
  return token.address;
}

/**
 * Get native token symbol for chain
 */
export function getNativeSymbol(chainId: number): string {
  return NATIVE_SYMBOLS[chainId] || 'ETH';
}

/**
 * Check if chain is supported
 */
export function isChainSupported(chainId: number): boolean {
  return chainId in TOKEN_LISTS;
}

/**
 * Get supported chain IDs
 */
export function getSupportedChainIds(): number[] {
  return Object.keys(TOKEN_LISTS).map(Number);
}

/**
 * Minimal placeholder token (never throws)
 */
const PLACEHOLDER_TOKEN: Token = {
  symbol: 'ETH',
  name: 'Native Token',
  address: NATIVE_TOKEN_ADDRESS,
  decimals: 18,
};

/**
 * Safe default FROM token for a chain.
 * Prefer: native token → first in list → placeholder. Never throws.
 */
export function getDefaultFromToken(chainId: number = 1): Token {
  const native = getTokenBySymbol(getNativeSymbol(chainId), chainId) ||
    getTokenBySymbol('ETH', chainId) || getTokenBySymbol('WETH', chainId);
  if (native) return native;

  const tokens = getTokens(chainId);
  const first = tokens[0];
  if (first) return first;

  return { ...PLACEHOLDER_TOKEN, symbol: getNativeSymbol(chainId) };
}

/**
 * Safe default TO token for a chain.
 * Prefer: stablecoin (USDT/USDC/DAI) → second token → first token. Never throws.
 */
export function getDefaultToToken(chainId: number = 1): Token {
  const stable = getTokenBySymbol('USDT', chainId) ||
    getTokenBySymbol('USDC', chainId) || getTokenBySymbol('DAI', chainId);
  if (stable) return stable;

  const tokens = getTokens(chainId);
  if (tokens.length > 1) return tokens[1];
  if (tokens[0]) return tokens[0];

  return { ...PLACEHOLDER_TOKEN, symbol: 'USDC', name: 'USD Coin' };
}

/** @deprecated Use getDefaultFromToken(chainId) - safe per-chain default */
export const DEFAULT_FROM_TOKEN = getDefaultFromToken(1);

/** @deprecated Use getDefaultToToken(chainId) - safe per-chain default */
export const DEFAULT_TO_TOKEN = getDefaultToToken(1);

/**
 * Stablecoins for quick selection (Ethereum)
 */
export const STABLECOINS = [
  getTokenBySymbol('USDT'),
  getTokenBySymbol('USDC'),
  getTokenBySymbol('DAI'),
].filter((t): t is Token => !!t);

/**
 * Popular tokens for quick selection (Ethereum)
 */
export const POPULAR_TOKENS = [
  getTokenBySymbol('ETH'),
  getTokenBySymbol('WBTC'),
  getTokenBySymbol('USDT'),
  getTokenBySymbol('USDC'),
  getTokenBySymbol('DAI'),
  getTokenBySymbol('UNI'),
  getTokenBySymbol('AAVE'),
  getTokenBySymbol('LINK'),
].filter((t): t is Token => !!t);

/**
 * Get popular tokens for a specific chain
 */
export function getPopularTokens(chainId: number): Token[] {
  const tokens = getTokens(chainId);
  // Return first 8 tokens as popular (native + major stables + popular)
  return tokens.slice(0, 8);
}

/**
 * Get all tokens for a chain (static + custom)
 * Custom tokens are included at the end of the list
 */
export function getAllTokens(chainId: number): Token[] {
  // Import dynamically to avoid circular dependency
  // Note: Custom tokens should be fetched from the store in components
  return getTokens(chainId);
}

/**
 * Check if a token address is already in the static list
 */
export function isStaticToken(address: string, chainId: number): boolean {
  const list = getTokenList(chainId);
  return list?.tokens.some(t => t.address.toLowerCase() === address.toLowerCase()) ?? false;
}

export default ETHEREUM_TOKENS;
