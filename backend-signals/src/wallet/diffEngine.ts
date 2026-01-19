/**
 * Diff Engine
 *
 * Compares current scan results with previous snapshot to detect changes.
 * Detects: added tokens, removed tokens, increased balances, decreased balances.
 * No interpretation - just facts.
 */

import type {
  DiscoveredToken,
  WalletSnapshot,
  TokenSnapshot,
  ScanDiff,
  TokenDelta,
} from './types.js';

/**
 * Format balance change for display
 */
function formatBalanceChange(current: string, previous: string): string {
  try {
    const curr = BigInt(current);
    const prev = BigInt(previous);
    const diff = curr - prev;

    if (diff > 0n) {
      return `+${diff.toString()}`;
    } else {
      return diff.toString();
    }
  } catch {
    return '~';
  }
}

/**
 * Convert DiscoveredToken to TokenDelta
 */
function tokenToDelta(
  token: DiscoveredToken,
  prevSnapshot?: TokenSnapshot,
): TokenDelta {
  const delta: TokenDelta = {
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    logo: token.logo,
    chainId: token.chainId,
    balance: token.balance,
    balanceFormatted: token.balanceFormatted,
    valueUsd: token.valueUsd,
  };

  if (prevSnapshot) {
    delta.prevBalance = prevSnapshot.balance;
    delta.prevValueUsd = prevSnapshot.valueUsd;
    delta.balanceChange = formatBalanceChange(token.balance, prevSnapshot.balance);

    if (token.valueUsd !== undefined && prevSnapshot.valueUsd !== undefined) {
      delta.valueChange = token.valueUsd - prevSnapshot.valueUsd;
    }
  }

  return delta;
}

/**
 * Create TokenDelta from removed token (only have snapshot data)
 */
function snapshotToDelta(snapshot: TokenSnapshot, chainId: number): TokenDelta {
  return {
    address: snapshot.address,
    symbol: snapshot.symbol,
    name: snapshot.symbol, // We don't have full name in snapshot
    chainId,
    balance: '0',
    balanceFormatted: '0',
    valueUsd: 0,
    prevBalance: snapshot.balance,
    prevValueUsd: snapshot.valueUsd,
    balanceChange: `-${snapshot.balance}`,
    valueChange: snapshot.valueUsd ? -snapshot.valueUsd : undefined,
  };
}

/**
 * Compare balances to determine if increased or decreased
 * Returns: 1 (increased), -1 (decreased), 0 (same)
 */
function compareBalances(current: string, previous: string): number {
  try {
    const curr = BigInt(current);
    const prev = BigInt(previous);

    if (curr > prev) return 1;
    if (curr < prev) return -1;
    return 0;
  } catch {
    // If we can't parse, treat as same
    return 0;
  }
}

/**
 * Calculate diff between current scan and previous snapshot
 *
 * @param currentTokens - Current scan result tokens (non-spam only)
 * @param previousSnapshot - Previous snapshot (if exists)
 * @param minUsd - Minimum USD value to include in diff (ignore dust)
 */
export function calculateDiff(
  currentTokens: DiscoveredToken[],
  previousSnapshot: WalletSnapshot | null,
  minUsd: number = 1,
): ScanDiff | null {
  // No previous scan - can't calculate diff
  if (!previousSnapshot) {
    return null;
  }

  const diff: ScanDiff = {
    added: [],
    removed: [],
    increased: [],
    decreased: [],
    previousScanTime: previousSnapshot.timestamp,
  };

  // Create lookup maps
  const currentMap = new Map<string, DiscoveredToken>();
  for (const token of currentTokens) {
    if (!token.isSpam) {
      currentMap.set(token.address.toLowerCase(), token);
    }
  }

  const previousMap = new Map<string, TokenSnapshot>();
  for (const token of previousSnapshot.tokens) {
    previousMap.set(token.address.toLowerCase(), token);
  }

  // Find added and changed tokens
  for (const [address, currentToken] of currentMap) {
    const prevToken = previousMap.get(address);

    // Skip dust (below minUsd)
    const currentValue = currentToken.valueUsd || 0;
    const prevValue = prevToken?.valueUsd || 0;
    const maxValue = Math.max(currentValue, prevValue);

    if (maxValue < minUsd) {
      continue;
    }

    if (!prevToken) {
      // Token is new
      diff.added.push(tokenToDelta(currentToken));
    } else {
      // Token exists in both - check for balance change
      const comparison = compareBalances(currentToken.balance, prevToken.balance);

      if (comparison > 0) {
        diff.increased.push(tokenToDelta(currentToken, prevToken));
      } else if (comparison < 0) {
        diff.decreased.push(tokenToDelta(currentToken, prevToken));
      }
      // If comparison === 0, balance unchanged - don't include
    }
  }

  // Find removed tokens
  for (const [address, prevToken] of previousMap) {
    if (!currentMap.has(address)) {
      // Skip dust
      if ((prevToken.valueUsd || 0) < minUsd) {
        continue;
      }

      diff.removed.push(snapshotToDelta(prevToken, previousSnapshot.chainId));
    }
  }

  // Sort by USD value (highest first)
  const sortByValue = (a: TokenDelta, b: TokenDelta) =>
    (b.valueUsd || 0) - (a.valueUsd || 0);

  diff.added.sort(sortByValue);
  diff.removed.sort((a, b) => (b.prevValueUsd || 0) - (a.prevValueUsd || 0));
  diff.increased.sort(sortByValue);
  diff.decreased.sort(sortByValue);

  return diff;
}

/**
 * Check if diff has any changes
 */
export function hasDiffChanges(diff: ScanDiff | null): boolean {
  if (!diff) return false;

  return (
    diff.added.length > 0 ||
    diff.removed.length > 0 ||
    diff.increased.length > 0 ||
    diff.decreased.length > 0
  );
}
