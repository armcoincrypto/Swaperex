/**
 * Custom Token Store
 *
 * Manages user-imported tokens with localStorage persistence.
 * Supports ETH (chain 1) and BSC (chain 56).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Token } from '@/tokens';

// Custom token extends Token with additional safety metadata
export interface CustomToken extends Token {
  chainId: number;
  isCustom: true;
  addedAt: number;  // Timestamp when token was added
  verified: boolean;  // Has liquidity pool
  totalSupply?: string;
  warning?: string;  // Risk warning message
}

interface CustomTokenState {
  // Tokens stored by chainId
  tokens: Record<number, CustomToken[]>;

  // Actions
  addToken: (token: CustomToken) => void;
  removeToken: (chainId: number, address: string) => void;
  getTokens: (chainId: number) => CustomToken[];
  hasToken: (chainId: number, address: string) => boolean;
  clearChain: (chainId: number) => void;
  clearAll: () => void;
}

export const useCustomTokenStore = create<CustomTokenState>()(
  persist(
    (set, get) => ({
      tokens: {
        1: [],   // Ethereum
        56: [],  // BSC
      },

      addToken: (token: CustomToken) => {
        const { tokens } = get();
        const chainTokens = tokens[token.chainId] || [];

        // Check if already exists
        const exists = chainTokens.some(
          t => t.address.toLowerCase() === token.address.toLowerCase()
        );

        if (!exists) {
          set({
            tokens: {
              ...tokens,
              [token.chainId]: [...chainTokens, token],
            },
          });
        }
      },

      removeToken: (chainId: number, address: string) => {
        const { tokens } = get();
        const chainTokens = tokens[chainId] || [];

        set({
          tokens: {
            ...tokens,
            [chainId]: chainTokens.filter(
              t => t.address.toLowerCase() !== address.toLowerCase()
            ),
          },
        });
      },

      getTokens: (chainId: number) => {
        return get().tokens[chainId] || [];
      },

      hasToken: (chainId: number, address: string) => {
        const chainTokens = get().tokens[chainId] || [];
        return chainTokens.some(
          t => t.address.toLowerCase() === address.toLowerCase()
        );
      },

      clearChain: (chainId: number) => {
        const { tokens } = get();
        set({
          tokens: {
            ...tokens,
            [chainId]: [],
          },
        });
      },

      clearAll: () => {
        set({
          tokens: {
            1: [],
            56: [],
          },
        });
      },
    }),
    {
      name: 'swaperex-custom-tokens',
      version: 1,
    }
  )
);

export default useCustomTokenStore;
