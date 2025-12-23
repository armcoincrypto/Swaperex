/**
 * Token Security Service
 *
 * Fetches token security data from GoPlus API (frontend-only, no auth required).
 * Returns simple risk labels: safe / warning / risk
 *
 * API: https://docs.gopluslabs.io/reference/token-security-api
 */

// GoPlus API endpoint
const GOPLUS_API = 'https://api.gopluslabs.io/api/v1/token_security';

// Chain ID mapping for GoPlus API
const GOPLUS_CHAIN_IDS: Record<number, string> = {
  1: '1',      // Ethereum
  56: '56',    // BSC
  137: '137',  // Polygon
  42161: '42161', // Arbitrum
};

// Risk level enum
export type RiskLevel = 'safe' | 'warning' | 'risk' | 'unknown';

// Individual security signal
export interface SecuritySignal {
  label: string;
  level: RiskLevel;
  value: string;
  tooltip: string;
}

// Complete security data for a token
export interface TokenSecurityData {
  // Overall risk assessment
  overallRisk: RiskLevel;

  // Individual signals
  contractVerified: SecuritySignal;
  liquidityLocked: SecuritySignal;
  tokenAge: SecuritySignal;
  buyTax: SecuritySignal;
  sellTax: SecuritySignal;
  liquidity: SecuritySignal;

  // Additional flags
  isHoneypot: boolean;
  honeypotReason?: string;

  // Raw data for advanced users
  holderCount?: number;
  lpHolders?: number;

  // Metadata
  fetchedAt: number;
  source: 'goplus';
}

// GoPlus API response shape (partial, only what we need)
interface GoPlusTokenData {
  is_open_source?: string;        // "1" = verified
  is_honeypot?: string;           // "1" = honeypot
  honeypot_with_same_creator?: string;
  buy_tax?: string;               // "0.05" = 5%
  sell_tax?: string;
  slippage_modifiable?: string;
  is_mintable?: string;
  can_take_back_ownership?: string;
  hidden_owner?: string;
  selfdestruct?: string;
  external_call?: string;
  holder_count?: string;
  lp_holder_count?: string;
  lp_total_supply?: string;
  lp_holders?: Array<{
    address: string;
    percent: string;
    is_locked?: string;
    locked_detail?: Array<{
      amount: string;
      end_time: string;
    }>;
  }>;
  dex?: Array<{
    name: string;
    liquidity: string;
    pair: string;
  }>;
  total_supply?: string;
  creator_address?: string;
  creator_percent?: string;
  owner_address?: string;
  owner_percent?: string;
  creation_time?: string;  // Unix timestamp as string
}

interface GoPlusResponse {
  code: number;
  message: string;
  result: Record<string, GoPlusTokenData>;
}

/**
 * Fetch token security data from GoPlus API
 */
export async function fetchTokenSecurity(
  contractAddress: string,
  chainId: number
): Promise<TokenSecurityData | null> {
  const goPlusChainId = GOPLUS_CHAIN_IDS[chainId];
  if (!goPlusChainId) {
    console.warn('[TokenSecurity] Unsupported chain:', chainId);
    return null;
  }

  try {
    const url = `${GOPLUS_API}/${goPlusChainId}?contract_addresses=${contractAddress.toLowerCase()}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error('[TokenSecurity] API error:', response.status);
      return null;
    }

    const data: GoPlusResponse = await response.json();

    if (data.code !== 1 || !data.result) {
      console.warn('[TokenSecurity] No data for token');
      return null;
    }

    const tokenData = data.result[contractAddress.toLowerCase()];
    if (!tokenData) {
      return null;
    }

    return parseSecurityData(tokenData);
  } catch (error) {
    console.error('[TokenSecurity] Fetch error:', error);
    return null;
  }
}

/**
 * Parse GoPlus data into our security format
 */
function parseSecurityData(data: GoPlusTokenData): TokenSecurityData {
  // Parse individual signals
  const contractVerified = parseContractVerified(data);
  const liquidityLocked = parseLiquidityLocked(data);
  const tokenAge = parseTokenAge(data);
  const buyTax = parseTax(data.buy_tax, 'Buy');
  const sellTax = parseTax(data.sell_tax, 'Sell');
  const liquidity = parseLiquidity(data);

  // Determine overall risk
  const signals = [contractVerified, liquidityLocked, tokenAge, buyTax, sellTax, liquidity];
  const riskCount = signals.filter(s => s.level === 'risk').length;
  const warningCount = signals.filter(s => s.level === 'warning').length;

  let overallRisk: RiskLevel = 'safe';
  if (data.is_honeypot === '1' || riskCount >= 2) {
    overallRisk = 'risk';
  } else if (riskCount >= 1 || warningCount >= 2) {
    overallRisk = 'warning';
  }

  return {
    overallRisk,
    contractVerified,
    liquidityLocked,
    tokenAge,
    buyTax,
    sellTax,
    liquidity,
    isHoneypot: data.is_honeypot === '1',
    honeypotReason: data.is_honeypot === '1' ? 'Token may not be sellable' : undefined,
    holderCount: data.holder_count ? parseInt(data.holder_count) : undefined,
    lpHolders: data.lp_holder_count ? parseInt(data.lp_holder_count) : undefined,
    fetchedAt: Date.now(),
    source: 'goplus',
  };
}

/**
 * Parse contract verification status
 */
function parseContractVerified(data: GoPlusTokenData): SecuritySignal {
  const isVerified = data.is_open_source === '1';

  if (isVerified) {
    return {
      label: 'Contract',
      level: 'safe',
      value: 'Verified',
      tooltip: 'Contract source code is verified on blockchain explorer',
    };
  }

  return {
    label: 'Contract',
    level: 'warning',
    value: 'Unverified',
    tooltip: 'Contract source code is not public. Cannot verify what this contract does.',
  };
}

/**
 * Parse liquidity lock status
 */
function parseLiquidityLocked(data: GoPlusTokenData): SecuritySignal {
  if (!data.lp_holders || data.lp_holders.length === 0) {
    return {
      label: 'LP Lock',
      level: 'unknown',
      value: 'Unknown',
      tooltip: 'Unable to determine liquidity lock status',
    };
  }

  // Check if any significant LP holder has locked tokens
  let totalLockedPercent = 0;
  let hasLock = false;

  for (const holder of data.lp_holders) {
    if (holder.is_locked === '1' && holder.locked_detail && holder.locked_detail.length > 0) {
      hasLock = true;
      totalLockedPercent += parseFloat(holder.percent) * 100;
    }
  }

  if (hasLock && totalLockedPercent >= 50) {
    return {
      label: 'LP Lock',
      level: 'safe',
      value: `${Math.round(totalLockedPercent)}% Locked`,
      tooltip: 'Majority of liquidity is locked, reducing rug pull risk',
    };
  }

  if (hasLock) {
    return {
      label: 'LP Lock',
      level: 'warning',
      value: `${Math.round(totalLockedPercent)}% Locked`,
      tooltip: 'Some liquidity is locked, but developer can still remove a portion',
    };
  }

  return {
    label: 'LP Lock',
    level: 'risk',
    value: 'Unlocked',
    tooltip: 'Liquidity is not locked. Developer can remove funds at any time.',
  };
}

/**
 * Parse token age from creation time
 */
function parseTokenAge(data: GoPlusTokenData): SecuritySignal {
  if (!data.creation_time) {
    return {
      label: 'Age',
      level: 'unknown',
      value: 'Unknown',
      tooltip: 'Unable to determine token creation date',
    };
  }

  const creationTime = parseInt(data.creation_time) * 1000; // Convert to ms
  const now = Date.now();
  const ageMs = now - creationTime;
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

  let ageText: string;
  if (ageDays === 0) {
    const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
    ageText = ageHours <= 1 ? '< 1 hour' : `${ageHours} hours`;
  } else if (ageDays < 30) {
    ageText = `${ageDays} day${ageDays > 1 ? 's' : ''}`;
  } else if (ageDays < 365) {
    const months = Math.floor(ageDays / 30);
    ageText = `${months} month${months > 1 ? 's' : ''}`;
  } else {
    const years = Math.floor(ageDays / 365);
    ageText = `${years} year${years > 1 ? 's' : ''}`;
  }

  if (ageDays < 7) {
    return {
      label: 'Age',
      level: 'risk',
      value: ageText,
      tooltip: 'Very new token. New tokens carry higher risk of scams.',
    };
  }

  if (ageDays < 30) {
    return {
      label: 'Age',
      level: 'warning',
      value: ageText,
      tooltip: 'Relatively new token. Exercise caution.',
    };
  }

  return {
    label: 'Age',
    level: 'safe',
    value: ageText,
    tooltip: 'Established token with track record.',
  };
}

/**
 * Parse buy/sell tax
 */
function parseTax(taxStr: string | undefined, type: 'Buy' | 'Sell'): SecuritySignal {
  if (!taxStr) {
    return {
      label: `${type} Tax`,
      level: 'unknown',
      value: 'Unknown',
      tooltip: `Unable to determine ${type.toLowerCase()} tax`,
    };
  }

  const taxPercent = parseFloat(taxStr) * 100;

  if (taxPercent === 0) {
    return {
      label: `${type} Tax`,
      level: 'safe',
      value: '0%',
      tooltip: `No ${type.toLowerCase()} tax on this token`,
    };
  }

  if (taxPercent <= 5) {
    return {
      label: `${type} Tax`,
      level: 'safe',
      value: `${taxPercent.toFixed(1)}%`,
      tooltip: `Low ${type.toLowerCase()} tax`,
    };
  }

  if (taxPercent <= 15) {
    return {
      label: `${type} Tax`,
      level: 'warning',
      value: `${taxPercent.toFixed(1)}%`,
      tooltip: `Moderate ${type.toLowerCase()} tax. This reduces your trade value.`,
    };
  }

  return {
    label: `${type} Tax`,
    level: 'risk',
    value: `${taxPercent.toFixed(1)}%`,
    tooltip: `High ${type.toLowerCase()} tax! You will lose a significant portion of value.`,
  };
}

/**
 * Parse DEX liquidity
 */
function parseLiquidity(data: GoPlusTokenData): SecuritySignal {
  if (!data.dex || data.dex.length === 0) {
    return {
      label: 'Liquidity',
      level: 'risk',
      value: 'None found',
      tooltip: 'No liquidity pools found. This token may not be tradeable.',
    };
  }

  // Sum all DEX liquidity
  let totalLiquidity = 0;
  for (const dex of data.dex) {
    if (dex.liquidity) {
      totalLiquidity += parseFloat(dex.liquidity);
    }
  }

  const formatLiquidity = (val: number): string => {
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
    return `$${val.toFixed(0)}`;
  };

  if (totalLiquidity >= 100_000) {
    return {
      label: 'Liquidity',
      level: 'safe',
      value: formatLiquidity(totalLiquidity),
      tooltip: 'Good liquidity. Trades should execute with low slippage.',
    };
  }

  if (totalLiquidity >= 10_000) {
    return {
      label: 'Liquidity',
      level: 'warning',
      value: formatLiquidity(totalLiquidity),
      tooltip: 'Moderate liquidity. Large trades may have high price impact.',
    };
  }

  return {
    label: 'Liquidity',
    level: 'risk',
    value: formatLiquidity(totalLiquidity),
    tooltip: 'Very low liquidity. High slippage risk.',
  };
}

/**
 * Get color classes for risk level
 */
export function getRiskColorClasses(level: RiskLevel): {
  bg: string;
  text: string;
  border: string;
} {
  switch (level) {
    case 'safe':
      return {
        bg: 'bg-green-900/30',
        text: 'text-green-400',
        border: 'border-green-800',
      };
    case 'warning':
      return {
        bg: 'bg-yellow-900/30',
        text: 'text-yellow-400',
        border: 'border-yellow-800',
      };
    case 'risk':
      return {
        bg: 'bg-red-900/30',
        text: 'text-red-400',
        border: 'border-red-800',
      };
    default:
      return {
        bg: 'bg-dark-700',
        text: 'text-dark-400',
        border: 'border-dark-600',
      };
  }
}

/**
 * Get icon for risk level
 */
export function getRiskIcon(level: RiskLevel): string {
  switch (level) {
    case 'safe':
      return '✓';
    case 'warning':
      return '⚠';
    case 'risk':
      return '⛔';
    default:
      return '?';
  }
}

export default {
  fetchTokenSecurity,
  getRiskColorClasses,
  getRiskIcon,
};
