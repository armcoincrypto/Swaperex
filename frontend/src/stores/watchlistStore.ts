/**
 * Watchlist Store
 *
 * Manages user's watched tokens with localStorage persistence.
 * Max 20 tokens. Tokens are auto-monitored for signals.
 *
 * Priority 11.1 - Watchlist + Auto-Monitor
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Maximum tokens in watchlist
const MAX_WATCHLIST_SIZE = 20;

export interface WatchlistEntry {
  chainId: number;
  address: string;
  symbol?: string;
  label?: string;
  addedAt: number;
}

interface WatchlistState {
  tokens: WatchlistEntry[];

  // Actions
  addToken: (entry: Omit<WatchlistEntry, 'addedAt'>) => boolean;
  removeToken: (chainId: number, address: string) => void;
  hasToken: (chainId: number, address: string) => boolean;
  listTokens: () => WatchlistEntry[];
  clear: () => void;
  updateSymbol: (chainId: number, address: string, symbol: string) => void;
}

// Normalize address to lowercase
function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
      tokens: [],

      addToken: (entry) => {
        const state = get();
        const normalizedAddress = normalizeAddress(entry.address);

        // Check if already at max
        if (state.tokens.length >= MAX_WATCHLIST_SIZE) {
          console.warn('[Watchlist] Max size reached (20 tokens)');
          return false;
        }

        // Check if already exists
        const exists = state.tokens.some(
          (t) => t.chainId === entry.chainId && t.address === normalizedAddress
        );

        if (exists) {
          console.log('[Watchlist] Token already in watchlist');
          return false;
        }

        // Add new entry
        const newEntry: WatchlistEntry = {
          ...entry,
          address: normalizedAddress,
          addedAt: Date.now(),
        };

        set((s) => ({
          tokens: [newEntry, ...s.tokens],
        }));

        console.log('[Watchlist] Token added:', normalizedAddress);
        return true;
      },

      removeToken: (chainId, address) => {
        const normalizedAddress = normalizeAddress(address);
        set((s) => ({
          tokens: s.tokens.filter(
            (t) => !(t.chainId === chainId && t.address === normalizedAddress)
          ),
        }));
        console.log('[Watchlist] Token removed:', normalizedAddress);
      },

      hasToken: (chainId, address) => {
        const state = get();
        const normalizedAddress = normalizeAddress(address);
        return state.tokens.some(
          (t) => t.chainId === chainId && t.address === normalizedAddress
        );
      },

      listTokens: () => {
        const state = get();
        // Return newest first (already sorted by addedAt desc since we prepend)
        return [...state.tokens];
      },

      clear: () => {
        set({ tokens: [] });
        console.log('[Watchlist] Cleared');
      },

      updateSymbol: (chainId, address, symbol) => {
        const normalizedAddress = normalizeAddress(address);
        set((s) => ({
          tokens: s.tokens.map((t) =>
            t.chainId === chainId && t.address === normalizedAddress
              ? { ...t, symbol }
              : t
          ),
        }));
      },
    }),
    {
      name: 'swaperex-watchlist',
      version: 1,
    }
  )
);

// Helper to get chain name
export function getChainName(chainId: number): string {
  switch (chainId) {
    case 1:
      return 'ETH';
    case 56:
      return 'BSC';
    case 8453:
      return 'Base';
    case 42161:
      return 'ARB';
    default:
      return `Chain ${chainId}`;
  }
}

// Helper to format address
export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default useWatchlistStore;
