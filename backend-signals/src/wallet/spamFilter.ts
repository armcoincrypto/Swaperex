/**
 * Spam Filter
 *
 * Identifies spam/scam tokens to filter from wallet scan results.
 * Uses multiple heuristics - no single rule blocks a token.
 */

import type { DiscoveredToken } from './types.js';

// Known spam token patterns
const SPAM_NAME_PATTERNS = [
  /airdrop/i,
  /claim/i,
  /\.com$/i,
  /\.io$/i,
  /\.org$/i,
  /\.net$/i,
  /visit/i,
  /free/i,
  /bonus/i,
  /reward/i,
  /voucher/i,
  /www\./i,
  /http/i,
  /t\.me/i,
  /telegram/i,
  /discord/i,
  /uniswap\.org/i,
  /pancakeswap/i,
];

const SPAM_SYMBOL_PATTERNS = [
  /\$/i, // Symbols with $ (fake USD tokens)
  /\.com$/i,
  /\.io$/i,
  /claim/i,
  /airdrop/i,
  /free/i,
];

// Known legitimate tokens that might match spam patterns
const WHITELIST_ADDRESSES: Set<string> = new Set([
  // Stablecoins
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC (ETH)
  '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT (ETH)
  '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI (ETH)
  '0x8e870d67f660d95d5be530380d0ec0bd388289e1', // USDP
  // Major tokens
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', // WBTC
  '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', // AAVE
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', // UNI
  '0x514910771af9ca656af840dff83e8264ecf986ca', // LINK
]);

// Check if token name matches spam patterns
function hasSpamName(name: string): string | null {
  for (const pattern of SPAM_NAME_PATTERNS) {
    if (pattern.test(name)) {
      return `Name matches spam pattern: ${pattern.source}`;
    }
  }
  return null;
}

// Check if symbol matches spam patterns
function hasSpamSymbol(symbol: string): string | null {
  for (const pattern of SPAM_SYMBOL_PATTERNS) {
    if (pattern.test(symbol)) {
      return `Symbol matches spam pattern: ${pattern.source}`;
    }
  }
  return null;
}

// Check for suspicious balance patterns
function hasSuspiciousBalance(token: DiscoveredToken): string | null {
  // Extremely large balances with no value often indicate airdrop spam
  const balance = parseFloat(token.balanceFormatted);

  // More than 1 billion tokens with no price = likely spam
  if (balance > 1_000_000_000 && !token.priceUsd) {
    return 'Extremely large balance with no price';
  }

  // Exact round numbers often indicate spam (like exactly 1000.0000)
  if (balance > 100 && balance === Math.floor(balance) && !token.priceUsd) {
    return 'Suspiciously round balance with no price';
  }

  return null;
}

// Check token length (spam often has very long names)
function hasLongName(name: string, symbol: string): string | null {
  if (name.length > 50) {
    return 'Name too long (>50 chars)';
  }
  if (symbol.length > 15) {
    return 'Symbol too long (>15 chars)';
  }
  return null;
}

/**
 * Analyze token and determine if it's spam
 * Returns spamReason if spam, null if legitimate
 */
export function detectSpam(token: DiscoveredToken): string | null {
  // Check whitelist first
  if (WHITELIST_ADDRESSES.has(token.address.toLowerCase())) {
    return null;
  }

  // Run checks (return first reason found)
  const checks = [
    () => hasSpamName(token.name),
    () => hasSpamSymbol(token.symbol),
    () => hasLongName(token.name, token.symbol),
    () => hasSuspiciousBalance(token),
  ];

  for (const check of checks) {
    const reason = check();
    if (reason) {
      return reason;
    }
  }

  return null;
}

/**
 * Filter and classify tokens
 * Marks tokens as spam but doesn't remove them (UI can show/hide)
 */
export function classifyTokens(
  tokens: DiscoveredToken[],
): { classified: DiscoveredToken[]; spamCount: number } {
  let spamCount = 0;

  const classified = tokens.map((token) => {
    const spamReason = detectSpam(token);
    if (spamReason) {
      spamCount++;
      return {
        ...token,
        isSpam: true,
        spamReason,
      };
    }
    return {
      ...token,
      isSpam: false,
    };
  });

  return { classified, spamCount };
}

/**
 * Get non-spam tokens sorted by value
 */
export function getNonSpamTokens(
  tokens: DiscoveredToken[],
  minUsd: number = 0,
): DiscoveredToken[] {
  return tokens
    .filter((t) => !t.isSpam)
    .filter((t) => !minUsd || (t.valueUsd && t.valueUsd >= minUsd))
    .sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));
}
