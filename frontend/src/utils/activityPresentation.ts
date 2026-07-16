/**
 * Canonical activity status/kind/source presentation labels.
 */

import type {
  UnifiedActivityKind,
  UnifiedActivitySource,
  UnifiedActivityStatus,
} from '@/types/unifiedActivity';

const UNRESOLVED: UnifiedActivityStatus[] = ['submitted', 'pending', 'unknown', 'stale'];

export function presentActivityStatus(status: UnifiedActivityStatus): string {
  switch (status) {
    case 'submitted':
      return 'Submitted';
    case 'pending':
      return 'Pending';
    case 'confirmed':
      return 'Confirmed';
    case 'reverted':
      return 'Reverted';
    case 'unknown':
      return 'Status unavailable';
    case 'stale':
      return 'Unresolved';
    default:
      return 'Unknown';
  }
}

export function presentActivityKind(kind: UnifiedActivityKind): string {
  switch (kind) {
    case 'approval':
      return 'Token approval';
    case 'swap':
      return 'Swap';
    case 'transfer':
      return 'Transfer';
    case 'contract-interaction':
      return 'Contract interaction';
    default:
      return 'Transaction';
  }
}

export function presentActivitySource(source: UnifiedActivitySource): string {
  switch (source) {
    case 'journal':
      return 'Kobbex';
    case 'explorer':
      return 'Explorer';
    case 'legacy-transfer':
      return 'This device';
    default:
      return 'Activity';
  }
}

export function activityNeedsAttention(status: UnifiedActivityStatus): boolean {
  return UNRESOLVED.includes(status);
}

export function statusPresentationClass(status: UnifiedActivityStatus): string {
  if (status === 'confirmed') return 'bg-green-900/30 text-green-400';
  if (status === 'reverted') return 'bg-red-900/30 text-red-400';
  if (status === 'unknown' || status === 'stale') return 'bg-amber-900/30 text-amber-300';
  if (status === 'pending' || status === 'submitted') return 'bg-yellow-900/30 text-yellow-400';
  return 'bg-dark-700/80 text-dark-300';
}
