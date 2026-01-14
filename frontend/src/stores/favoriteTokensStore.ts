/**
 * Favorite Tokens Store
 *
 * Stores user's favorite tokens per chain in localStorage.
 * Favorites are shown at the top of token selector.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FavoriteToken {
  symbol: string;
  address: string;
  name: string;
  chainId: number;
  addedAt: number;
}

interface FavoriteTokensState {
  favorites: FavoriteToken[];

  // Actions
  addFavorite: (token: Omit<FavoriteToken, 'addedAt'>) => void;
  removeFavorite: (chainId: number, address: string) => void;
  isFavorite: (chainId: number, address: string) => boolean;
  getFavoritesForChain: (chainId: number) => FavoriteToken[];
  toggleFavorite: (token: Omit<FavoriteToken, 'addedAt'>) => void;
  clearFavorites: () => void;
}

export const useFavoriteTokensStore = create<FavoriteTokensState>()(
  persist(
    (set, get) => ({
      favorites: [],

      addFavorite: (token) => {
        const existing = get().favorites.find(
          (f) => f.chainId === token.chainId && f.address.toLowerCase() === token.address.toLowerCase()
        );

        if (existing) return; // Already a favorite

        set((state) => ({
          favorites: [
            ...state.favorites,
            { ...token, addedAt: Date.now() },
          ],
        }));
      },

      removeFavorite: (chainId, address) => {
        set((state) => ({
          favorites: state.favorites.filter(
            (f) => !(f.chainId === chainId && f.address.toLowerCase() === address.toLowerCase())
          ),
        }));
      },

      isFavorite: (chainId, address) => {
        return get().favorites.some(
          (f) => f.chainId === chainId && f.address.toLowerCase() === address.toLowerCase()
        );
      },

      getFavoritesForChain: (chainId) => {
        return get().favorites
          .filter((f) => f.chainId === chainId)
          .sort((a, b) => a.addedAt - b.addedAt); // Oldest first (stable order)
      },

      toggleFavorite: (token) => {
        const isFav = get().isFavorite(token.chainId, token.address);
        if (isFav) {
          get().removeFavorite(token.chainId, token.address);
        } else {
          get().addFavorite(token);
        }
      },

      clearFavorites: () => {
        set({ favorites: [] });
      },
    }),
    {
      name: 'swaperex-favorite-tokens',
      version: 1,
    }
  )
);

export type { FavoriteToken };
