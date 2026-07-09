/**
 * P4.1-D — Soft wrapper route precheck (UX confidence only).
 * Does not gate execution; quotes and commission enforcement remain authoritative.
 */

import { isCommissionPairAuditSupported } from '@/constants/commissionCoverage';
import type { RouteSupportStatus } from '@/utils/routeSupport';

export const RECENT_SUCCESSFUL_PAIRS_KEY = 'swaperex-recent-successful-pairs';

export type RoutePrecheckStatus =
  | 'likely_routable'
  | 'limited'
  | 'no_recent_success'
  | 'unknown'
  | 'checking';

export type RecentSuccessfulPair = {
  chainId: number;
  fromSymbol: string;
  toSymbol: string;
  provider: string;
  txHash: string;
  timestamp: number;
};

type StoredRecent = {
  v: 1;
  entries: RecentSuccessfulPair[];
};

const SCHEMA: StoredRecent['v'] = 1;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 80;

function readStored(): StoredRecent {
  if (typeof localStorage === 'undefined') return { v: SCHEMA, entries: [] };
  try {
    const raw = localStorage.getItem(RECENT_SUCCESSFUL_PAIRS_KEY);
    if (!raw) return { v: SCHEMA, entries: [] };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return { v: SCHEMA, entries: [] };
    const p = parsed as Partial<StoredRecent>;
    if (p.v !== 1 || !Array.isArray(p.entries)) return { v: SCHEMA, entries: [] };
    const now = Date.now();
    const entries = p.entries
      .filter(
        (e): e is RecentSuccessfulPair =>
          !!e &&
          typeof e === 'object' &&
          typeof (e as RecentSuccessfulPair).chainId === 'number' &&
          typeof (e as RecentSuccessfulPair).fromSymbol === 'string' &&
          typeof (e as RecentSuccessfulPair).toSymbol === 'string' &&
          typeof (e as RecentSuccessfulPair).provider === 'string' &&
          typeof (e as RecentSuccessfulPair).txHash === 'string' &&
          typeof (e as RecentSuccessfulPair).timestamp === 'number',
      )
      .filter((e) => now - e.timestamp <= TTL_MS);
    return { v: SCHEMA, entries };
  } catch {
    return { v: SCHEMA, entries: [] };
  }
}

function writeStored(data: StoredRecent): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(RECENT_SUCCESSFUL_PAIRS_KEY, JSON.stringify(data));
  } catch {
    // quota / private mode
  }
}

/** Recent successful swap pairs for this browser session only (7-day TTL). */
export function readRecentSuccessfulPairs(): RecentSuccessfulPair[] {
  return readStored().entries;
}

function normSym(s: string): string {
  return s.trim().toUpperCase();
}

/** True if this exact direction was observed successful in the retention window. */
export function hasRecentSuccessfulPair(chainId: number, fromSymbol: string, toSymbol: string): boolean {
  const f = normSym(fromSymbol);
  const t = normSym(toSymbol);
  const now = Date.now();
  return readStored().entries.some(
    (e) =>
      e.chainId === chainId &&
      normSym(e.fromSymbol) === f &&
      normSym(e.toSymbol) === t &&
      now - e.timestamp <= TTL_MS,
  );
}

/** Append a successful swap pair (dedupe same chain + direction + symbols, newest wins). */
export function recordSuccessfulSwapPair(entry: RecentSuccessfulPair): void {
  const row: RecentSuccessfulPair = {
    ...entry,
    fromSymbol: normSym(entry.fromSymbol),
    toSymbol: normSym(entry.toSymbol),
    timestamp: entry.timestamp,
  };
  const { entries } = readStored();
  const filtered = entries.filter(
    (e) =>
      !(
        e.chainId === row.chainId &&
        normSym(e.fromSymbol) === row.fromSymbol &&
        normSym(e.toSymbol) === row.toSymbol
      ),
  );
  const next: RecentSuccessfulPair[] = [row, ...filtered].slice(0, MAX_ENTRIES);
  writeStored({ v: SCHEMA, entries: next });
}

export type RoutePrecheckAsset = {
  symbol: string;
  contract_address?: string | null;
  isCustom?: boolean;
  /** Display-only hint for native ↔ wrapped detection (P2.1). */
  is_native?: boolean;
} | null;

export function computeRoutePrecheck(input: {
  chainId: number;
  fromAsset: RoutePrecheckAsset;
  toAsset: RoutePrecheckAsset;
  fromRouteSupport: RouteSupportStatus;
  toRouteSupport: RouteSupportStatus;
}): RoutePrecheckStatus {
  const { chainId, fromAsset, toAsset, fromRouteSupport, toRouteSupport } = input;

  if (!fromAsset || !toAsset) return 'checking';

  const fs = fromAsset.symbol?.trim() ?? '';
  const ts = toAsset.symbol?.trim() ?? '';
  if (!fs || !ts) return 'checking';

  if (normSym(fs) === normSym(ts)) return 'unknown';

  if (fromAsset.isCustom === true || toAsset.isCustom === true) return 'unknown';

  if (isCommissionPairAuditSupported(chainId, fs, ts)) {
    return 'likely_routable';
  }

  if (fromRouteSupport === 'unknown' || toRouteSupport === 'unknown') return 'unknown';

  if (fromRouteSupport === 'limited' || toRouteSupport === 'limited') return 'limited';

  const good = (r: RouteSupportStatus) => r === 'supported' || r === 'likely_supported';
  if (!good(fromRouteSupport) || !good(toRouteSupport)) return 'unknown';

  if (fromRouteSupport === 'supported' && toRouteSupport === 'supported') {
    return 'likely_routable';
  }

  if (hasRecentSuccessfulPair(chainId, fs, ts)) {
    return 'likely_routable';
  }

  return 'no_recent_success';
}

export function getRoutePrecheckBadgeLabel(status: RoutePrecheckStatus): string {
  switch (status) {
    case 'likely_routable':
      return 'Audited route available';
    case 'limited':
      return 'Route depends on live liquidity';
    case 'no_recent_success':
      return 'No recent route';
    case 'checking':
      return 'Checking…';
    default:
      return 'Unknown route';
  }
}

export function getRoutePrecheckDescription(status: RoutePrecheckStatus): string {
  switch (status) {
    case 'likely_routable':
      return 'Audited wrapper route available. Final quote depends on live liquidity.';
    case 'limited':
      return 'Route depends on live liquidity. This pair may not quote through Swaperex commission routing.';
    case 'no_recent_success':
      return 'No recent successful wrapper route seen for this pair.';
    case 'checking':
      return 'Checking route confidence…';
    default:
      return 'Route support unknown. Quote may fail.';
  }
}

export function routePrecheckBadgeClass(status: RoutePrecheckStatus): string {
  switch (status) {
    case 'likely_routable':
      return 'bg-emerald-900/30 text-emerald-100/95 border-emerald-700/30';
    case 'limited':
      return 'bg-amber-900/25 text-amber-100/90 border-amber-700/35';
    case 'no_recent_success':
      return 'bg-slate-800/80 text-slate-200 border-white/[0.08]';
    case 'checking':
      return 'bg-dark-600/60 text-dark-400 border-white/[0.06]';
    default:
      return 'bg-dark-600/70 text-dark-400 border-white/[0.08]';
  }
}
