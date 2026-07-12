/**
 * Safe deduplication for unified activity items.
 * Identity: chainId + kind + transactionHash (lowercase).
 */

import type { UnifiedActivityItem } from '@/types/unifiedActivity';

const SOURCE_RANK: Record<UnifiedActivityItem['source'], number> = {
  journal: 3,
  explorer: 2,
  'legacy-transfer': 1,
};

const TERMINAL = new Set<UnifiedActivityItem['status']>(['confirmed', 'reverted']);

export function unifiedActivityDedupeKey(item: UnifiedActivityItem): string {
  return `${item.chainId}:${item.kind}:${item.transactionHash.toLowerCase()}`;
}

function isStronger(existing: UnifiedActivityItem, incoming: UnifiedActivityItem): boolean {
  const existingRank = SOURCE_RANK[existing.source];
  const incomingRank = SOURCE_RANK[incoming.source];
  if (incomingRank > existingRank) return true;
  if (incomingRank < existingRank) return false;

  if (TERMINAL.has(incoming.status) && !TERMINAL.has(existing.status)) return true;
  if (TERMINAL.has(existing.status) && !TERMINAL.has(incoming.status)) return false;

  return incoming.ts >= existing.ts;
}

export function dedupeUnifiedActivityItems(items: UnifiedActivityItem[]): UnifiedActivityItem[] {
  const byKey = new Map<string, UnifiedActivityItem>();

  for (const item of items) {
    if (!item.transactionHash) continue;
    const key = unifiedActivityDedupeKey(item);
    const prev = byKey.get(key);
    if (!prev || isStronger(prev, item)) {
      byKey.set(key, item);
    }
  }

  return [...byKey.values()].sort((a, b) => b.ts - a.ts);
}
