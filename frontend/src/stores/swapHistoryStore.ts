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
  /** Quoted output at preview / send time; final settlement may differ slightly */
  toAmount: string;
  /** Minimum output implied by slippage at send time (not parsed from receipt) */
  minimumToAmount?: string;
  txHash: string;
  explorerUrl: string;
  /** Local truth from this app; “uncertain” = verify on explorer before retrying */
  status: 'success' | 'failed' | 'pending' | 'uncertain';
  provider: string;
  slippage: number;
  /** Destination address for transfers */
  toAddress?: string;
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
        set((state) => {
          const idx = state.records.findIndex((r) => r.txHash === record.txHash);
          if (idx >= 0) {
            const prev = state.records[idx];
            const merged: SwapRecord = { ...prev, ...record, id: prev.id };
            const rest = state.records.filter((_, i) => i !== idx);
            return { records: [merged, ...rest].slice(0, MAX_RECORDS) };
          }
          const id = `${record.txHash}-${record.timestamp}`;
          return {
            records: [{ ...record, id }, ...state.records].slice(0, MAX_RECORDS),
          };
        });
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
      version: 2,
      migrate: (persisted) => persisted as SwapHistoryState,
    }
  )
);
