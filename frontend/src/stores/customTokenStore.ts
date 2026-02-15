/**
 * Custom Token Store
 *
 * Manages user-imported tokens with localStorage persistence.
 * Supports all 9 EVM chains.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Token } from '@/tokens';

// Stable empty array to prevent infinite re-renders when chainId has no custom tokens
const EMPTY_TOKENS: CustomToken[] = [];

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
        1: [],      // Ethereum
        56: [],     // BSC
        137: [],    // Polygon
        42161: [],  // Arbitrum
        10: [],     // Optimism
        43114: [],  // Avalanche
        100: [],    // Gnosis
        250: [],    // Fantom
        8453: [],   // Base
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
        return get().tokens[chainId] || EMPTY_TOKENS;
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
            137: [],
            42161: [],
            10: [],
            43114: [],
            100: [],
            250: [],
            8453: [],
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
