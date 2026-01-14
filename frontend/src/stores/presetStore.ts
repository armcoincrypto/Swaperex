/**
 * Swap Preset Store
 *
 * Stores user's swap presets per wallet address + chain.
 * Presets allow quick swap setup with optional confirmation skip.
 * Smart Presets can include optional intelligence guards.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AssetInfo } from '@/types/api';

/**
 * Smart Preset Guards
 * Optional conditions that advise or block swap execution
 */
export interface PresetGuards {
  enabled: boolean;
  mode: 'soft' | 'hard'; // soft = advise only, hard = block if fail
  minSafetyScore?: number; // 0-100
  maxPriceImpact?: number; // percentage (e.g., 2.5)
  minLiquidityUsd?: number; // e.g., 50000
}

/**
 * Result of evaluating preset guards
 */
export interface GuardEvaluation {
  passed: boolean;
  warnings: GuardWarning[];
  blocked: boolean;
  blockReason?: string;
}

export interface GuardWarning {
  type: 'safety' | 'impact' | 'liquidity';
  message: string;
  actual: number;
  threshold: number;
}

export interface SwapPreset {
  id: string;
  name: string;
  fromAsset: AssetInfo;
  toAsset: AssetInfo;
  fromAmount: string;
  slippage: number;
  skipConfirmation: boolean;
  createdAt: number;
  lastUsed: number;
  useCount: number; // How many times this preset has been used
  walletAddress: string;
  chainId: number;
  // Smart Preset guards (optional)
  guards?: PresetGuards;
}

interface PresetState {
  presets: SwapPreset[];

  // Actions
  addPreset: (preset: Omit<SwapPreset, 'id' | 'createdAt' | 'lastUsed' | 'useCount'>) => string;
  removePreset: (id: string) => void;
  updatePreset: (id: string, changes: Partial<SwapPreset>) => void;
  getPresetsForWallet: (chainId: number, walletAddress: string) => SwapPreset[];
  markPresetUsed: (id: string) => void;
  toggleSkipConfirmation: (id: string) => void;
  clearPresetsForWallet: (walletAddress: string) => void;
}

// Maximum presets per wallet to prevent localStorage bloat
const MAX_PRESETS_PER_WALLET = 50;

// Generate unique ID
const generateId = () => `preset_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

export const usePresetStore = create<PresetState>()(
  persist(
    (set, get) => ({
      presets: [],

      addPreset: (preset) => {
        const id = generateId();
        const now = Date.now();

        // Check if wallet already has max presets
        const walletPresets = get().presets.filter(
          (p) => p.walletAddress.toLowerCase() === preset.walletAddress.toLowerCase()
        );

        if (walletPresets.length >= MAX_PRESETS_PER_WALLET) {
          // Remove oldest preset for this wallet
          const oldest = walletPresets.sort((a, b) => a.lastUsed - b.lastUsed)[0];
          if (oldest) {
            get().removePreset(oldest.id);
          }
        }

        const newPreset: SwapPreset = {
          ...preset,
          id,
          createdAt: now,
          lastUsed: now,
          useCount: 0,
        };

        set((state) => ({
          presets: [...state.presets, newPreset],
        }));

        return id;
      },

      removePreset: (id) => {
        set((state) => ({
          presets: state.presets.filter((p) => p.id !== id),
        }));
      },

      updatePreset: (id, changes) => {
        set((state) => ({
          presets: state.presets.map((p) =>
            p.id === id ? { ...p, ...changes } : p
          ),
        }));
      },

      getPresetsForWallet: (chainId, walletAddress) => {
        return get()
          .presets.filter(
            (p) =>
              p.chainId === chainId &&
              p.walletAddress.toLowerCase() === walletAddress.toLowerCase()
          )
          .sort((a, b) => b.lastUsed - a.lastUsed); // Most recently used first
      },

      markPresetUsed: (id) => {
        set((state) => ({
          presets: state.presets.map((p) =>
            p.id === id
              ? { ...p, lastUsed: Date.now(), useCount: (p.useCount || 0) + 1 }
              : p
          ),
        }));
      },

      toggleSkipConfirmation: (id) => {
        set((state) => ({
          presets: state.presets.map((p) =>
            p.id === id ? { ...p, skipConfirmation: !p.skipConfirmation } : p
          ),
        }));
      },

      clearPresetsForWallet: (walletAddress) => {
        set((state) => ({
          presets: state.presets.filter(
            (p) => p.walletAddress.toLowerCase() !== walletAddress.toLowerCase()
          ),
        }));
      },
    }),
    {
      name: 'swaperex-swap-presets',
      version: 3,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as { presets: SwapPreset[] };

        if (version < 2) {
          // Migration v1 -> v2: add guards field to existing presets
          return {
            ...state,
            presets: state.presets?.map((p) => ({
              ...p,
              guards: p.guards || undefined,
            })) || [],
          };
        }

        if (version < 3) {
          // Migration v2 -> v3: add useCount field to existing presets
          return {
            ...state,
            presets: state.presets?.map((p) => ({
              ...p,
              useCount: p.useCount || 0,
            })) || [],
          };
        }

        return persistedState;
      },
    }
  )
);

export type { SwapPreset as Preset };
