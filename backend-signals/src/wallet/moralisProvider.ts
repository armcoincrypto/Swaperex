/**
 * Moralis Wallet Scan Provider
 *
 * Uses Moralis Web3 Data API to fetch token balances.
 * API docs: https://docs.moralis.io/web3-data-api/evm/reference/wallet-api/get-wallet-token-balances-price
 */

import type {
  WalletScanProviderInterface,
  DiscoveredToken,
  NativeBalance,
  CHAIN_CONFIG,
} from './types.js';

// Moralis chain name mapping
const MORALIS_CHAIN_MAP: Record<number, string> = {
  1: 'eth',
  56: 'bsc',
  8453: 'base',
  42161: 'arbitrum',
};

// Supported chains for this provider
const SUPPORTED_CHAINS = [1, 56, 8453, 42161];

// Native token decimals by chain
const NATIVE_DECIMALS: Record<number, number> = {
  1: 18,
  56: 18,
  8453: 18,
  42161: 18,
};

// Native token symbols by chain
const NATIVE_SYMBOLS: Record<number, string> = {
  1: 'ETH',
  56: 'BNB',
  8453: 'ETH',
  42161: 'ETH',
};

// Moralis API response types
interface MoralisTokenBalance {
  token_address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  logo?: string;
  thumbnail?: string;
  possible_spam: boolean;
  verified_contract?: boolean;
  usd_price?: number;
  usd_value?: number;
  usd_price_24hr_percent_change?: number;
  native_token?: boolean;
}

interface MoralisNativeBalance {
  balance: string;
}

/**
 * Moralis provider implementation
 */
export class MoralisProvider implements WalletScanProviderInterface {
  name = 'moralis';
  supportedChains = SUPPORTED_CHAINS;

  private apiKey: string;
  private baseUrl = 'https://deep-index.moralis.io/api/v2.2';

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Moralis API key is required');
    }
    this.apiKey = apiKey;
  }

  /**
   * Fetch token balances with pricing
   */
  async getTokenBalances(
    chainId: number,
    wallet: string,
  ): Promise<{
    tokens: DiscoveredToken[];
    native: NativeBalance;
    rawCount: number;
    latencyMs: number;
  }> {
    const startTime = Date.now();
    const chain = MORALIS_CHAIN_MAP[chainId];

    if (!chain) {
      throw new Error(`Chain ${chainId} not supported by Moralis`);
    }

    // Fetch token balances with prices
    const tokenUrl = `${this.baseUrl}/${wallet}/erc20?chain=${chain}`;
    const nativeUrl = `${this.baseUrl}/${wallet}/balance?chain=${chain}`;

    const [tokenRes, nativeRes] = await Promise.all([
      fetch(tokenUrl, {
        headers: {
          'X-API-Key': this.apiKey,
          'Accept': 'application/json',
        },
      }),
      fetch(nativeUrl, {
        headers: {
          'X-API-Key': this.apiKey,
          'Accept': 'application/json',
        },
      }),
    ]);

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text().catch(() => 'Unknown error');
      throw new Error(`Moralis token API error: ${tokenRes.status} - ${errorText.slice(0, 200)}`);
    }

    if (!nativeRes.ok) {
      const errorText = await nativeRes.text().catch(() => 'Unknown error');
      throw new Error(`Moralis native API error: ${nativeRes.status} - ${errorText.slice(0, 200)}`);
    }

    const tokenData: MoralisTokenBalance[] = await tokenRes.json();
    const nativeData: MoralisNativeBalance = await nativeRes.json();

    const latencyMs = Date.now() - startTime;

    // Convert to our format
    const tokens: DiscoveredToken[] = tokenData.map((t) => ({
      address: t.token_address.toLowerCase(),
      symbol: t.symbol || 'UNKNOWN',
      name: t.name || 'Unknown Token',
      decimals: t.decimals || 18,
      chainId,
      balance: t.balance,
      balanceFormatted: this.formatBalance(t.balance, t.decimals || 18),
      priceUsd: t.usd_price,
      valueUsd: t.usd_value,
      isSpam: t.possible_spam || false,
      spamReason: t.possible_spam ? 'Marked as possible spam by Moralis' : undefined,
      hasPricing: typeof t.usd_price === 'number',
      logo: t.logo || t.thumbnail,
      percentChange24h: t.usd_price_24hr_percent_change,
    }));

    // Format native balance
    const nativeDecimals = NATIVE_DECIMALS[chainId] || 18;
    const nativeSymbol = NATIVE_SYMBOLS[chainId] || 'ETH';
    const nativeBalanceFormatted = this.formatBalance(nativeData.balance, nativeDecimals);

    // Get native price (we'll need a separate call or use DexScreener)
    const native: NativeBalance = {
      symbol: nativeSymbol,
      balance: nativeData.balance,
      balanceFormatted: nativeBalanceFormatted,
      decimals: nativeDecimals,
    };

    return {
      tokens,
      native,
      rawCount: tokenData.length,
      latencyMs,
    };
  }

  /**
   * Check if Moralis API is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(
        `${this.baseUrl}/info/endpointWeights`,
        {
          headers: { 'X-API-Key': this.apiKey },
          signal: controller.signal,
        },
      );

      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Format raw balance with decimals
   */
  private formatBalance(balance: string, decimals: number): string {
    if (!balance || balance === '0') return '0';

    const balanceBigInt = BigInt(balance);
    const divisor = BigInt(10 ** decimals);
    const wholePart = balanceBigInt / divisor;
    const fractionalPart = balanceBigInt % divisor;

    if (fractionalPart === BigInt(0)) {
      return wholePart.toString();
    }

    // Get fractional string with leading zeros
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    // Trim trailing zeros but keep at least 4 decimal places for small amounts
    const trimmed = fractionalStr.replace(/0+$/, '');
    const displayDecimals = Math.min(6, Math.max(4, trimmed.length));

    return `${wholePart}.${fractionalStr.slice(0, displayDecimals)}`;
  }
}

/**
 * Create Moralis provider instance
 */
export function createMoralisProvider(): MoralisProvider | null {
  const apiKey = process.env.MORALIS_API_KEY;

  if (!apiKey) {
    console.warn('[WalletScan] MORALIS_API_KEY not set, provider unavailable');
    return null;
  }

  return new MoralisProvider(apiKey);
}
