/**
 * Covalent Provider for Wallet Token Scanning
 *
 * Primary provider for reliable token balance + USD valuation.
 * Falls back gracefully with warnings if not configured or fails.
 */

import { WalletToken, WalletScanResult } from './scan.js';

// Covalent chain ID mapping
const COVALENT_CHAIN_IDS: Record<number, string> = {
  1: 'eth-mainnet',
  56: 'bsc-mainnet',
  137: 'matic-mainnet',
  42161: 'arbitrum-mainnet',
  8453: 'base-mainnet',
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
  /usd[tc]/i, // Fake stablecoins
];

interface CovalentBalance {
  contract_decimals: number;
  contract_name: string;
  contract_ticker_symbol: string;
  contract_address: string;
  logo_url?: string;
  balance: string;
  quote: number | null;
  quote_rate: number | null;
  native_token: boolean;
  type: string;
}

interface CovalentResponse {
  data: {
    address: string;
    chain_id: number;
    chain_name: string;
    items: CovalentBalance[];
    pagination: {
      has_more: boolean;
      total_count: number;
    };
  };
  error: boolean;
  error_message?: string;
  error_code?: number;
}

export interface CovalentResult {
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
 * Scan wallet using Covalent API
 */
export async function scanWithCovalent(
  address: string,
  chainId: number,
  minUsdValue: number = 0.01
): Promise<CovalentResult> {
  const startTime = Date.now();

  // Check if API key is configured
  const apiKey = process.env.COVALENT_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: 'provider_not_configured',
      warning: 'Covalent API key not configured',
    };
  }

  // Check chain support
  const covalentChainId = COVALENT_CHAIN_IDS[chainId];
  if (!covalentChainId) {
    return {
      success: false,
      error: 'unsupported_chain',
      warning: `Chain ${chainId} not supported by Covalent`,
    };
  }

  const chainName = CHAIN_NAMES[chainId] || `Chain ${chainId}`;
  const nativeSymbol = NATIVE_SYMBOLS[chainId] || 'ETH';

  try {
    // Fetch balances from Covalent
    const url = `https://api.covalenthq.com/v1/${covalentChainId}/address/${address}/balances_v2/?key=${apiKey}&nft=false&no-spam=true`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }

    // Handle API errors
    if (response.status === 401 || response.status === 403) {
      return {
        success: false,
        error: 'provider_denied',
        warning: 'Covalent API key invalid or rate limited',
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: 'provider_error',
        warning: `Covalent API returned ${response.status}`,
      };
    }

    const data: CovalentResponse = await response.json();

    if (data.error) {
      return {
        success: false,
        error: 'provider_error',
        warning: data.error_message || 'Covalent API error',
      };
    }

    const items = data.data?.items || [];
    const warnings: string[] = [];

    // Process tokens
    const tokens: WalletToken[] = [];
    let nativeBalance: WalletToken | null = null;
    let spamFiltered = 0;
    let belowMinCount = 0;
    let tokensPriced = 0;
    let tokensMissingPrice = 0;

    for (const item of items) {
      // Skip dust/zero balances
      if (!item.balance || item.balance === '0') continue;

      // Check for spam (additional filtering beyond Covalent's no-spam)
      if (isSpamToken(item.contract_name || '', item.contract_ticker_symbol || '')) {
        spamFiltered++;
        continue;
      }

      const balanceFormatted = formatBalance(item.balance, item.contract_decimals);
      const usdValue = item.quote !== null ? item.quote : null;
      const usdPrice = item.quote_rate !== null ? item.quote_rate : null;

      const token: WalletToken = {
        address: item.contract_address?.toLowerCase() || '',
        symbol: item.contract_ticker_symbol || 'UNKNOWN',
        name: item.contract_name || 'Unknown Token',
        decimals: item.contract_decimals || 18,
        balance: item.balance,
        balanceFormatted,
        usdValue,
        usdPrice,
        logoUrl: item.logo_url,
      };

      // Handle native token separately
      if (item.native_token) {
        nativeBalance = token;
        continue;
      }

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

      // Include tokens without price data if they have a balance
      if (usdValue === null && parseFloat(balanceFormatted) > 0) {
        tokens.push(token);
      } else if (usdValue !== null) {
        tokens.push(token);
      }
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
    if (spamFiltered > 0) {
      warnings.push(`${spamFiltered} spam token${spamFiltered > 1 ? 's' : ''} filtered`);
    }
    if (tokensMissingPrice > 0) {
      warnings.push(`Price unavailable for ${tokensMissingPrice} token${tokensMissingPrice > 1 ? 's' : ''}`);
    }
    if (items.length === 0) {
      warnings.push('No tokens found in wallet');
    }

    const durationMs = Date.now() - startTime;

    // Log success (structured, single line, privacy-safe)
    console.log(
      `[WalletScan] COMPLETE chain=${chainId} wallet=${shortWallet(address)} ` +
      `provider=covalent raw=${items.length} spam=${spamFiltered} belowMin=${belowMinCount} ` +
      `final=${tokens.length} priced=${tokensPriced} missingPrice=${tokensMissingPrice} ms=${durationMs}`
    );

    const result: WalletScanResult = {
      address: address.toLowerCase(),
      chainId,
      chainName,
      tokens,
      nativeBalance: nativeBalance || {
        address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        symbol: nativeSymbol,
        name: nativeSymbol,
        decimals: 18,
        balance: '0',
        balanceFormatted: '0',
        usdValue: null,
        usdPrice: null,
      },
      stats: {
        totalTokens: items.length,
        tokensWithValue: tokens.length,
        filteredSpam: spamFiltered,
        scanDurationMs: durationMs,
        providerTransfers: items.length,
        tokensDiscovered: items.length,
        tokensWithBalance: items.filter(i => i.balance !== '0').length,
        tokensPriced,
        tokensMissingPrice,
      },
      provider: 'covalent',
      warnings,
      cached: false,
    };

    return { success: true, result };

  } catch (error: any) {
    const durationMs = Date.now() - startTime;

    if (error.name === 'AbortError') {
      console.warn(`[WalletScan] TIMEOUT chain=${chainId} wallet=${shortWallet(address)} provider=covalent ms=${durationMs}`);
      return {
        success: false,
        error: 'provider_timeout',
        warning: 'Covalent API request timed out',
      };
    }

    console.error(`[WalletScan] ERROR chain=${chainId} wallet=${shortWallet(address)} provider=covalent error=${error.message} ms=${durationMs}`);
    return {
      success: false,
      error: 'provider_error',
      warning: `Covalent API error: ${error.message}`,
    };
  }
}

/**
 * Check if Covalent is configured
 */
export function isCovalentConfigured(): boolean {
  return !!process.env.COVALENT_API_KEY;
}

/**
 * Get Covalent supported chains
 */
export function getCovalentSupportedChains(): number[] {
  return Object.keys(COVALENT_CHAIN_IDS).map(Number);
}
