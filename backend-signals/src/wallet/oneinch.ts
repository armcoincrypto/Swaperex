/**
 * 1inch Provider for Wallet Token Scanning
 *
 * Free provider - no API key required.
 * Uses multiple endpoints for redundancy.
 */

import { WalletToken, WalletScanResult } from './scan.js';

// 1inch chain ID mapping
const ONEINCH_CHAIN_IDS: Record<number, number> = {
  1: 1,        // Ethereum
  56: 56,      // BSC
  137: 137,    // Polygon
  42161: 42161, // Arbitrum
  8453: 8453,  // Base
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

// Native token address used by 1inch
const NATIVE_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

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

// 1inch API endpoints (multiple for fallback)
const BALANCE_ENDPOINTS = [
  'https://balances.1inch.io/v1.2',
  'https://balance.1inch.io/v1.2', // Alternative
];

const PRICE_ENDPOINTS = [
  'https://token-prices.1inch.io/v1.1',
  'https://prices.1inch.io/v1.1', // Alternative
];

interface OneInchBalanceResponse {
  [tokenAddress: string]: string; // address -> balance in wei
}

interface OneInchPriceResponse {
  [tokenAddress: string]: string; // address -> price in USD (string)
}

interface OneInchTokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

export interface OneInchResult {
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
 * Fetch with timeout and retry across endpoints
 */
async function fetchWithFallback(
  endpoints: string[],
  path: string,
  timeout = 10000
): Promise<Response | null> {
  for (const baseUrl of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${baseUrl}${path}`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return response;
      }

      // If rate limited, try next endpoint
      if (response.status === 429) {
        console.warn(`[1inch] Rate limited on ${baseUrl}, trying next...`);
        continue;
      }

      // Other errors, still try next
      console.warn(`[1inch] Error ${response.status} on ${baseUrl}`);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.warn(`[1inch] Timeout on ${baseUrl}, trying next...`);
      } else {
        console.warn(`[1inch] Fetch error on ${baseUrl}:`, error.message);
      }
    }
  }

  return null;
}

/**
 * Get token metadata from 1inch
 */
async function getTokenInfo(chainId: number): Promise<Map<string, OneInchTokenInfo>> {
  const tokens = new Map<string, OneInchTokenInfo>();

  try {
    const response = await fetchWithFallback(
      ['https://tokens.1inch.io/v1.2'],
      `/${chainId}`,
      8000
    );

    if (!response) return tokens;

    const data = await response.json();

    for (const [address, info] of Object.entries(data as Record<string, OneInchTokenInfo>)) {
      tokens.set(address.toLowerCase(), info as OneInchTokenInfo);
    }
  } catch (error) {
    console.warn('[1inch] Failed to get token info:', error);
  }

  return tokens;
}

/**
 * Scan wallet using 1inch API
 */
export async function scanWithOneInch(
  address: string,
  chainId: number,
  minUsdValue: number = 0.01
): Promise<OneInchResult> {
  const startTime = Date.now();

  // Check chain support
  const oneInchChainId = ONEINCH_CHAIN_IDS[chainId];
  if (!oneInchChainId) {
    return {
      success: false,
      error: 'unsupported_chain',
      warning: `Chain ${chainId} not supported by 1inch`,
    };
  }

  const chainName = CHAIN_NAMES[chainId] || `Chain ${chainId}`;
  const nativeSymbol = NATIVE_SYMBOLS[chainId] || 'ETH';

  try {
    // 1. Get balances
    const balanceResponse = await fetchWithFallback(
      BALANCE_ENDPOINTS,
      `/${chainId}/balances/${address}`,
      12000
    );

    if (!balanceResponse) {
      return {
        success: false,
        error: 'provider_error',
        warning: '1inch API unavailable',
      };
    }

    const balances: OneInchBalanceResponse = await balanceResponse.json();
    const tokenAddresses = Object.keys(balances).filter(addr => balances[addr] !== '0');

    if (tokenAddresses.length === 0) {
      // Return empty but successful result
      const durationMs = Date.now() - startTime;
      console.log(`[WalletScan] COMPLETE chain=${chainId} wallet=${shortWallet(address)} provider=1inch raw=0 final=0 ms=${durationMs}`);

      return {
        success: true,
        result: {
          address: address.toLowerCase(),
          chainId,
          chainName,
          tokens: [],
          nativeBalance: {
            address: NATIVE_ADDRESS,
            symbol: nativeSymbol,
            name: nativeSymbol,
            decimals: 18,
            balance: '0',
            balanceFormatted: '0',
            usdValue: null,
            usdPrice: null,
          },
          stats: {
            totalTokens: 0,
            tokensWithValue: 0,
            filteredSpam: 0,
            scanDurationMs: durationMs,
            providerTransfers: 0,
            tokensDiscovered: 0,
            tokensWithBalance: 0,
            tokensPriced: 0,
            tokensMissingPrice: 0,
          },
          provider: '1inch' as any,
          warnings: ['No tokens found in wallet'],
          cached: false,
        },
      };
    }

    // 2. Get token info (for symbols, names, decimals)
    const tokenInfo = await getTokenInfo(chainId);

    // 3. Get prices
    const priceResponse = await fetchWithFallback(
      PRICE_ENDPOINTS,
      `/${chainId}/${tokenAddresses.join(',')}`,
      10000
    );

    let prices: OneInchPriceResponse = {};
    if (priceResponse) {
      try {
        prices = await priceResponse.json();
      } catch {
        // Prices unavailable, continue without
      }
    }

    // 4. Process tokens
    const tokens: WalletToken[] = [];
    let nativeBalance: WalletToken | null = null;
    let spamFiltered = 0;
    let belowMinCount = 0;
    let tokensPriced = 0;
    let tokensMissingPrice = 0;

    for (const [tokenAddr, balance] of Object.entries(balances)) {
      if (balance === '0') continue;

      const addrLower = tokenAddr.toLowerCase();
      const info = tokenInfo.get(addrLower);

      // Get token metadata
      const symbol = info?.symbol || 'UNKNOWN';
      const name = info?.name || 'Unknown Token';
      const decimals = info?.decimals || 18;
      const logoUrl = info?.logoURI;

      // Skip spam
      if (isSpamToken(name, symbol)) {
        spamFiltered++;
        continue;
      }

      const balanceFormatted = formatBalance(balance, decimals);

      // Get price
      const priceStr = prices[tokenAddr] || prices[addrLower];
      let usdPrice: number | null = null;
      let usdValue: number | null = null;

      if (priceStr) {
        usdPrice = parseFloat(priceStr);
        usdValue = parseFloat(balanceFormatted) * usdPrice;
        tokensPriced++;
      } else {
        tokensMissingPrice++;
      }

      const token: WalletToken = {
        address: addrLower,
        symbol,
        name,
        decimals,
        balance,
        balanceFormatted,
        usdValue,
        usdPrice,
        logoUrl,
      };

      // Handle native token
      if (addrLower === NATIVE_ADDRESS) {
        nativeBalance = token;
        continue;
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

      tokens.push(token);
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

    const durationMs = Date.now() - startTime;

    // Log success
    console.log(
      `[WalletScan] COMPLETE chain=${chainId} wallet=${shortWallet(address)} ` +
      `provider=1inch raw=${tokenAddresses.length} spam=${spamFiltered} belowMin=${belowMinCount} ` +
      `final=${tokens.length} priced=${tokensPriced} missingPrice=${tokensMissingPrice} ms=${durationMs}`
    );

    const result: WalletScanResult = {
      address: address.toLowerCase(),
      chainId,
      chainName,
      tokens,
      nativeBalance: nativeBalance || {
        address: NATIVE_ADDRESS,
        symbol: nativeSymbol,
        name: nativeSymbol,
        decimals: 18,
        balance: '0',
        balanceFormatted: '0',
        usdValue: null,
        usdPrice: null,
      },
      stats: {
        totalTokens: tokenAddresses.length,
        tokensWithValue: tokens.length,
        filteredSpam: spamFiltered,
        scanDurationMs: durationMs,
        providerTransfers: tokenAddresses.length,
        tokensDiscovered: tokenAddresses.length,
        tokensWithBalance: tokenAddresses.length,
        tokensPriced,
        tokensMissingPrice,
      },
      provider: '1inch' as any,
      warnings,
      cached: false,
    };

    return { success: true, result };

  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    console.error(`[WalletScan] ERROR chain=${chainId} wallet=${shortWallet(address)} provider=1inch error=${error.message} ms=${durationMs}`);

    return {
      success: false,
      error: 'provider_error',
      warning: `1inch API error: ${error.message}`,
    };
  }
}

/**
 * Check if 1inch is available (always true - no API key needed)
 */
export function isOneInchAvailable(): boolean {
  return true;
}

/**
 * Get 1inch supported chains
 */
export function getOneInchSupportedChains(): number[] {
  return Object.keys(ONEINCH_CHAIN_IDS).map(Number);
}
