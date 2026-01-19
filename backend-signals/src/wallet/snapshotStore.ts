/**
 * Snapshot Store
 *
 * Simple file-based storage for wallet scan snapshots.
 * Keeps last N=2 snapshots per wallet+chain for diff calculation.
 * Uses JSONL format for append-only writes.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { WalletSnapshot, TokenSnapshot, DiscoveredToken } from './types.js';

// Configuration
const DATA_DIR = process.env.SNAPSHOT_DATA_DIR || join(process.cwd(), 'data');
const SNAPSHOTS_FILE = join(DATA_DIR, 'wallet-snapshots.json');
const MAX_SNAPSHOTS_PER_WALLET = 2;

// In-memory cache of snapshots (loaded on first access)
let snapshotsCache: Map<string, WalletSnapshot[]> | null = null;

/**
 * Generate storage key for wallet+chain
 */
function getSnapshotKey(wallet: string, chainId: number): string {
  return `${chainId}:${wallet.toLowerCase()}`;
}

/**
 * Ensure data directory exists
 */
async function ensureDataDir(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

/**
 * Load snapshots from disk into cache
 */
async function loadSnapshots(): Promise<Map<string, WalletSnapshot[]>> {
  if (snapshotsCache !== null) {
    return snapshotsCache;
  }

  await ensureDataDir();

  if (!existsSync(SNAPSHOTS_FILE)) {
    snapshotsCache = new Map();
    return snapshotsCache;
  }

  try {
    const content = await readFile(SNAPSHOTS_FILE, 'utf8');
    const data = JSON.parse(content) as Record<string, WalletSnapshot[]>;
    snapshotsCache = new Map(Object.entries(data));
  } catch (err) {
    console.warn('[SnapshotStore] Failed to load snapshots, starting fresh:', err);
    snapshotsCache = new Map();
  }

  return snapshotsCache;
}

/**
 * Save snapshots to disk
 */
async function saveSnapshots(): Promise<void> {
  if (!snapshotsCache) return;

  await ensureDataDir();

  try {
    const data: Record<string, WalletSnapshot[]> = {};
    for (const [key, snapshots] of snapshotsCache.entries()) {
      data[key] = snapshots;
    }
    await writeFile(SNAPSHOTS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[SnapshotStore] Failed to save snapshots:', err);
  }
}

/**
 * Convert DiscoveredToken to minimal TokenSnapshot
 */
function tokenToSnapshot(token: DiscoveredToken): TokenSnapshot {
  return {
    address: token.address.toLowerCase(),
    symbol: token.symbol,
    balance: token.balance,
    valueUsd: token.valueUsd,
  };
}

/**
 * Get previous snapshot for wallet+chain (if exists)
 */
export async function getPreviousSnapshot(
  wallet: string,
  chainId: number,
): Promise<WalletSnapshot | null> {
  const cache = await loadSnapshots();
  const key = getSnapshotKey(wallet, chainId);
  const snapshots = cache.get(key);

  if (!snapshots || snapshots.length === 0) {
    return null;
  }

  // Return the most recent snapshot (which will become "previous" after we save new one)
  return snapshots[snapshots.length - 1];
}

/**
 * Save new snapshot for wallet+chain
 * Keeps only last N snapshots
 */
export async function saveSnapshot(
  wallet: string,
  chainId: number,
  tokens: DiscoveredToken[],
): Promise<void> {
  const cache = await loadSnapshots();
  const key = getSnapshotKey(wallet, chainId);

  // Create new snapshot with only non-spam tokens
  const snapshot: WalletSnapshot = {
    wallet: wallet.toLowerCase(),
    chainId,
    timestamp: Date.now(),
    tokens: tokens
      .filter((t) => !t.isSpam)
      .map(tokenToSnapshot),
  };

  // Get existing snapshots or create new array
  const existing = cache.get(key) || [];

  // Add new snapshot and keep only last N
  existing.push(snapshot);
  while (existing.length > MAX_SNAPSHOTS_PER_WALLET) {
    existing.shift();
  }

  cache.set(key, existing);

  // Persist to disk
  await saveSnapshots();
}

/**
 * Clear all snapshots (for testing)
 */
export async function clearAllSnapshots(): Promise<void> {
  snapshotsCache = new Map();
  await saveSnapshots();
}

/**
 * Get snapshot stats (for debugging)
 */
export async function getSnapshotStats(): Promise<{
  totalWallets: number;
  totalSnapshots: number;
}> {
  const cache = await loadSnapshots();
  let totalSnapshots = 0;

  for (const snapshots of cache.values()) {
    totalSnapshots += snapshots.length;
  }

  return {
    totalWallets: cache.size,
    totalSnapshots,
  };
}
