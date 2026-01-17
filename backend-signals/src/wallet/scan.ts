/**
 * Wallet Token Scanner
 *
 * Discovers tokens in a wallet using:
 * - Primary: 1inch API (free, no key required)
 * - Fallback: Covalent API (if configured)
 * - Fallback: Block explorer APIs (BscScan, Etherscan)
 *
 * Environment variables:
 * - COVALENT_API_KEY: API key for Covalent (optional fallback)
 * - WALLET_SCAN_PROVIDER: Force provider (1inch|covalent|explorer), default auto
 * - WALLET_SCAN_CACHE_TTL_SEC: Cache TTL in seconds (default 300)
 */

import { scanWithOneInch, isOneInchAvailable } from './oneinch.js';
import { scanWithCovalent, isCovalentConfigured } from './covalent.js';

// Chain configurations
const CHAIN_CONFIGS: Record<number, {
  name: string;
  apiUrl: string;
  nativeSymbol: string;
  nativeDecimals: number;
  explorerUrl: string;
}> = {
  1: {
    name: 'Ethereum',
    apiUrl: 'https://api.etherscan.io/api',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    explorerUrl: 'https://etherscan.io',
  },
  56: {
    name: 'BNB Chain',
    apiUrl: 'https://api.bscscan.com/api',
    nativeSymbol: 'BNB',
    nativeDecimals: 18,
    explorerUrl: 'https://bscscan.com',
  },
  137: {
    name: 'Polygon',
    apiUrl: 'https://api.polygonscan.com/api',
    nativeSymbol: 'MATIC',
    nativeDecimals: 18,
    explorerUrl: 'https://polygonscan.com',
  },
  42161: {
    name: 'Arbitrum',
    apiUrl: 'https://api.arbiscan.io/api',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    explorerUrl: 'https://arbiscan.io',
  },
  8453: {
    name: 'Base',
    apiUrl: 'https://api.basescan.org/api',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    explorerUrl: 'https://basescan.org',
  },
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

export interface WalletToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceFormatted: string;
  usdValue: number | null;
  usdPrice: number | null;
  logoUrl?: string;
}

export interface WalletScanResult {
  address: string;
  chainId: number;
  chainName: string;
  tokens: WalletToken[];
  nativeBalance: WalletToken;
  stats: {
    totalTokens: number;
    tokensWithValue: number;
    filteredSpam: number;
    scanDurationMs: number;
    // Expanded stats
    providerTransfers: number;
    tokensDiscovered: number;
    tokensWithBalance: number;
    tokensPriced: number;
    tokensMissingPrice: number;
  };
  provider: '1inch' | 'covalent' | 'explorer';
  warnings: string[];
  cached: boolean;
  cacheAge?: number;
  fetchedAt?: number;
  minValueUsd?: number;
}

// Simple in-memory cache (5 minute TTL)
const scanCache = new Map<string, { result: WalletScanResult; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Format balance with decimals
 */
function formatBalance(balance: string, decimals: number): string {
  if (!balance || balance === '0') return '0';

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
}

/**
 * Check if token name/symbol looks like spam
 */
function isSpamToken(name: string, symbol: string): boolean {
  const combined = `${name} ${symbol}`;
  return SPAM_PATTERNS.some(pattern => pattern.test(combined));
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url: string, timeout = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get native balance (ETH, BNB, MATIC)
 */
async function getNativeBalance(
  chainId: number,
  address: string
): Promise<WalletToken | null> {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) return null;

  try {
    const url = `${config.apiUrl}?module=account&action=balance&address=${address}&tag=latest`;
    const response = await fetchWithTimeout(url);
    const data = await response.json();

    if (data.status !== '1') {
      console.warn(`[WalletScan] Native balance error:`, data.message);
      return null;
    }

    const balance = data.result || '0';
    const balanceFormatted = formatBalance(balance, config.nativeDecimals);

    return {
      address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      symbol: config.nativeSymbol,
      name: config.nativeSymbol,
      decimals: config.nativeDecimals,
      balance,
      balanceFormatted,
      usdValue: null, // Will be filled by price service
      usdPrice: null,
    };
  } catch (error) {
    console.error(`[WalletScan] Failed to get native balance:`, error);
    return null;
  }
}

interface TokenTransferResult {
  tokens: Map<string, { symbol: string; name: string; decimals: number }>;
  transferCount: number;
  spamFiltered: number;
  limitReached: boolean;
}

/**
 * Get token transfers to discover tokens
 */
async function getTokenTransfers(
  chainId: number,
  address: string
): Promise<TokenTransferResult> {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    return { tokens: new Map(), transferCount: 0, spamFiltered: 0, limitReached: false };
  }

  const tokens = new Map<string, { symbol: string; name: string; decimals: number }>();
  let transferCount = 0;
  let spamFiltered = 0;

  try {
    // Get token transfers (both incoming and outgoing)
    const url = `${config.apiUrl}?module=account&action=tokentx&address=${address}&page=1&offset=100&sort=desc`;
    const response = await fetchWithTimeout(url);
    const data = await response.json();

    if (data.status !== '1' || !Array.isArray(data.result)) {
      return { tokens, transferCount: 0, spamFiltered: 0, limitReached: false };
    }

    transferCount = data.result.length;
    const limitReached = transferCount >= 100;

    for (const tx of data.result) {
      const contractAddress = tx.contractAddress?.toLowerCase();
      if (!contractAddress || tokens.has(contractAddress)) continue;

      // Skip spam tokens
      if (isSpamToken(tx.tokenName || '', tx.tokenSymbol || '')) {
        spamFiltered++;
        continue;
      }

      tokens.set(contractAddress, {
        symbol: tx.tokenSymbol || 'UNKNOWN',
        name: tx.tokenName || 'Unknown Token',
        decimals: parseInt(tx.tokenDecimal || '18', 10),
      });
    }

    return { tokens, transferCount, spamFiltered, limitReached };
  } catch (error) {
    console.error(`[WalletScan] Failed to get token transfers:`, error);
    return { tokens, transferCount: 0, spamFiltered: 0, limitReached: false };
  }
}

/**
 * Get balance for a specific token
 */
async function getTokenBalance(
  chainId: number,
  walletAddress: string,
  tokenAddress: string
): Promise<string> {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) return '0';

  try {
    const url = `${config.apiUrl}?module=account&action=tokenbalance&contractaddress=${tokenAddress}&address=${walletAddress}&tag=latest`;
    const response = await fetchWithTimeout(url);
    const data = await response.json();

    if (data.status !== '1') {
      return '0';
    }

    return data.result || '0';
  } catch {
    return '0';
  }
}

/**
 * Get USD prices from DexScreener
 */
async function getTokenPrices(
  chainId: number,
  tokenAddresses: string[]
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();

  if (tokenAddresses.length === 0) return prices;

  // DexScreener chain names
  const chainNames: Record<number, string> = {
    1: 'ethereum',
    56: 'bsc',
    137: 'polygon',
    42161: 'arbitrum',
    8453: 'base',
  };

  const chainName = chainNames[chainId];
  if (!chainName) return prices;

  try {
    // Batch tokens (DexScreener supports up to 30 at once)
    const batches = [];
    for (let i = 0; i < tokenAddresses.length; i += 30) {
      batches.push(tokenAddresses.slice(i, i + 30));
    }

    for (const batch of batches) {
      const url = `https://api.dexscreener.com/latest/dex/tokens/${batch.join(',')}`;
      const response = await fetchWithTimeout(url);
      const data = await response.json();

      if (data.pairs) {
        for (const pair of data.pairs) {
          if (pair.chainId === chainName && pair.priceUsd) {
            const tokenAddr = pair.baseToken?.address?.toLowerCase();
            if (tokenAddr && !prices.has(tokenAddr)) {
              prices.set(tokenAddr, parseFloat(pair.priceUsd));
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(`[WalletScan] Failed to get token prices:`, error);
  }

  return prices;
}

/**
 * Shorten wallet address for logging (privacy)
 */
function shortWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Scan wallet for all tokens
 *
 * Uses Covalent as primary provider, falls back to explorer APIs.
 */
export async function scanWalletTokens(
  address: string,
  chainId: number,
  minUsdValue = 0.01
): Promise<WalletScanResult> {
  const startTime = Date.now();
  const cacheKey = `${chainId}:${address.toLowerCase()}:${minUsdValue}`;

  // Check cache
  const cached = scanCache.get(cacheKey);
  const cacheTtl = parseInt(process.env.WALLET_SCAN_CACHE_TTL_SEC || '300', 10) * 1000;
  if (cached && Date.now() - cached.timestamp < cacheTtl) {
    return {
      ...cached.result,
      cached: true,
      cacheAge: Math.floor((Date.now() - cached.timestamp) / 1000),
    };
  }

  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    throw new Error(`Unsupported chain: ${chainId}`);
  }

  // Determine provider to use
  const forceProvider = process.env.WALLET_SCAN_PROVIDER?.toLowerCase();

  // Try 1inch first (free, no API key needed)
  if (forceProvider !== 'covalent' && forceProvider !== 'explorer' && isOneInchAvailable()) {
    const oneInchResult = await scanWithOneInch(address, chainId, minUsdValue);

    if (oneInchResult.success && oneInchResult.result) {
      const result = {
        ...oneInchResult.result,
        provider: '1inch' as const,
        fetchedAt: Date.now(),
        minValueUsd: minUsdValue,
      };

      // Cache the result
      scanCache.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    }

    // If 1inch failed and forced, return error
    if (forceProvider === '1inch') {
      const errorResult: WalletScanResult = {
        address: address.toLowerCase(),
        chainId,
        chainName: config.name,
        tokens: [],
        nativeBalance: {
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          symbol: config.nativeSymbol,
          name: config.nativeSymbol,
          decimals: config.nativeDecimals,
          balance: '0',
          balanceFormatted: '0',
          usdValue: null,
          usdPrice: null,
        },
        stats: {
          totalTokens: 0,
          tokensWithValue: 0,
          filteredSpam: 0,
          scanDurationMs: Date.now() - startTime,
          providerTransfers: 0,
          tokensDiscovered: 0,
          tokensWithBalance: 0,
          tokensPriced: 0,
          tokensMissingPrice: 0,
        },
        provider: '1inch',
        warnings: [oneInchResult.warning || oneInchResult.error || 'Provider error'],
        cached: false,
        fetchedAt: Date.now(),
        minValueUsd: minUsdValue,
      };
      return errorResult;
    }

    // Log and try next provider
    console.log(`[WalletScan] 1inch failed (${oneInchResult.error}), trying Covalent for wallet=${shortWallet(address)}`);
  }

  // Try Covalent as fallback (if configured)
  if (forceProvider !== 'explorer' && isCovalentConfigured()) {
    const covalentResult = await scanWithCovalent(address, chainId, minUsdValue);

    if (covalentResult.success && covalentResult.result) {
      const result = {
        ...covalentResult.result,
        provider: 'covalent' as const,
        fetchedAt: Date.now(),
        minValueUsd: minUsdValue,
      };

      // Cache the result
      scanCache.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    }

    // If Covalent failed and forced, return error
    if (forceProvider === 'covalent') {
      const errorResult: WalletScanResult = {
        address: address.toLowerCase(),
        chainId,
        chainName: config.name,
        tokens: [],
        nativeBalance: {
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          symbol: config.nativeSymbol,
          name: config.nativeSymbol,
          decimals: config.nativeDecimals,
          balance: '0',
          balanceFormatted: '0',
          usdValue: null,
          usdPrice: null,
        },
        stats: {
          totalTokens: 0,
          tokensWithValue: 0,
          filteredSpam: 0,
          scanDurationMs: Date.now() - startTime,
          providerTransfers: 0,
          tokensDiscovered: 0,
          tokensWithBalance: 0,
          tokensPriced: 0,
          tokensMissingPrice: 0,
        },
        provider: 'covalent',
        warnings: [covalentResult.warning || covalentResult.error || 'Provider error'],
        cached: false,
        fetchedAt: Date.now(),
        minValueUsd: minUsdValue,
      };
      return errorResult;
    }

    // Log fallback
    console.log(`[WalletScan] Covalent failed (${covalentResult.error}), falling back to explorer for wallet=${shortWallet(address)}`);
  }

  // Final fallback to explorer-based scanning
  const warnings: string[] = [];

  // Add warning about fallback
  if (isOneInchAvailable() || isCovalentConfigured()) {
    warnings.push('fell_back_to_explorer');
  }

  // 1. Get native balance
  const nativeBalance = await getNativeBalance(chainId, address);

  // 2. Discover tokens from transfer history
  const transferResult = await getTokenTransfers(chainId, address);
  const { tokens: discoveredTokens, transferCount, spamFiltered, limitReached } = transferResult;

  // Build warnings based on scan results
  if (limitReached) {
    warnings.push('Limited to last 100 transfers');
  }
  if (transferCount === 0) {
    warnings.push('No ERC-20 transfers found');
  }
  if (spamFiltered > 0) {
    warnings.push(`${spamFiltered} spam token${spamFiltered > 1 ? 's' : ''} filtered`);
  }

  // 3. Get balances for discovered tokens (parallel, limited concurrency)
  const tokens: WalletToken[] = [];
  const tokenAddresses = Array.from(discoveredTokens.keys());

  // Batch balance requests (5 at a time to avoid rate limits)
  const batchSize = 5;
  for (let i = 0; i < tokenAddresses.length; i += batchSize) {
    const batch = tokenAddresses.slice(i, i + batchSize);
    const balancePromises = batch.map(async (tokenAddr) => {
      const tokenInfo = discoveredTokens.get(tokenAddr)!;
      const balance = await getTokenBalance(chainId, address, tokenAddr);

      if (balance === '0') return null;

      return {
        address: tokenAddr,
        symbol: tokenInfo.symbol,
        name: tokenInfo.name,
        decimals: tokenInfo.decimals,
        balance,
        balanceFormatted: formatBalance(balance, tokenInfo.decimals),
        usdValue: null as number | null,
        usdPrice: null as number | null,
      };
    });

    const results = await Promise.all(balancePromises);
    tokens.push(...results.filter((t): t is WalletToken => t !== null));
  }

  // 4. Get USD prices
  const tokenAddrsWithBalance = tokens.map(t => t.address);
  const prices = await getTokenPrices(chainId, tokenAddrsWithBalance);

  // 5. Apply prices and filter by min value
  const tokensWithValue: WalletToken[] = [];
  for (const token of tokens) {
    const price = prices.get(token.address);
    if (price) {
      token.usdPrice = price;
      token.usdValue = parseFloat(token.balanceFormatted) * price;

      // Filter by minimum USD value
      if (token.usdValue >= minUsdValue) {
        tokensWithValue.push(token);
      }
    } else {
      // Keep tokens without price data but mark them
      token.usdValue = null;
      token.usdPrice = null;
      // Still include if balance is significant (> 0)
      if (parseFloat(token.balanceFormatted) > 0) {
        tokensWithValue.push(token);
      }
    }
  }

  // Sort by USD value (highest first), then by balance
  tokensWithValue.sort((a, b) => {
    if (a.usdValue !== null && b.usdValue !== null) {
      return b.usdValue - a.usdValue;
    }
    if (a.usdValue !== null) return -1;
    if (b.usdValue !== null) return 1;
    return parseFloat(b.balanceFormatted) - parseFloat(a.balanceFormatted);
  });

  // Calculate price stats
  const tokensPriced = tokensWithValue.filter(t => t.usdPrice !== null).length;
  const tokensMissingPrice = tokensWithValue.filter(t => t.usdPrice === null).length;

  // Add warning if many prices missing
  if (tokensMissingPrice > 0 && tokens.length > 0) {
    warnings.push(`Price unavailable for ${tokensMissingPrice} token${tokensMissingPrice > 1 ? 's' : ''}`);
  }

  const durationMs = Date.now() - startTime;

  // Log completion (structured, single line, privacy-safe)
  console.log(
    `[WalletScan] COMPLETE chain=${chainId} wallet=${shortWallet(address)} ` +
    `provider=explorer raw=${transferCount} spam=${spamFiltered} ` +
    `final=${tokensWithValue.length} priced=${tokensPriced} missingPrice=${tokensMissingPrice} ms=${durationMs}`
  );

  const result: WalletScanResult = {
    address: address.toLowerCase(),
    chainId,
    chainName: config.name,
    tokens: tokensWithValue,
    nativeBalance: nativeBalance || {
      address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      symbol: config.nativeSymbol,
      name: config.nativeSymbol,
      decimals: config.nativeDecimals,
      balance: '0',
      balanceFormatted: '0',
      usdValue: null,
      usdPrice: null,
    },
    stats: {
      totalTokens: discoveredTokens.size,
      tokensWithValue: tokensWithValue.length,
      filteredSpam: spamFiltered,
      scanDurationMs: durationMs,
      // Expanded stats
      providerTransfers: transferCount,
      tokensDiscovered: discoveredTokens.size,
      tokensWithBalance: tokens.length,
      tokensPriced,
      tokensMissingPrice,
    },
    provider: 'explorer',
    warnings,
    cached: false,
    fetchedAt: Date.now(),
    minValueUsd: minUsdValue,
  };

  // Cache the result
  scanCache.set(cacheKey, { result, timestamp: Date.now() });

  return result;
}

/**
 * Get supported chain IDs
 */
export function getSupportedChains(): number[] {
  return Object.keys(CHAIN_CONFIGS).map(Number);
}

/**
 * Check if chain is supported
 */
export function isChainSupported(chainId: number): boolean {
  return chainId in CHAIN_CONFIGS;
}
