/**
 * Token List Module
 *
 * Provides typed access to token lists per chain.
 * Token data extracted from Telegram bot (oneinch.py).
 */

import ethereumTokens from './ethereum.json';

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
 * Ethereum token list
 */
export const ETHEREUM_TOKENS: TokenList = ethereumTokens as TokenList;

/**
 * Native ETH placeholder address (used by 1inch, Uniswap, etc.)
 */
export const NATIVE_ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

/**
 * WETH address on Ethereum mainnet
 */
export const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

/**
 * Get token by symbol
 */
export function getTokenBySymbol(symbol: string, chainId: number = 1): Token | undefined {
  const list = getTokenList(chainId);
  return list?.tokens.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase());
}

/**
 * Get token by address
 */
export function getTokenByAddress(address: string, chainId: number = 1): Token | undefined {
  const list = getTokenList(chainId);
  return list?.tokens.find((t) => t.address.toLowerCase() === address.toLowerCase());
}

/**
 * Get token list for chain
 */
export function getTokenList(chainId: number): TokenList | undefined {
  switch (chainId) {
    case 1:
      return ETHEREUM_TOKENS;
    default:
      return undefined;
  }
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
  return address.toLowerCase() === NATIVE_ETH_ADDRESS.toLowerCase();
}

/**
 * Get token address for swap (converts ETH to WETH for Uniswap)
 */
export function getSwapAddress(token: Token): string {
  if (isNativeToken(token.address)) {
    return WETH_ADDRESS;
  }
  return token.address;
}

/**
 * Default tokens for swap UI
 */
export const DEFAULT_FROM_TOKEN = getTokenBySymbol('ETH')!;
export const DEFAULT_TO_TOKEN = getTokenBySymbol('USDC')!;

/**
 * Stablecoins for quick selection
 */
export const STABLECOINS = [
  getTokenBySymbol('USDT')!,
  getTokenBySymbol('USDC')!,
  getTokenBySymbol('DAI')!,
].filter(Boolean);

/**
 * Popular tokens for quick selection
 */
export const POPULAR_TOKENS = [
  getTokenBySymbol('ETH')!,
  getTokenBySymbol('WBTC')!,
  getTokenBySymbol('USDT')!,
  getTokenBySymbol('USDC')!,
  getTokenBySymbol('DAI')!,
  getTokenBySymbol('UNI')!,
  getTokenBySymbol('AAVE')!,
  getTokenBySymbol('LINK')!,
].filter(Boolean);

export default ETHEREUM_TOKENS;
