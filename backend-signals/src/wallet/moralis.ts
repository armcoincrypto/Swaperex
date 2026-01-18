/**
 * Moralis Provider for Wallet Token Scanning
 *
 * Reliable provider with generous free tier (40k requests/month).
 * Requires MORALIS_API_KEY environment variable.
 */

import { WalletToken, WalletScanResult } from './scan.js';

// Moralis chain names
const MORALIS_CHAINS: Record<number, string> = {
  1: '0x1',      // Ethereum
  56: '0x38',    // BSC
  137: '0x89',   // Polygon
  42161: '0xa4b1', // Arbitrum
  8453: '0x2105', // Base
};

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  56: 'BNB Chain',
  137: 'Polygon',
  42161: 'Arbitrum',
  8453: 'Base',
};

const NATIVE_SYMBOLS: Record<number, string> = {
  1: 'ETH',
  56: 'BNB',
  137: 'MATIC',
  42161: 'ETH',
  8453: 'ETH',
};

// Known spam/scam token patterns
const SPAM_PATTERNS = [
  /airdrop/i,
  /claim/i,
  /\.com$/i,
  /\.org$/i,
  /\.io$/i,
  /visit/i,
  /free/i,
  /reward/i,
];

interface MoralisToken {
  token_address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  usd_price: number | null;
  usd_value: number | null;
  logo?: string;
  possible_spam?: boolean;
}

interface MoralisNativeBalance {
  balance: string;
  usd_price?: number;
}

export interface MoralisResult {
  success: boolean;
  result?: WalletScanResult;
  error?: string;
  warning?: string;
}

/**
 * Check if token name/symbol looks like spam
 */
function isSpamToken(name: string, symbol: string): boolean {
  const combined = `${name} ${symbol}`;
  return SPAM_PATTERNS.some(pattern => pattern.test(combined));
}

/**
 * Format balance with decimals
 */
function formatBalance(balance: string, decimals: number): string {
  if (!balance || balance === '0') return '0';

  try {
    const balanceBigInt = BigInt(balance);
    const divisor = BigInt(10 ** decimals);
    const integerPart = balanceBigInt / divisor;
    const fractionalPart = balanceBigInt % divisor;

    if (fractionalPart === 0n) {
      return integerPart.toString();
    }

    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    const trimmedFractional = fractionalStr.slice(0, 6).replace(/0+$/, '');

    if (!trimmedFractional) {
      return integerPart.toString();
    }

    return `${integerPart}.${trimmedFractional}`;
  } catch {
    return '0';
  }
}

/**
 * Shorten wallet address for logging (privacy)
 */
function shortWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Scan wallet using Moralis API
 */
export async function scanWithMoralis(
  address: string,
  chainId: number,
  minUsdValue: number = 0.01
): Promise<MoralisResult> {
  const startTime = Date.now();

  // Check if API key is configured
  const apiKey = process.env.MORALIS_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: 'provider_not_configured',
      warning: 'Moralis API key not configured',
    };
  }

  // Check chain support
  const moralisChain = MORALIS_CHAINS[chainId];
  if (!moralisChain) {
    return {
      success: false,
      error: 'unsupported_chain',
      warning: `Chain ${chainId} not supported by Moralis`,
    };
  }

  const chainName = CHAIN_NAMES[chainId] || `Chain ${chainId}`;
  const nativeSymbol = NATIVE_SYMBOLS[chainId] || 'ETH';

  try {
    // 1. Get ERC20 token balances with prices
    const tokenUrl = `https://deep-index.moralis.io/api/v2.2/${address}/erc20?chain=${moralisChain}`;

    console.log(`[Moralis] Fetching tokens for wallet=${shortWallet(address)} chain=${chainId} keyLen=${apiKey.length}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let tokenResponse: Response;
    try {
      tokenResponse = await fetch(tokenUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'X-API-Key': apiKey,
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }

    console.log(`[Moralis] Response status=${tokenResponse.status} for wallet=${shortWallet(address)}`);

    // Handle API errors
    if (tokenResponse.status === 401) {
      return {
        success: false,
        error: 'provider_denied',
        warning: 'Moralis API key invalid',
      };
    }

    if (tokenResponse.status === 400) {
      const errorBody = await tokenResponse.text();
      console.error(`[Moralis] Bad request: ${errorBody}`);

      // Check for 10k token limit (wallet has too much spam)
      if (errorBody.includes('over 10000 tokens')) {
        return {
          success: false,
          error: 'wallet_too_large',
          warning: 'Wallet has over 10,000 tokens (likely spam). Using fallback.',
        };
      }

      return {
        success: false,
        error: 'provider_error',
        warning: `Moralis bad request: ${errorBody.slice(0, 100)}`,
      };
    }

    if (tokenResponse.status === 429) {
      return {
        success: false,
        error: 'rate_limited',
        warning: 'Moralis rate limit exceeded',
      };
    }

    if (!tokenResponse.ok) {
      return {
        success: false,
        error: 'provider_error',
        warning: `Moralis API returned ${tokenResponse.status}`,
      };
    }

    const tokenData: MoralisToken[] = await tokenResponse.json();

    // 2. Get native balance
    const nativeUrl = `https://deep-index.moralis.io/api/v2.2/${address}/balance?chain=${moralisChain}`;
    let nativeData: MoralisNativeBalance = { balance: '0' };

    try {
      const nativeResponse = await fetch(nativeUrl, {
        headers: {
          'Accept': 'application/json',
          'X-API-Key': apiKey,
        },
      });
      if (nativeResponse.ok) {
        nativeData = await nativeResponse.json();
      }
    } catch {
      // Ignore native balance errors
    }

    // Process tokens
    const tokens: WalletToken[] = [];
    let spamFiltered = 0;
    let belowMinCount = 0;
    let tokensPriced = 0;
    let tokensMissingPrice = 0;

    for (const item of tokenData) {
      // Skip if marked as spam by Moralis
      if (item.possible_spam) {
        spamFiltered++;
        continue;
      }

      // Skip if matches our spam patterns
      if (isSpamToken(item.name || '', item.symbol || '')) {
        spamFiltered++;
        continue;
      }

      // Skip zero balance
      if (!item.balance || item.balance === '0') continue;

      const balanceFormatted = formatBalance(item.balance, item.decimals || 18);
      const usdPrice = item.usd_price || null;
      const usdValue = item.usd_value || (usdPrice ? parseFloat(balanceFormatted) * usdPrice : null);

      // Track pricing stats
      if (usdPrice !== null) {
        tokensPriced++;
      } else {
        tokensMissingPrice++;
      }

      // Filter by min USD value
      if (usdValue !== null && usdValue < minUsdValue) {
        belowMinCount++;
        continue;
      }

      // Include tokens without price if they have balance
      if (usdValue === null && parseFloat(balanceFormatted) <= 0) {
        continue;
      }

      tokens.push({
        address: item.token_address?.toLowerCase() || '',
        symbol: item.symbol || 'UNKNOWN',
        name: item.name || 'Unknown Token',
        decimals: item.decimals || 18,
        balance: item.balance,
        balanceFormatted,
        usdValue,
        usdPrice,
        logoUrl: item.logo,
      });
    }

    // Sort by USD value (highest first)
    tokens.sort((a, b) => {
      if (a.usdValue !== null && b.usdValue !== null) {
        return b.usdValue - a.usdValue;
      }
      if (a.usdValue !== null) return -1;
      if (b.usdValue !== null) return 1;
      return parseFloat(b.balanceFormatted) - parseFloat(a.balanceFormatted);
    });

    // Build warnings
    const warnings: string[] = [];
    if (spamFiltered > 0) {
      warnings.push(`${spamFiltered} spam token${spamFiltered > 1 ? 's' : ''} filtered`);
    }
    if (tokensMissingPrice > 0) {
      warnings.push(`Price unavailable for ${tokensMissingPrice} token${tokensMissingPrice > 1 ? 's' : ''}`);
    }

    // Build native balance
    const nativeBalanceFormatted = formatBalance(nativeData.balance, 18);
    const nativeBalance: WalletToken = {
      address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      symbol: nativeSymbol,
      name: nativeSymbol,
      decimals: 18,
      balance: nativeData.balance,
      balanceFormatted: nativeBalanceFormatted,
      usdValue: nativeData.usd_price ? parseFloat(nativeBalanceFormatted) * nativeData.usd_price : null,
      usdPrice: nativeData.usd_price || null,
    };

    const durationMs = Date.now() - startTime;

    // Log success
    console.log(
      `[WalletScan] COMPLETE chain=${chainId} wallet=${shortWallet(address)} ` +
      `provider=moralis raw=${tokenData.length} spam=${spamFiltered} belowMin=${belowMinCount} ` +
      `final=${tokens.length} priced=${tokensPriced} missingPrice=${tokensMissingPrice} ms=${durationMs}`
    );

    const result: WalletScanResult = {
      address: address.toLowerCase(),
      chainId,
      chainName,
      tokens,
      nativeBalance,
      stats: {
        totalTokens: tokenData.length,
        tokensWithValue: tokens.length,
        filteredSpam: spamFiltered,
        scanDurationMs: durationMs,
        providerTransfers: tokenData.length,
        tokensDiscovered: tokenData.length,
        tokensWithBalance: tokenData.filter(t => t.balance !== '0').length,
        tokensPriced,
        tokensMissingPrice,
      },
      provider: 'moralis' as any,
      warnings,
      cached: false,
    };

    return { success: true, result };

  } catch (error: any) {
    const durationMs = Date.now() - startTime;

    if (error.name === 'AbortError') {
      console.warn(`[WalletScan] TIMEOUT chain=${chainId} wallet=${shortWallet(address)} provider=moralis ms=${durationMs}`);
      return {
        success: false,
        error: 'provider_timeout',
        warning: 'Moralis API request timed out',
      };
    }

    console.error(`[WalletScan] ERROR chain=${chainId} wallet=${shortWallet(address)} provider=moralis error=${error.message} ms=${durationMs}`);
    return {
      success: false,
      error: 'provider_error',
      warning: `Moralis API error: ${error.message}`,
    };
  }
}

/**
 * Check if Moralis is configured
 */
export function isMoralisConfigured(): boolean {
  return !!process.env.MORALIS_API_KEY;
}

/**
 * Get Moralis supported chains
 */
export function getMoralisSupportedChains(): number[] {
  return Object.keys(MORALIS_CHAINS).map(Number);
}
