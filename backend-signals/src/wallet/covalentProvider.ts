/**
 * Covalent Wallet Scan Provider
 *
 * Uses Covalent GoldRush API to fetch token balances with USD pricing.
 * API docs: https://www.covalenthq.com/docs/api/balances/get-token-balances-for-address/
 *
 * Covalent provides balances + USD values in a single call, making it efficient.
 * Used as fallback when Moralis fails (e.g., wallet_too_large errors).
 */

import type {
  WalletScanProviderInterface,
  DiscoveredToken,
  NativeBalance,
} from './types.js';

// Covalent chain name mapping
// See: https://www.covalenthq.com/docs/networks/
const COVALENT_CHAIN_MAP: Record<number, string> = {
  1: 'eth-mainnet',
  56: 'bsc-mainnet',
  8453: 'base-mainnet',
  42161: 'arbitrum-mainnet',
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

// Covalent API response types
interface CovalentTokenItem {
  contract_decimals: number;
  contract_name: string;
  contract_ticker_symbol: string;
  contract_address: string;
  logo_url?: string;
  balance: string;
  quote?: number;        // USD value of holdings
  quote_rate?: number;   // USD price per token
  pretty_quote?: string;
  native_token?: boolean;
  type?: string;         // 'cryptocurrency' | 'stablecoin' | 'nft' | 'dust'
  is_spam?: boolean;
  quote_rate_24h?: number;
  quote_pct_change_24h?: number;
}

interface CovalentBalanceResponse {
  data: {
    address: string;
    updated_at: string;
    next_update_at: string;
    quote_currency: string;
    chain_id: number;
    chain_name: string;
    items: CovalentTokenItem[];
  };
  error: boolean;
  error_message?: string;
  error_code?: number;
}

/**
 * Covalent provider implementation
 */
export class CovalentProvider implements WalletScanProviderInterface {
  name = 'covalent';
  supportedChains = SUPPORTED_CHAINS;

  private apiKey: string;
  private baseUrl = 'https://api.covalenthq.com/v1';

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Covalent API key is required');
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
    const chain = COVALENT_CHAIN_MAP[chainId];

    if (!chain) {
      throw new Error(`Chain ${chainId} not supported by Covalent`);
    }

    // Covalent gives balances + USD in one call
    // quote-currency=USD ensures we get USD values
    // no-spam=true filters known spam tokens (Covalent's spam detection)
    const url = `${this.baseUrl}/${chain}/address/${wallet}/balances_v2/?quote-currency=USD&no-spam=true`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Covalent API error: ${response.status} - ${errorText.slice(0, 200)}`);
    }

    const data: CovalentBalanceResponse = await response.json();

    if (data.error) {
      throw new Error(`Covalent API error: ${data.error_message || 'Unknown error'}`);
    }

    const latencyMs = Date.now() - startTime;

    // Separate native token from ERC20 tokens
    let nativeItem: CovalentTokenItem | undefined;
    const tokenItems: CovalentTokenItem[] = [];

    for (const item of data.data.items) {
      if (item.native_token) {
        nativeItem = item;
      } else if (item.contract_address && item.contract_address !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
        tokenItems.push(item);
      }
    }

    // Convert to our format
    const tokens: DiscoveredToken[] = tokenItems.map((t) => ({
      address: t.contract_address.toLowerCase(),
      symbol: t.contract_ticker_symbol || 'UNKNOWN',
      name: t.contract_name || 'Unknown Token',
      decimals: t.contract_decimals || 18,
      chainId,
      balance: t.balance,
      balanceFormatted: this.formatBalance(t.balance, t.contract_decimals || 18),
      priceUsd: t.quote_rate,
      valueUsd: t.quote,
      isSpam: t.is_spam || false,
      spamReason: t.is_spam ? 'Marked as spam by Covalent' : undefined,
      hasPricing: typeof t.quote_rate === 'number' && t.quote_rate > 0,
      logo: t.logo_url,
      percentChange24h: t.quote_pct_change_24h,
    }));

    // Format native balance
    const nativeDecimals = NATIVE_DECIMALS[chainId] || 18;
    const nativeSymbol = NATIVE_SYMBOLS[chainId] || 'ETH';

    const native: NativeBalance = {
      symbol: nativeSymbol,
      balance: nativeItem?.balance || '0',
      balanceFormatted: nativeItem ? this.formatBalance(nativeItem.balance, nativeDecimals) : '0',
      priceUsd: nativeItem?.quote_rate,
      valueUsd: nativeItem?.quote,
      decimals: nativeDecimals,
    };

    return {
      tokens,
      native,
      rawCount: tokenItems.length,
      latencyMs,
    };
  }

  /**
   * Check if Covalent API is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      // Use a simple endpoint to check health
      const res = await fetch(
        `${this.baseUrl}/chains/status/`,
        {
          headers: { 'Authorization': `Bearer ${this.apiKey}` },
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

    try {
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
    } catch {
      return '0';
    }
  }
}

/**
 * Create Covalent provider instance
 */
export function createCovalentProvider(): CovalentProvider | null {
  const apiKey = process.env.COVALENT_API_KEY;

  if (!apiKey) {
    console.warn('[WalletScan] COVALENT_API_KEY not set, provider unavailable');
    return null;
  }

  return new CovalentProvider(apiKey);
}
