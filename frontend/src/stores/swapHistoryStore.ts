/**
 * Swap History Store
 *
 * Stores local swap history with full token details for Quick Repeat.
 * Complements blockchain-sourced history with actual swap parameters.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AssetInfo } from '@/types/api';

export interface SwapRecord {
  id: string;
  timestamp: number;
  chainId: number;
  fromAsset: AssetInfo;
  toAsset: AssetInfo;
  fromAmount: string;
  toAmount: string;
  txHash: string;
  explorerUrl: string;
  status: 'success' | 'failed' | 'pending';
  provider: string;
  slippage: number;
}

interface SwapHistoryState {
  records: SwapRecord[];

  // Actions
  addRecord: (record: Omit<SwapRecord, 'id'>) => void;
  updateRecordStatus: (txHash: string, status: SwapRecord['status']) => void;
  getRecordsForChain: (chainId: number) => SwapRecord[];
  getRecentRecords: (limit?: number) => SwapRecord[];
  clearHistory: () => void;
}

// Maximum records to keep
const MAX_RECORDS = 100;

export const useSwapHistoryStore = create<SwapHistoryState>()(
  persist(
    (set, get) => ({
      records: [],

      addRecord: (record) => {
        const id = `${record.txHash}-${record.timestamp}`;

        // Check if already exists (by txHash)
        const existing = get().records.find((r) => r.txHash === record.txHash);
        if (existing) return;

        set((state) => ({
          records: [
            { ...record, id },
            ...state.records,
          ].slice(0, MAX_RECORDS), // Keep only most recent
        }));
      },

      updateRecordStatus: (txHash, status) => {
        set((state) => ({
          records: state.records.map((r) =>
            r.txHash === txHash ? { ...r, status } : r
          ),
        }));
      },

      getRecordsForChain: (chainId) => {
        return get().records.filter((r) => r.chainId === chainId);
      },

      getRecentRecords: (limit = 10) => {
        return get().records.slice(0, limit);
      },

      clearHistory: () => {
        set({ records: [] });
      },
    }),
    {
      name: 'swaperex-swap-history',
      version: 1,
    }
  )
);
