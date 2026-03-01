/**
 * Signal Types
 *
 * Backend signals are objective, explainable, and non-harmful.
 * No trading advice, no predictions - just facts.
 */

// Liquidity Change Alert - ≥30% drop in <10 minutes
export interface LiquidityDropSignal {
  detected: boolean;
  percentageChange: number; // Negative = drop
  window: string; // e.g., "10m"
  previousUsd: number;
  currentUsd: number;
  timestamp: number;
}

// Whale Transfer Signal - Large transfer > threshold
export interface WhaleTransferSignal {
  detected: boolean;
  amountUsd: number;
  direction: 'in' | 'out' | 'unknown';
  txHash?: string;
  timestamp: number;
}

// Risk Status Change - Token risk level changed
export interface RiskChangeSignal {
  detected: boolean;
  currentLevel: 'safe' | 'warning' | 'danger';
  previousLevel?: 'safe' | 'warning' | 'danger';
  changeDirection?: 'improved' | 'worsened';
  score: number; // 0-100
  timestamp: number;
}

// Combined signals response
export interface SignalsResponse {
  success: boolean;
  chainId: number;
  token: string;
  timestamp: number;
  signals: {
    liquidityDrop: LiquidityDropSignal | null;
    whaleTransfer: WhaleTransferSignal | null;
    riskChange: RiskChangeSignal | null;
  };
}

// Signal query params
export interface SignalQueryParams {
  chainId: number;
  token: string;
}

// Cache key structure
export type CacheKey = `signals:${number}:${string}`;

// DexScreener API types
export interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  liquidity: {
    usd: number;
    base: number;
    quote: number;
  };
  volume: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  priceChange: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  txns: {
    h24: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    m5: { buys: number; sells: number };
  };
}

export interface DexScreenerResponse {
  schemaVersion: string;
  pairs: DexScreenerPair[] | null;
}

// GoPlus API types (simplified)
export interface GoPlusTokenSecurity {
  is_honeypot?: string;
  is_blacklisted?: string;
  is_open_source?: string;
  is_proxy?: string;
  is_mintable?: string;
  can_take_back_ownership?: string;
  owner_change_balance?: string;
  hidden_owner?: string;
  selfdestruct?: string;
  external_call?: string;
  transfer_pausable?: string;
  buy_tax?: string;
  sell_tax?: string;
  cannot_buy?: string;
  cannot_sell_all?: string;
  slippage_modifiable?: string;
  is_anti_whale?: string;
  anti_whale_modifiable?: string;
  trading_cooldown?: string;
  is_true_token?: string;
  trust_list?: string;
}

export interface GoPlusResponse {
  code: number;
  message: string;
  result: Record<string, GoPlusTokenSecurity>;
}
