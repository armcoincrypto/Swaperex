/**
 * Token Metadata Store
 *
 * Caches token metadata (name, symbol, logo, price) fetched from DexScreener.
 * Uses localStorage persistence with 1-hour expiry for each entry.
 *
 * Step 1 - Token Metadata Layer
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Cache expiry time (1 hour)
const CACHE_EXPIRY_MS = 60 * 60 * 1000;

export interface TokenMeta {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  logoUrl: string | null;
  priceUsd: number | null;
  priceChange24h: number | null;
  fetchedAt: number;
}

interface TokenMetaState {
  cache: Record<string, TokenMeta>; // key: `${chainId}:${address}`

  // Actions
  setMeta: (meta: TokenMeta) => void;
  getMeta: (chainId: number, address: string) => TokenMeta | null;
  isExpired: (chainId: number, address: string) => boolean;
  clearExpired: () => void;
  clearAll: () => void;
}

// Generate cache key
function getCacheKey(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

export const useTokenMetaStore = create<TokenMetaState>()(
  persist(
    (set, get) => ({
      cache: {},

      setMeta: (meta) => {
        const key = getCacheKey(meta.chainId, meta.address);
        set((s) => ({
          cache: {
            ...s.cache,
            [key]: {
              ...meta,
              address: meta.address.toLowerCase(),
              fetchedAt: Date.now(),
            },
          },
        }));
      },

      getMeta: (chainId, address) => {
        const state = get();
        const key = getCacheKey(chainId, address);
        const meta = state.cache[key];

        if (!meta) return null;

        // Check if expired
        if (Date.now() - meta.fetchedAt > CACHE_EXPIRY_MS) {
          return null;
        }

        return meta;
      },

      isExpired: (chainId, address) => {
        const state = get();
        const key = getCacheKey(chainId, address);
        const meta = state.cache[key];

        if (!meta) return true;
        return Date.now() - meta.fetchedAt > CACHE_EXPIRY_MS;
      },

      clearExpired: () => {
        const state = get();
        const now = Date.now();
        const newCache: Record<string, TokenMeta> = {};

        for (const [key, meta] of Object.entries(state.cache)) {
          if (now - meta.fetchedAt <= CACHE_EXPIRY_MS) {
            newCache[key] = meta;
          }
        }

        set({ cache: newCache });
      },

      clearAll: () => {
        set({ cache: {} });
      },
    }),
    {
      name: 'swaperex-token-meta',
      version: 1,
    }
  )
);

export default useTokenMetaStore;
