/**
 * Mute Store
 *
 * Manages muted tokens and signal types with localStorage persistence.
 * Muted items are excluded from alerts but still shown in history.
 *
 * Priority P1-6 - Mute Controls
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { normalizeAddressLower } from '@/utils/address';

export type SignalType = 'liquidity' | 'risk';

interface MuteState {
  /** Muted tokens by key: "chainId:address" */
  mutedTokens: Record<string, { symbol?: string; mutedAt: number }>;

  /** Muted signal types */
  mutedTypes: Record<SignalType, boolean>;

  // Token mute actions
  muteToken: (chainId: number, address: string, symbol?: string) => void;
  unmuteToken: (chainId: number, address: string) => void;
  isTokenMuted: (chainId: number, address: string) => boolean;
  getMutedTokens: () => Array<{ chainId: number; address: string; symbol?: string; mutedAt: number }>;

  // Signal type mute actions
  muteType: (type: SignalType) => void;
  unmuteType: (type: SignalType) => void;
  isTypeMuted: (type: SignalType) => boolean;

  // Clear all
  clearAllMutes: () => void;
}

/** Create token key for storage */
function tokenKey(chainId: number, address: string): string {
  return `${chainId}:${normalizeAddressLower(address)}`;
}

export const useMuteStore = create<MuteState>()(
  persist(
    (set, get) => ({
      mutedTokens: {},
      mutedTypes: {
        liquidity: false,
        risk: false,
      },

      muteToken: (chainId, address, symbol) => {
        const key = tokenKey(chainId, address);
        set((s) => ({
          mutedTokens: {
            ...s.mutedTokens,
            [key]: { symbol, mutedAt: Date.now() },
          },
        }));
      },

      unmuteToken: (chainId, address) => {
        const key = tokenKey(chainId, address);
        set((s) => {
          const { [key]: _, ...rest } = s.mutedTokens;
          return { mutedTokens: rest };
        });
      },

      isTokenMuted: (chainId, address) => {
        const key = tokenKey(chainId, address);
        return !!get().mutedTokens[key];
      },

      getMutedTokens: () => {
        const { mutedTokens } = get();
        return Object.entries(mutedTokens).map(([key, data]) => {
          const [chainIdStr, address] = key.split(':');
          return {
            chainId: parseInt(chainIdStr, 10),
            address,
            symbol: data.symbol,
            mutedAt: data.mutedAt,
          };
        });
      },

      muteType: (type) => {
        set((s) => ({
          mutedTypes: { ...s.mutedTypes, [type]: true },
        }));
      },

      unmuteType: (type) => {
        set((s) => ({
          mutedTypes: { ...s.mutedTypes, [type]: false },
        }));
      },

      isTypeMuted: (type) => {
        return get().mutedTypes[type] || false;
      },

      clearAllMutes: () => {
        set({
          mutedTokens: {},
          mutedTypes: { liquidity: false, risk: false },
        });
      },
    }),
    {
      name: 'swaperex-mutes',
      version: 1,
    }
  )
);

/**
 * Check if a signal should be muted
 */
export function shouldMuteSignal(
  chainId: number,
  address: string,
  type: 'liquidity' | 'risk'
): boolean {
  const state = useMuteStore.getState();
  return state.isTokenMuted(chainId, address) || state.isTypeMuted(type);
}

export default useMuteStore;
